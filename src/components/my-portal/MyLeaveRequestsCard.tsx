"use client";

/**
 * MyLeaveRequestsCard — staff-facing leave history + apply-for-leave
 * flow, backed by Employment Hero Payroll.
 *
 * Two stacked sections:
 *   1. Header with "Apply for leave" button → opens an inline modal
 *   2. Recent request history table (status pill, dates, category,
 *      hours, notes)
 *
 * The apply modal:
 *   - Category dropdown sourced from /api/my-portal/leave/categories
 *   - Date range pickers (from + to)
 *   - Hours field (auto-populated from /estimate as the form fills in)
 *   - Optional notes
 *   - On submit, POST /api/my-portal/leave/requests → 201 + history
 *     refetch → modal closes
 *
 * Empty / not-configured / not-mapped states mirror MyPayslipsCard
 * for consistency.
 */

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar, Loader2, Plus, X } from "lucide-react";
import { fetchApi, mutateApi, ApiResponseError } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

interface LeaveRequest {
  id: number;
  leaveCategoryId: number;
  leaveCategory: string;
  fromDate: string;
  toDate: string;
  totalHours: number;
  status: string;
  notes: string | null;
  attachmentId: number | null;
}

interface LeaveCategory {
  id: number;
  name: string;
  unitType: "Hours" | "Days" | "Weeks";
}

function statusBadgeClass(status: string): string {
  // EH's status values are roughly: Pending, Approved, Rejected, Cancelled.
  // Map case-insensitively so capitalisation drift doesn't break the UI.
  const s = status.toLowerCase();
  if (s.startsWith("approv")) return "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800";
  if (s.startsWith("reject")) return "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800";
  if (s.startsWith("cancel")) return "bg-surface text-foreground/80 border-border";
  return "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"; // pending / default
}

/** YYYY-MM-DD for today in the user's local time zone (form input min). */
function todayIso(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function formatHumanDate(iso: string): string {
  if (!iso) return "";
  // EH returns YYYY-MM-DDT... — slice to just date portion for parsing.
  const datePart = iso.slice(0, 10);
  const d = new Date(`${datePart}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function MyLeaveRequestsCard() {
  const [applyOpen, setApplyOpen] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery<
    { requests: LeaveRequest[] },
    ApiResponseError
  >({
    queryKey: ["my-leave-requests"],
    queryFn: () =>
      fetchApi<{ requests: LeaveRequest[] }>("/api/my-portal/leave/requests"),
    staleTime: 60_000,
    retry: (n, e) => {
      const s = (e as ApiResponseError)?.status;
      if (s === 404 || s === 503) return false;
      return n < 2;
    },
  });

  const requests = data?.requests ?? [];
  const errorStatus = (error as ApiResponseError | undefined)?.status;

  return (
    <div className="bg-card rounded-xl border border-border p-6" data-testid="my-leave-requests-card">
      <div className="flex items-center justify-between mb-4 gap-2">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Calendar className="w-5 h-5 text-brand" />
          My Leave Requests
        </h3>
        {errorStatus !== 404 && errorStatus !== 503 && (
          <button
            type="button"
            onClick={() => setApplyOpen(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90 transition-colors"
            data-testid="leave-apply-button"
          >
            <Plus className="w-4 h-4" />
            Apply for leave
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted">Loading requests…</p>
      ) : errorStatus === 503 ? (
        <p className="text-sm text-muted">
          Payroll integration isn&apos;t set up yet. Ask your admin to enable it.
        </p>
      ) : errorStatus === 404 ? (
        <p className="text-sm text-muted">
          Your account isn&apos;t linked to a payroll record yet. Contact your
          manager so they can set you up in Settings → Team.
        </p>
      ) : error ? (
        <p className="text-sm text-red-600">
          Unable to load leave requests. Please refresh the page.
        </p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-muted">
          No leave requests yet. Click <em>Apply for leave</em> to submit one.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {requests.map((r) => (
            <li
              key={r.id}
              className="py-3 flex flex-wrap items-start gap-3"
              data-testid={`leave-request-${r.id}`}
            >
              <div className="flex-1 min-w-[200px]">
                <div className="text-sm font-medium text-foreground">
                  {r.leaveCategory}
                </div>
                <div className="text-xs text-muted mt-0.5">
                  {formatHumanDate(r.fromDate)}
                  {r.fromDate !== r.toDate && ` – ${formatHumanDate(r.toDate)}`}
                  {" · "}
                  {r.totalHours.toFixed(2)} hrs
                </div>
                {r.notes && (
                  <div className="text-xs text-muted mt-1 italic">
                    &ldquo;{r.notes}&rdquo;
                  </div>
                )}
              </div>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-medium ${statusBadgeClass(r.status)}`}
              >
                {r.status}
              </span>
            </li>
          ))}
        </ul>
      )}

      {applyOpen && (
        <ApplyLeaveModal
          onClose={() => setApplyOpen(false)}
          onSubmitted={() => {
            // Refetch both the history (new pending row) and the balances
            // (EH decrements available immediately on pending submission).
            qc.invalidateQueries({ queryKey: ["my-leave-requests"] });
            qc.invalidateQueries({ queryKey: ["my-leave-balances-eh"] });
            setApplyOpen(false);
            toast({ description: "Leave request submitted." });
          }}
        />
      )}
    </div>
  );
}

// ─── Apply-for-leave modal ───────────────────────────────────────────

interface ApplyLeaveModalProps {
  onClose: () => void;
  onSubmitted: () => void;
}

function ApplyLeaveModal({ onClose, onSubmitted }: ApplyLeaveModalProps) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [hours, setHours] = useState<string>("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data: categoriesData, isLoading: catsLoading } = useQuery<{
    categories: LeaveCategory[];
  }>({
    queryKey: ["my-leave-categories"],
    queryFn: () => fetchApi("/api/my-portal/leave/categories"),
    staleTime: 30 * 60_000, // categories are configuration, very stable
  });
  const categories = categoriesData?.categories ?? [];

  // When the user fills enough to estimate, ask EH "how many hours does
  // this consume?" — debounced so we don't hammer EH on every keystroke.
  // Triggered by useEffect rather than onChange because we want to refire
  // when ANY of the three triggering inputs change, not just one.
  useEffect(() => {
    if (!fromDate || !toDate || !categoryId) return;
    if (fromDate > toDate) return;
    const handle = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          fromDate,
          toDate,
          leaveCategoryId: String(categoryId),
        });
        const est = await fetchApi<{ totalHours: number }>(
          `/api/my-portal/leave/estimate?${params.toString()}`,
        );
        // Only auto-fill if the user hasn't manually overridden — i.e.
        // hours is empty or matches a previous estimate. Simple guard:
        // always set on a category/date change. Staff can still edit
        // the box after.
        setHours(est.totalHours.toFixed(2));
      } catch {
        // Silent on estimate failure — staff can type hours manually.
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [fromDate, toDate, categoryId]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!categoryId) throw new Error("Pick a leave type");
      if (!fromDate || !toDate) throw new Error("Pick both dates");
      const hoursNum = Number(hours);
      if (!Number.isFinite(hoursNum) || hoursNum <= 0) {
        throw new Error("Hours must be a positive number");
      }
      return mutateApi("/api/my-portal/leave/requests", {
        method: "POST",
        body: {
          fromDate,
          toDate,
          hours: hoursNum,
          leaveCategoryId: categoryId,
          notes: notes || undefined,
        },
      });
    },
    onSuccess: () => onSubmitted(),
    onError: (err: Error) => setSubmitError(err.message),
  });

  // Escape closes (unless mid-submit).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitMutation.isPending) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submitMutation.isPending, onClose]);

  const canSubmit =
    !!categoryId && !!fromDate && !!toDate && !!hours && !submitMutation.isPending;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-stretch sm:items-center justify-center sm:p-4"
      data-testid="leave-apply-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitMutation.isPending) onClose();
      }}
    >
      <div
        className="bg-card w-full h-full sm:h-auto sm:max-h-[90vh] sm:w-full sm:max-w-lg flex flex-col shadow-2xl sm:rounded-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-apply-title"
        data-testid="leave-apply-dialog"
      >
        <header className="flex items-center justify-between gap-3 p-4 border-b border-border shrink-0">
          <h2 id="leave-apply-title" className="text-base font-semibold text-foreground">
            Apply for leave
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitMutation.isPending}
            className="p-2 -mr-1.5 rounded-lg hover:bg-surface transition-colors disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-muted" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div>
            <label
              htmlFor="leave-category"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Leave type
            </label>
            <select
              id="leave-category"
              value={categoryId ?? ""}
              onChange={(e) => setCategoryId(Number(e.target.value) || null)}
              disabled={catsLoading || submitMutation.isPending}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
              data-testid="leave-apply-category"
            >
              <option value="">
                {catsLoading ? "Loading…" : "Pick a leave type…"}
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="leave-from"
                className="block text-sm font-medium text-foreground mb-1"
              >
                From
              </label>
              <input
                id="leave-from"
                type="date"
                value={fromDate}
                min={todayIso()}
                onChange={(e) => setFromDate(e.target.value)}
                disabled={submitMutation.isPending}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
                data-testid="leave-apply-from"
              />
            </div>
            <div>
              <label
                htmlFor="leave-to"
                className="block text-sm font-medium text-foreground mb-1"
              >
                To
              </label>
              <input
                id="leave-to"
                type="date"
                value={toDate}
                min={fromDate || todayIso()}
                onChange={(e) => setToDate(e.target.value)}
                disabled={submitMutation.isPending}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
                data-testid="leave-apply-to"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="leave-hours"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Hours
            </label>
            <input
              id="leave-hours"
              type="number"
              step="0.25"
              min="0"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              disabled={submitMutation.isPending}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
              data-testid="leave-apply-hours"
            />
            <p className="mt-1 text-xs text-muted">
              Auto-calculated by Employment Hero based on your standard hours.
              Adjust if needed (e.g. half-day).
            </p>
          </div>

          <div>
            <label
              htmlFor="leave-notes"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Notes <span className="text-muted">(optional)</span>
            </label>
            <textarea
              id="leave-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={submitMutation.isPending}
              maxLength={1000}
              rows={3}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 resize-y"
              placeholder="Reason for leave, handover details, etc."
              data-testid="leave-apply-notes"
            />
          </div>

          {submitError && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-800 dark:text-red-200">
              {submitError}
            </div>
          )}
        </div>

        <footer
          className="border-t border-border bg-card shrink-0 p-4 flex flex-wrap items-center justify-end gap-2"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={submitMutation.isPending}
            className="px-4 py-2 text-sm text-muted hover:text-foreground rounded-md border border-border disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setSubmitError(null);
              submitMutation.mutate();
            }}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90 transition-colors disabled:opacity-50"
            data-testid="leave-apply-submit"
          >
            {submitMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Submit for approval
          </button>
        </footer>
      </div>
    </div>
  );
}
