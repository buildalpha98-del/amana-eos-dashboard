"use client";

/**
 * CasualConversionTab — Closing Loopholes No. 2 Act tracking on the
 * staff profile. Admin / owner / head_office only.
 *
 * Shows:
 *   - Current eligibility (✓ Eligible / ✗ + reason)
 *   - Pending election with 21-day countdown (if any)
 *   - Election history with responses
 *   - "Record election" button when eligible
 *   - "Record response" button when pending
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  X,
  FileText,
} from "lucide-react";
import { fetchApi, mutateApi, ApiResponseError } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";

type RequestType = "part_time" | "full_time";
type Response = "accepted" | "declined";
type EligibilityReason =
  | "eligible"
  | "not_casual"
  | "inactive"
  | "insufficient_tenure"
  | "pending_election"
  | "recent_decline_cooldown";

interface Election {
  id: string;
  userId: string;
  requestedType: RequestType;
  electedAt: string;
  electionNotes: string | null;
  respondedAt: string | null;
  respondedBy: { id: string; name: string } | null;
  response: Response | null;
  declineReasons: string | null;
  newContractId: string | null;
  newContract: {
    id: string;
    contractType: string;
    startDate: string;
    payRate: number;
  } | null;
  createdAt: string;
}

interface Eligibility {
  eligible: boolean;
  reason: EligibilityReason;
  tenureMonths: number;
  thresholdMonths: number;
  cooldownUntil?: string | null;
  pendingElectionId?: string | null;
}

const ELIGIBILITY_LABEL: Record<EligibilityReason, string> = {
  eligible: "Eligible to elect conversion now",
  not_casual: "Not on a casual contract — conversion doesn't apply",
  inactive: "Account is deactivated",
  insufficient_tenure: "Tenure below the casual-conversion threshold",
  pending_election: "Has a pending election awaiting response",
  recent_decline_cooldown:
    "A recent decline is still in cooldown (s66B re-election limit)",
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function daysUntilResponseDeadline(electedAtIso: string): number {
  const electedAt = new Date(electedAtIso);
  const deadline = new Date(electedAt.getTime() + 21 * 86400000);
  return Math.ceil((deadline.getTime() - Date.now()) / 86400000);
}

export interface CasualConversionTabProps {
  targetUserId: string;
  targetUserName: string;
}

export function CasualConversionTab({
  targetUserId,
  targetUserName,
}: CasualConversionTabProps) {
  const [recordOpen, setRecordOpen] = useState(false);
  const [respondingTo, setRespondingTo] = useState<Election | null>(null);

  const { data, isLoading, error } = useQuery<
    { elections: Election[]; eligibility: Eligibility },
    ApiResponseError
  >({
    queryKey: ["casual-conversion", targetUserId],
    queryFn: () =>
      fetchApi(
        `/api/casual-conversion-elections?userId=${encodeURIComponent(targetUserId)}`,
      ),
    staleTime: 30_000,
  });

  if (isLoading) return <p className="text-sm text-muted">Loading…</p>;
  if (error)
    return (
      <p className="text-sm text-red-600">Unable to load conversion history.</p>
    );

  const elections = data?.elections ?? [];
  const eligibility = data?.eligibility ?? {
    eligible: false,
    reason: "inactive" as const,
    tenureMonths: 0,
    thresholdMonths: 6,
  };
  const pending = elections.find((e) => e.respondedAt === null) ?? null;
  const history = elections.filter((e) => e.respondedAt !== null);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Closing Loopholes No. 2 Act 2024 — casual employees who have worked
        beyond the threshold can elect in writing to convert to permanent
        (s66B). Employer has 21 days to respond.
      </p>

      {/* Eligibility card */}
      <div
        className={cn(
          "rounded-lg border p-4 flex items-start gap-3",
          eligibility.eligible
            ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40"
            : "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40",
        )}
      >
        {eligibility.eligible ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-700 mt-0.5 shrink-0" />
        ) : (
          <XCircle className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {ELIGIBILITY_LABEL[eligibility.reason]}
          </p>
          <p className="text-xs text-muted mt-1">
            Tenure {eligibility.tenureMonths.toFixed(1)} months · threshold{" "}
            {eligibility.thresholdMonths} months
            {eligibility.cooldownUntil && (
              <>
                {" "}
                · cooldown ends {formatDate(eligibility.cooldownUntil)}
              </>
            )}
          </p>
        </div>
        {eligibility.eligible && !pending && (
          <button
            type="button"
            onClick={() => setRecordOpen(true)}
            className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90"
          >
            <Plus className="w-4 h-4" />
            Record election
          </button>
        )}
      </div>

      {/* Pending election */}
      {pending && <PendingCard pending={pending} onRespond={() => setRespondingTo(pending)} />}

      {/* History */}
      {history.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
            Past elections
          </p>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {history.map((e) => (
              <PastRow key={e.id} election={e} />
            ))}
          </ul>
        </div>
      )}

      {recordOpen && (
        <RecordElectionModal
          targetUserId={targetUserId}
          targetUserName={targetUserName}
          onClose={() => setRecordOpen(false)}
        />
      )}
      {respondingTo && (
        <RespondModal
          election={respondingTo}
          targetUserName={targetUserName}
          onClose={() => setRespondingTo(null)}
        />
      )}
    </div>
  );
}

// ─── Pending card ────────────────────────────────────────────────────

function PendingCard({
  pending,
  onRespond,
}: {
  pending: Election;
  onRespond: () => void;
}) {
  const days = daysUntilResponseDeadline(pending.electedAt);
  const overdue = days < 0;
  const urgent = !overdue && days <= 3;

  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        overdue
          ? "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40"
          : urgent
            ? "border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40"
            : "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40",
      )}
    >
      <div className="flex items-start gap-3">
        <Clock
          className={cn(
            "w-5 h-5 mt-0.5 shrink-0",
            overdue ? "text-red-700" : urgent ? "text-amber-700" : "text-blue-700",
          )}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            Pending election — {pending.requestedType.replace("_", " ")}
          </p>
          <p className="text-xs text-muted mt-0.5">
            Elected {formatDate(pending.electedAt)} · 21-day deadline{" "}
            {overdue ? (
              <span className="text-red-700 font-semibold">
                passed {Math.abs(days)} day{Math.abs(days) === 1 ? "" : "s"} ago
              </span>
            ) : urgent ? (
              <span className="text-amber-700 font-semibold">
                in {days} day{days === 1 ? "" : "s"} — respond now
              </span>
            ) : (
              `${days} days remain`
            )}
          </p>
          {pending.electionNotes && (
            <p className="text-xs text-foreground/80 mt-2 italic">
              &ldquo;{pending.electionNotes}&rdquo;
            </p>
          )}
          {overdue && (
            <div className="mt-2 flex items-start gap-1.5 text-xs text-red-700">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                Outside the s66B response window. Respond in writing
                immediately to limit dispute exposure.
              </span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onRespond}
          className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90"
        >
          Record response
        </button>
      </div>
    </div>
  );
}

// ─── Past election row ───────────────────────────────────────────────

function PastRow({ election }: { election: Election }) {
  const accepted = election.response === "accepted";
  return (
    <li className="p-3 flex flex-wrap items-start gap-3">
      <span
        className={cn(
          "shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-medium",
          accepted
            ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800"
            : "bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800",
        )}
      >
        {accepted ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
        {accepted ? "Accepted" : "Declined"}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm">
          Election for {election.requestedType.replace("_", " ")} ·{" "}
          {formatDate(election.electedAt)}
        </p>
        <p className="text-xs text-muted mt-0.5">
          Responded {formatDate(election.respondedAt)} by{" "}
          {election.respondedBy?.name ?? "—"}
        </p>
        {accepted && election.newContract && (
          <p className="text-xs text-emerald-700 mt-1 inline-flex items-center gap-1">
            <FileText className="w-3 h-3" />
            New contract:{" "}
            {election.newContract.contractType.replace("_", " ")} starting{" "}
            {formatDate(election.newContract.startDate)} at{" "}
            ${election.newContract.payRate.toFixed(2)}/hr
          </p>
        )}
        {!accepted && election.declineReasons && (
          <p className="text-xs text-foreground/80 mt-1 italic">
            Grounds: {election.declineReasons}
          </p>
        )}
      </div>
    </li>
  );
}

// ─── Record-election modal ───────────────────────────────────────────

function RecordElectionModal({
  targetUserId,
  targetUserName,
  onClose,
}: {
  targetUserId: string;
  targetUserName: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [requestedType, setRequestedType] = useState<RequestType>("part_time");
  const [electedAt, setElectedAt] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [electionNotes, setElectionNotes] = useState("");

  const save = useMutation({
    mutationFn: () =>
      mutateApi("/api/casual-conversion-elections", {
        method: "POST",
        body: {
          userId: targetUserId,
          requestedType,
          electedAt: new Date(`${electedAt}T00:00:00`).toISOString(),
          electionNotes: electionNotes.trim() || null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["casual-conversion", targetUserId] });
      toast({ description: "Election recorded." });
      onClose();
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  return (
    <ModalShell title={`Record election — ${targetUserName}`} onClose={onClose}>
      <div className="p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Requested type</label>
          <select
            value={requestedType}
            onChange={(e) => setRequestedType(e.target.value as RequestType)}
            disabled={save.isPending}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          >
            <option value="part_time">Part-time</option>
            <option value="full_time">Full-time</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Election date</label>
          <input
            type="date"
            value={electedAt}
            onChange={(e) => setElectedAt(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
            disabled={save.isPending}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-muted">
            When the employee lodged their written request. The 21-day
            response window starts from this date.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Notes <span className="text-muted font-normal">(optional)</span>
          </label>
          <textarea
            rows={4}
            value={electionNotes}
            onChange={(e) => setElectionNotes(e.target.value)}
            disabled={save.isPending}
            maxLength={20_000}
            placeholder="Paste their written request or paraphrase. Keep a copy of the original separately if you can."
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          />
        </div>
      </div>
      <ModalFooter
        onClose={onClose}
        onSubmit={() => save.mutate()}
        submitDisabled={save.isPending}
        submitLabel="Record election"
        pending={save.isPending}
      />
    </ModalShell>
  );
}

// ─── Respond modal ───────────────────────────────────────────────────

function RespondModal({
  election,
  targetUserName,
  onClose,
}: {
  election: Election;
  targetUserName: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [response, setResponse] = useState<Response>("accepted");
  const [declineReasons, setDeclineReasons] = useState("");
  const [newContractId, setNewContractId] = useState("");

  const declineRequired =
    response === "declined" && declineReasons.trim().length < 20;

  const save = useMutation({
    mutationFn: () =>
      mutateApi(`/api/casual-conversion-elections/${election.id}`, {
        method: "PATCH",
        body: {
          response,
          declineReasons:
            response === "declined" ? declineReasons.trim() : null,
          newContractId: response === "accepted" && newContractId.trim()
            ? newContractId.trim()
            : null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["casual-conversion", election.userId] });
      toast({ description: "Response recorded." });
      onClose();
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  return (
    <ModalShell
      title={`Respond to election — ${targetUserName}`}
      onClose={onClose}
    >
      <div className="p-5 space-y-4">
        <p className="text-xs text-muted">
          Original election: {election.requestedType.replace("_", " ")} lodged{" "}
          {formatDate(election.electedAt)}.
        </p>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Response</legend>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              name="response"
              checked={response === "accepted"}
              onChange={() => setResponse("accepted")}
              disabled={save.isPending}
              className="mt-1"
            />
            <span className="text-sm">
              <span className="font-medium">Accept</span> — issue a new
              permanent contract for the requested type.
            </span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              name="response"
              checked={response === "declined"}
              onChange={() => setResponse("declined")}
              disabled={save.isPending}
              className="mt-1"
            />
            <span className="text-sm">
              <span className="font-medium">Decline</span> — must cite valid
              s66B(3) grounds in writing.
            </span>
          </label>
        </fieldset>

        {response === "declined" && (
          <div>
            <label className="block text-sm font-medium mb-1">
              Grounds for decline <span className="text-red-700">*</span>
            </label>
            <textarea
              rows={5}
              value={declineReasons}
              onChange={(e) => setDeclineReasons(e.target.value)}
              disabled={save.isPending}
              maxLength={20_000}
              placeholder="State the specific s66B(3) ground(s) relied on. e.g. 'Position is unlikely to exist in 12 months due to enrolment forecast', 'Significant adjustment to days/hours would be required and is not operationally viable'."
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            />
            {declineRequired && (
              <p className="mt-1 text-xs text-red-700">
                Decline grounds need at least 20 characters citing the
                s66B(3) ground(s) relied on. An undocumented decline is
                unlawful.
              </p>
            )}
          </div>
        )}

        {response === "accepted" && (
          <div>
            <label className="block text-sm font-medium mb-1">
              New contract id{" "}
              <span className="text-muted font-normal">
                (optional — link after issuing)
              </span>
            </label>
            <input
              type="text"
              value={newContractId}
              onChange={(e) => setNewContractId(e.target.value)}
              disabled={save.isPending}
              placeholder="EmploymentContract id"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm font-mono"
            />
            <p className="mt-1 text-xs text-muted">
              You can record the response now and link the new contract once
              it's issued (Contracts → New contract).
            </p>
          </div>
        )}
      </div>
      <ModalFooter
        onClose={onClose}
        onSubmit={() => save.mutate()}
        submitDisabled={save.isPending || declineRequired}
        submitLabel={
          response === "accepted" ? "Accept election" : "Decline election"
        }
        pending={save.isPending}
      />
    </ModalShell>
  );
}

// ─── Shared modal shell + footer ─────────────────────────────────────

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-stretch sm:items-center justify-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-card w-full h-full sm:h-auto sm:max-h-[90vh] sm:w-full sm:max-w-lg flex flex-col shadow-2xl sm:rounded-xl">
        <header className="flex items-center justify-between gap-3 p-4 border-b border-border shrink-0">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-1.5 rounded-lg hover:bg-surface"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-muted" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function ModalFooter({
  onClose,
  onSubmit,
  submitDisabled,
  submitLabel,
  pending,
}: {
  onClose: () => void;
  onSubmit: () => void;
  submitDisabled: boolean;
  submitLabel: string;
  pending: boolean;
}) {
  return (
    <footer className="border-t border-border bg-card shrink-0 p-4 flex flex-wrap items-center justify-end gap-2">
      <button
        type="button"
        onClick={onClose}
        disabled={pending}
        className="px-4 py-2 text-sm text-muted rounded-md border border-border disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSubmit}
        disabled={submitDisabled}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90 disabled:opacity-50"
      >
        {pending && <Loader2 className="w-4 h-4 animate-spin" />}
        {submitLabel}
      </button>
    </footer>
  );
}
