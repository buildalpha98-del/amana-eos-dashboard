"use client";

/**
 * OnboardingRequestsPanel — the Team tab's Onboarding sub-tab body.
 * Leadership-only (owner/head_office/admin). A state manager/admin/owner
 * submits a new hire's details; submitting immediately creates the real
 * account, seeds their onboarding pack, and emails them an invite — see
 * POST /api/onboarding-requests. This panel is a history of who's been
 * onboarded that way, not a queue to work.
 *
 * 2026-09-14: it now also reports whether each invite actually arrived.
 * A suppressed address or a provider rejection used to be indistinguishable
 * from a successful send, so the one case that mattered — the new hire
 * never got their login — looked exactly like the happy path.
 */

import { useState } from "react";
import { Plus, UserPlus, CheckCircle2, AlertTriangle, Loader2, Mail } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { AWARD_LEVEL_LABELS } from "@/components/contracts/constants";
import { NewStarterRequestModal } from "./NewStarterRequestModal";
import {
  useOnboardingRequests,
  useResendOnboardingInvite,
  type NewStarterRequestItem,
} from "@/hooks/useOnboardingRequests";

const QUALIFICATION_LABELS: Record<string, string> = {
  cert_iii: "Certificate III",
  diploma: "Diploma",
  bachelor: "Bachelor's degree",
  masters: "Master's degree",
  first_aid: "First aid",
  wwcc: "WWCC",
  other: "Other",
};

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  casual: "Casual",
  part_time: "Part-Time",
  permanent: "Permanent",
  fixed_term: "Fixed Term",
};

export function OnboardingRequestsPanel({
  services,
}: {
  services: Array<{ id: string; name: string }>;
}) {
  const { data, isLoading, error, refetch } = useOnboardingRequests();
  const [showNewRequest, setShowNewRequest] = useState(false);

  const requests = data?.requests ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-heading font-semibold text-foreground">Onboarding</h2>
          <p className="text-sm text-muted mt-0.5">
            Add a new hire&apos;s details and their account is created, their onboarding pack is
            assigned, and their dashboard invite is emailed straight away.
          </p>
        </div>
        <Button onClick={() => setShowNewRequest(true)}>
          <Plus className="w-4 h-4" />
          New starter
        </Button>
      </div>

      {error ? (
        <ErrorState title="Failed to load onboarding history" error={error as Error} onRetry={refetch} />
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="No new starters yet"
          description="New starters onboarded here will show up in this history."
          variant="inline"
        />
      ) : (
        <div className="space-y-2">
          {requests.map((r) => (
            <RequestCard key={r.id} request={r} />
          ))}
        </div>
      )}

      {showNewRequest && (
        <NewStarterRequestModal
          open={showNewRequest}
          onClose={() => setShowNewRequest(false)}
          services={services}
        />
      )}
    </div>
  );
}

function RequestCard({ request }: { request: NewStarterRequestItem }) {
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium text-foreground">{request.fullName}</h3>
            {request.completedUser && (
              <Link
                href={`/staff/${request.completedUser.id}`}
                className="text-xs text-brand hover:underline"
              >
                View profile
              </Link>
            )}
          </div>
          <p className="text-sm text-muted mt-0.5">
            {request.targetPosition} · {request.service.name} ·{" "}
            {EMPLOYMENT_TYPE_LABELS[request.employmentType]}
          </p>
          <p className="text-xs text-muted mt-1">
            {request.awardLevel ? (
              <>
                {AWARD_LEVEL_LABELS[request.awardLevel] ?? request.awardLevel}
                {request.awardLevelCustom ? ` (${request.awardLevelCustom})` : ""}
                {" · "}
              </>
            ) : null}
            {request.qualification
              ? `${QUALIFICATION_LABELS[request.qualification] ?? request.qualification} · `
              : ""}
            {"Started "}
            {new Date(request.expectedStartDate).toLocaleDateString("en-AU")}
          </p>
          {request.notes ? <p className="text-xs text-muted mt-1 italic">{request.notes}</p> : null}
          <p className="text-2xs text-muted mt-2">
            Onboarded by {request.requestedBy.name}
            {request.inviteStatus === "sent" || request.inviteStatus === null
              ? ` · Invite sent to ${request.email}`
              : ` · ${request.email}`}
          </p>
          <InviteStatusNotice request={request} />
        </div>
        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
      </div>
    </div>
  );
}

/**
 * Delivery banner for a failed invite.
 *
 * Renders nothing on the happy path and nothing for rows submitted before
 * invite tracking existed (inviteStatus null) — a legacy row genuinely
 * doesn't know, and claiming failure would be as wrong as the old code
 * claiming success.
 */
function InviteStatusNotice({ request }: { request: NewStarterRequestItem }) {
  const resend = useResendOnboardingInvite();
  const status = request.inviteStatus;

  if (!status || status === "sent") return null;

  const headline =
    status === "suppressed"
      ? "Invite blocked — this address is on the suppression list"
      : status === "not_configured"
        ? "Invite not sent — email isn't configured on this environment"
        : "Invite didn't send";

  return (
    <div className="mt-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-2.5">
      <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 flex items-start gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        {headline}
      </p>
      {request.inviteError && (
        <p className="text-2xs text-amber-800/90 dark:text-amber-200/90 mt-1">
          {request.inviteError}
        </p>
      )}
      <p className="text-2xs text-amber-800/90 dark:text-amber-200/90 mt-1">
        {request.fullName} can&apos;t log in until this is sorted. Resending
        issues a new temporary password — the previous one stops working.
      </p>
      <Button
        variant="secondary"
        size="xs"
        className="mt-2"
        loading={resend.isPending}
        iconLeft={<Mail className="w-3.5 h-3.5" />}
        onClick={() => resend.mutate(request.id)}
      >
        {resend.isPending ? "Resending…" : "Resend invite"}
      </Button>
    </div>
  );
}
