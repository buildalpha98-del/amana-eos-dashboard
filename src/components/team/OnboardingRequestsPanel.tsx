"use client";

/**
 * OnboardingRequestsPanel — the Team tab's Onboarding sub-tab body.
 * Leadership-only (owner/head_office/admin). Lists NewStarterRequest
 * tickets a state manager/admin/owner raised; admin claims and completes
 * them once the actual account is created via "Add staff member".
 */

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Plus, UserPlus, Ban, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { AWARD_LEVEL_LABELS } from "@/components/contracts/constants";
import { NewStarterRequestModal } from "./NewStarterRequestModal";
import { AddStaffModal } from "./AddStaffModal";
import {
  useOnboardingRequests,
  useUpdateOnboardingRequest,
  type NewStarterRequestItem,
} from "@/hooks/useOnboardingRequests";
import type { Role } from "@prisma/client";

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

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-800",
  in_progress: "bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-200 border-blue-300 dark:border-blue-800",
  completed: "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800",
  cancelled: "bg-surface text-foreground/80 border-border",
};

export function OnboardingRequestsPanel({
  services,
}: {
  services: Array<{ id: string; name: string }>;
}) {
  const { data: session } = useSession();
  const { data, isLoading, error, refetch } = useOnboardingRequests();
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [addStaffFor, setAddStaffFor] = useState<NewStarterRequestItem | null>(null);

  const requests = data?.requests ?? [];
  const viewerRole = (session?.user?.role ?? "staff") as Role;
  const completeMutation = useUpdateOnboardingRequest(addStaffFor?.id ?? "");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-heading font-semibold text-foreground">Onboarding requests</h2>
          <p className="text-sm text-muted mt-0.5">
            Flagged by state managers, admins, and owners for a new hire. Claim one, create the
            account, then mark it complete.
          </p>
        </div>
        <Button onClick={() => setShowNewRequest(true)}>
          <Plus className="w-4 h-4" />
          New request
        </Button>
      </div>

      {error ? (
        <ErrorState title="Failed to load onboarding requests" error={error as Error} onRetry={refetch} />
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="No onboarding requests"
          description="Requests raised for a new hire will show up here."
          variant="inline"
        />
      ) : (
        <div className="space-y-2">
          {requests.map((r) => (
            <RequestCard
              key={r.id}
              request={r}
              viewerId={session?.user?.id ?? ""}
              onCreateAccount={() => setAddStaffFor(r)}
            />
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

      {addStaffFor && (
        <AddStaffModal
          open={!!addStaffFor}
          onClose={() => setAddStaffFor(null)}
          services={services}
          currentUserRole={viewerRole}
          initialValues={{
            name: addStaffFor.fullName,
            serviceId: addStaffFor.service.id,
            newStarter: true,
            startDate: addStaffFor.expectedStartDate.slice(0, 10),
          }}
          onCreated={(userId) => {
            completeMutation.mutate(
              { markCompleted: true, completedUserId: userId },
              { onSuccess: () => refetch() },
            );
            setAddStaffFor(null);
          }}
        />
      )}
    </div>
  );
}

function RequestCard({
  request,
  viewerId,
  onCreateAccount,
}: {
  request: NewStarterRequestItem;
  viewerId: string;
  onCreateAccount: () => void;
}) {
  const update = useUpdateOnboardingRequest(request.id);
  const isOpen = request.status === "pending" || request.status === "in_progress";
  const claimedByMe = request.assignedAdmin?.id === viewerId;

  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium text-foreground">{request.fullName}</h3>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0 text-2xs font-bold uppercase tracking-wide ${STATUS_TONE[request.status]}`}
            >
              {request.status.replace("_", " ")}
            </span>
          </div>
          <p className="text-sm text-muted mt-0.5">
            {request.targetPosition} · {request.service.name} ·{" "}
            {EMPLOYMENT_TYPE_LABELS[request.employmentType]}
          </p>
          <p className="text-xs text-muted mt-1">
            {AWARD_LEVEL_LABELS[request.awardLevel] ?? request.awardLevel}
            {request.awardLevelCustom ? ` (${request.awardLevelCustom})` : ""}
            {" · "}
            {request.qualification ? QUALIFICATION_LABELS[request.qualification] : "No qualification yet"}
            {" · Starting "}
            {new Date(request.expectedStartDate).toLocaleDateString("en-AU")}
          </p>
          {request.notes ? <p className="text-xs text-muted mt-1 italic">{request.notes}</p> : null}
          <p className="text-2xs text-muted mt-2">
            Requested by {request.requestedBy.name}
            {request.assignedAdmin ? ` · Claimed by ${request.assignedAdmin.name}` : ""}
            {request.completedBy ? ` · Completed by ${request.completedBy.name}` : ""}
          </p>
        </div>

        {isOpen && (
          <div className="flex items-center gap-2 shrink-0">
            {!request.assignedAdmin && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => update.mutate({ claim: true })}
                loading={update.isPending}
              >
                Claim
              </Button>
            )}
            {(claimedByMe || !request.assignedAdmin) && (
              <Button variant="primary" size="sm" onClick={onCreateAccount}>
                <UserPlus className="w-3.5 h-3.5" />
                Create account
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => update.mutate({ status: "cancelled" })}
              loading={update.isPending}
              aria-label="Cancel request"
            >
              <Ban className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
        {request.status === "completed" && (
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
        )}
      </div>
    </div>
  );
}
