"use client";

/**
 * WorkersCompTab — list + manage workers comp claims for a staff
 * member. Admin / owner / head_office only.
 *
 * V1 surfaces: claim status, insurer, dates, RTW plan flag + URL,
 * payment status. Detail modal lets admin edit any field.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Loader2,
  X,
  CheckCircle2,
  XCircle,
  Clock,
  Pause,
  ExternalLink,
} from "lucide-react";
import { fetchApi, mutateApi, ApiResponseError } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import { useEscapeClose } from "@/hooks/useEscapeClose";

type WCStatus =
  | "lodged"
  | "under_review"
  | "accepted"
  | "declined"
  | "on_hold"
  | "closed"
  | "reopened";

interface WCClaim {
  id: string;
  userId: string;
  incidentId: string | null;
  incident: {
    id: string;
    incidentDate: string;
    description: string;
    incidentType: string;
  } | null;
  claimNumber: string | null;
  insurerName: string | null;
  insurerContact: string | null;
  status: WCStatus;
  dateOfInjury: string;
  dateLodged: string;
  dateOfDecision: string | null;
  injuryDescription: string | null;
  bodyPart: string | null;
  mechanismOfInjury: string | null;
  rtwPlanCreated: boolean;
  rtwPlanUrl: string | null;
  rtwStartDate: string | null;
  rtwFullCapacityDate: string | null;
  currentRestrictions: string | null;
  weeklyPaymentActive: boolean;
  weeklyPaymentRate: number | null;
  medicalExpensesPaid: number | null;
  notes: string | null;
  closedAt: string | null;
  closedBy: { id: string; name: string } | null;
  createdBy: { id: string; name: string };
  createdAt: string;
}

const STATUS_META: Record<
  WCStatus,
  { label: string; pill: string; icon: typeof CheckCircle2 }
> = {
  lodged: {
    label: "Lodged",
    pill: "bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-800",
    icon: Clock,
  },
  under_review: {
    label: "Under review",
    pill: "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800",
    icon: Clock,
  },
  accepted: {
    label: "Accepted",
    pill: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800",
    icon: CheckCircle2,
  },
  declined: {
    label: "Declined",
    pill: "bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800",
    icon: XCircle,
  },
  on_hold: {
    label: "On hold",
    pill: "bg-surface text-foreground border-border",
    icon: Pause,
  },
  closed: {
    label: "Closed",
    pill: "bg-surface text-foreground/80 border-border",
    icon: CheckCircle2,
  },
  reopened: {
    label: "Reopened",
    pill: "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800",
    icon: Clock,
  },
};

function todayIso(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatAud(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
  });
}

export interface WorkersCompTabProps {
  targetUserId: string;
  targetUserName: string;
}

export function WorkersCompTab({
  targetUserId,
  targetUserName,
}: WorkersCompTabProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<WCClaim | null>(null);

  const { data, isLoading, error } = useQuery<
    { claims: WCClaim[] },
    ApiResponseError
  >({
    queryKey: ["workers-comp", targetUserId],
    queryFn: () =>
      fetchApi(
        `/api/workers-comp-claims?userId=${encodeURIComponent(targetUserId)}`,
      ),
    staleTime: 30_000,
  });

  const claims = data?.claims ?? [];
  const open = claims.filter(
    (c) =>
      c.status !== "closed" && c.status !== "declined" && c.status !== "on_hold",
  );
  const other = claims.filter((c) => !open.includes(c));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          Workers compensation claims for {targetUserName}. Captures
          insurer details, RTW progress, and payment status. Linked to an
          IncidentRecord where applicable.
        </p>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Lodge claim
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-600">Unable to load claims.</p>
      ) : claims.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">
          No workers compensation claims on file.
        </div>
      ) : (
        <>
          {open.length > 0 && (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
                Active ({open.length})
              </p>
              <ClaimList claims={open} onClick={setEditing} />
            </section>
          )}
          {other.length > 0 && (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted/70 mb-2">
                Resolved / closed ({other.length})
              </p>
              <ClaimList claims={other} onClick={setEditing} />
            </section>
          )}
        </>
      )}

      {addOpen && (
        <ClaimModal
          mode="create"
          targetUserId={targetUserId}
          targetUserName={targetUserName}
          onClose={() => setAddOpen(false)}
        />
      )}
      {editing && (
        <ClaimModal
          mode="edit"
          existing={editing}
          targetUserId={targetUserId}
          targetUserName={targetUserName}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ClaimList({
  claims,
  onClick,
}: {
  claims: WCClaim[];
  onClick: (c: WCClaim) => void;
}) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {claims.map((c) => {
        const meta = STATUS_META[c.status];
        const Icon = meta.icon;
        return (
          <li
            key={c.id}
            onClick={() => onClick(c)}
            className="p-3 flex flex-wrap items-start gap-3 hover:bg-surface cursor-pointer"
          >
            <div className="flex-1 min-w-[200px]">
              <p className="text-sm font-medium text-foreground">
                {c.claimNumber ? `Claim ${c.claimNumber}` : "Unnumbered claim"}
                {c.insurerName && (
                  <span className="text-muted font-normal"> · {c.insurerName}</span>
                )}
              </p>
              <p className="text-xs text-muted mt-0.5">
                Injury {formatDate(c.dateOfInjury)} · lodged {formatDate(c.dateLodged)}
                {c.bodyPart && ` · ${c.bodyPart}`}
              </p>
              {c.rtwPlanCreated && (
                <p className="text-xs text-emerald-700 mt-1 inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  RTW plan {c.rtwStartDate && `started ${formatDate(c.rtwStartDate)}`}
                </p>
              )}
              {c.weeklyPaymentActive && (
                <p className="text-xs text-foreground/80 mt-0.5">
                  Weekly payment {formatAud(c.weeklyPaymentRate)} active
                </p>
              )}
            </div>
            <span
              className={cn(
                "shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-medium",
                meta.pill,
              )}
            >
              <Icon className="w-3 h-3" />
              {meta.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Claim create/edit modal ─────────────────────────────────────────

interface ClaimModalProps {
  mode: "create" | "edit";
  existing?: WCClaim;
  targetUserId: string;
  targetUserName: string;
  onClose: () => void;
}

function ClaimModal({
  mode,
  existing,
  targetUserId,
  targetUserName,
  onClose,
}: ClaimModalProps) {
  useEscapeClose(onClose);
  const qc = useQueryClient();
  const [status, setStatus] = useState<WCStatus>(existing?.status ?? "lodged");
  const [claimNumber, setClaimNumber] = useState(existing?.claimNumber ?? "");
  const [insurerName, setInsurerName] = useState(existing?.insurerName ?? "");
  const [insurerContact, setInsurerContact] = useState(
    existing?.insurerContact ?? "",
  );
  const [dateOfInjury, setDateOfInjury] = useState(
    existing?.dateOfInjury?.slice(0, 10) ?? todayIso(),
  );
  const [dateLodged, setDateLodged] = useState(
    existing?.dateLodged?.slice(0, 10) ?? todayIso(),
  );
  const [dateOfDecision, setDateOfDecision] = useState(
    existing?.dateOfDecision?.slice(0, 10) ?? "",
  );
  const [injuryDescription, setInjuryDescription] = useState(
    existing?.injuryDescription ?? "",
  );
  const [bodyPart, setBodyPart] = useState(existing?.bodyPart ?? "");
  const [mechanismOfInjury, setMechanismOfInjury] = useState(
    existing?.mechanismOfInjury ?? "",
  );

  // RTW
  const [rtwPlanCreated, setRtwPlanCreated] = useState(
    existing?.rtwPlanCreated ?? false,
  );
  const [rtwPlanUrl, setRtwPlanUrl] = useState(existing?.rtwPlanUrl ?? "");
  const [rtwStartDate, setRtwStartDate] = useState(
    existing?.rtwStartDate?.slice(0, 10) ?? "",
  );
  const [rtwFullCapacityDate, setRtwFullCapacityDate] = useState(
    existing?.rtwFullCapacityDate?.slice(0, 10) ?? "",
  );
  const [currentRestrictions, setCurrentRestrictions] = useState(
    existing?.currentRestrictions ?? "",
  );

  // Payment
  const [weeklyPaymentActive, setWeeklyPaymentActive] = useState(
    existing?.weeklyPaymentActive ?? false,
  );
  const [weeklyPaymentRate, setWeeklyPaymentRate] = useState(
    existing?.weeklyPaymentRate?.toString() ?? "",
  );
  const [medicalExpensesPaid, setMedicalExpensesPaid] = useState(
    existing?.medicalExpensesPaid?.toString() ?? "",
  );

  const [notes, setNotes] = useState(existing?.notes ?? "");

  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        status,
        claimNumber: claimNumber.trim() || null,
        insurerName: insurerName.trim() || null,
        insurerContact: insurerContact.trim() || null,
        dateOfInjury,
        dateLodged,
        dateOfDecision: dateOfDecision || null,
        injuryDescription: injuryDescription.trim() || null,
        bodyPart: bodyPart.trim() || null,
        mechanismOfInjury: mechanismOfInjury.trim() || null,
        rtwPlanCreated,
        rtwPlanUrl: rtwPlanUrl.trim() || null,
        rtwStartDate: rtwStartDate || null,
        rtwFullCapacityDate: rtwFullCapacityDate || null,
        currentRestrictions: currentRestrictions.trim() || null,
        weeklyPaymentActive,
        weeklyPaymentRate: weeklyPaymentRate
          ? Number(weeklyPaymentRate)
          : null,
        medicalExpensesPaid: medicalExpensesPaid
          ? Number(medicalExpensesPaid)
          : null,
        notes: notes.trim() || null,
      };
      if (mode === "create") {
        body.userId = targetUserId;
        return mutateApi("/api/workers-comp-claims", {
          method: "POST",
          body,
        });
      }
      return mutateApi(`/api/workers-comp-claims/${existing!.id}`, {
        method: "PATCH",
        body,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workers-comp", targetUserId] });
      toast({
        description: mode === "create" ? "Claim lodged." : "Claim updated.",
      });
      onClose();
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-stretch sm:items-center justify-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !save.isPending) onClose();
      }}
    >
      <div className="bg-card w-full h-full sm:h-auto sm:max-h-[90vh] sm:w-full sm:max-w-2xl flex flex-col shadow-2xl sm:rounded-xl">
        <header className="flex items-center justify-between gap-3 p-4 border-b border-border shrink-0">
          <h2 className="text-base font-semibold text-foreground">
            {mode === "create" ? "Lodge claim" : "Edit claim"} · {targetUserName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={save.isPending}
            className="p-2 -mr-1.5 rounded-lg hover:bg-surface disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-muted" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Status + claim number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as WCStatus)}
                disabled={save.isPending}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              >
                {Object.entries(STATUS_META).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Claim number{" "}
                <span className="text-muted font-normal">(insurer's ref)</span>
              </label>
              <input
                type="text"
                value={claimNumber}
                onChange={(e) => setClaimNumber(e.target.value)}
                disabled={save.isPending}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Insurer */}
          <fieldset className="rounded-lg border border-border p-3 space-y-3">
            <legend className="px-1 text-sm font-medium">Insurer</legend>
            <input
              type="text"
              value={insurerName}
              onChange={(e) => setInsurerName(e.target.value)}
              disabled={save.isPending}
              placeholder="Insurer name (e.g. iCare, Allianz Workers Comp)"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            />
            <textarea
              rows={2}
              value={insurerContact}
              onChange={(e) => setInsurerContact(e.target.value)}
              disabled={save.isPending}
              placeholder="Claims manager: name, email, phone"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            />
          </fieldset>

          {/* Timeline */}
          <fieldset className="rounded-lg border border-border p-3 space-y-3">
            <legend className="px-1 text-sm font-medium">Timeline</legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">
                  Date of injury
                </label>
                <input
                  type="date"
                  value={dateOfInjury}
                  onChange={(e) => setDateOfInjury(e.target.value)}
                  max={todayIso()}
                  disabled={save.isPending}
                  className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Date lodged
                </label>
                <input
                  type="date"
                  value={dateLodged}
                  onChange={(e) => setDateLodged(e.target.value)}
                  max={todayIso()}
                  disabled={save.isPending}
                  className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Decision date
                </label>
                <input
                  type="date"
                  value={dateOfDecision}
                  onChange={(e) => setDateOfDecision(e.target.value)}
                  disabled={save.isPending}
                  className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm"
                />
              </div>
            </div>
          </fieldset>

          {/* Injury */}
          <fieldset className="rounded-lg border border-border p-3 space-y-3">
            <legend className="px-1 text-sm font-medium">Injury</legend>
            <input
              type="text"
              value={bodyPart}
              onChange={(e) => setBodyPart(e.target.value)}
              disabled={save.isPending}
              placeholder="Body part (e.g. lower back, right wrist)"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            />
            <textarea
              rows={3}
              value={injuryDescription}
              onChange={(e) => setInjuryDescription(e.target.value)}
              disabled={save.isPending}
              placeholder="Injury description"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            />
            <textarea
              rows={2}
              value={mechanismOfInjury}
              onChange={(e) => setMechanismOfInjury(e.target.value)}
              disabled={save.isPending}
              placeholder="Mechanism — how it happened (e.g. lifting a child, slip on wet floor)"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            />
          </fieldset>

          {/* RTW */}
          <fieldset className="rounded-lg border border-border p-3 space-y-3">
            <legend className="px-1 text-sm font-medium">Return to work</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={rtwPlanCreated}
                onChange={(e) => setRtwPlanCreated(e.target.checked)}
                disabled={save.isPending}
              />
              RTW plan created
            </label>
            <input
              type="url"
              value={rtwPlanUrl}
              onChange={(e) => setRtwPlanUrl(e.target.value)}
              disabled={save.isPending || !rtwPlanCreated}
              placeholder="https://… link to RTW plan"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm disabled:opacity-50"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">
                  RTW start
                </label>
                <input
                  type="date"
                  value={rtwStartDate}
                  onChange={(e) => setRtwStartDate(e.target.value)}
                  disabled={save.isPending}
                  className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Full capacity expected
                </label>
                <input
                  type="date"
                  value={rtwFullCapacityDate}
                  onChange={(e) => setRtwFullCapacityDate(e.target.value)}
                  disabled={save.isPending}
                  className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm"
                />
              </div>
            </div>
            <textarea
              rows={2}
              value={currentRestrictions}
              onChange={(e) => setCurrentRestrictions(e.target.value)}
              disabled={save.isPending}
              placeholder="Current restrictions (e.g. no lifting > 5kg, no standing > 30 min)"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            />
          </fieldset>

          {/* Payment */}
          <fieldset className="rounded-lg border border-border p-3 space-y-3">
            <legend className="px-1 text-sm font-medium">Payment</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={weeklyPaymentActive}
                onChange={(e) => setWeeklyPaymentActive(e.target.checked)}
                disabled={save.isPending}
              />
              Weekly payments active
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="number"
                step="0.01"
                min="0"
                value={weeklyPaymentRate}
                onChange={(e) => setWeeklyPaymentRate(e.target.value)}
                disabled={save.isPending || !weeklyPaymentActive}
                placeholder="Weekly rate (AUD)"
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm disabled:opacity-50"
              />
              <input
                type="number"
                step="0.01"
                min="0"
                value={medicalExpensesPaid}
                onChange={(e) => setMedicalExpensesPaid(e.target.value)}
                disabled={save.isPending}
                placeholder="Medical expenses (cumulative AUD)"
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              />
            </div>
          </fieldset>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Notes <span className="text-muted font-normal">(optional)</span>
            </label>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={save.isPending}
              maxLength={20_000}
              placeholder="Anything else worth tracking — case notes, key milestones, communications log."
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            />
          </div>

          {existing?.rtwPlanUrl && (
            <a
              href={existing.rtwPlanUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-brand hover:underline inline-flex items-center gap-1"
            >
              Open RTW plan
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        <footer className="border-t border-border bg-card shrink-0 p-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={save.isPending}
            className="px-4 py-2 text-sm text-muted rounded-md border border-border disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90 disabled:opacity-50"
          >
            {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === "create" ? "Lodge claim" : "Save changes"}
          </button>
        </footer>
      </div>
    </div>
  );
}
