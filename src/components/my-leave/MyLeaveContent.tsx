"use client";

/**
 * MyLeaveContent — the /my-leave destination (Staff Portal v2, Task 1.3).
 *
 * Full-page version of the leave surface, per Leave.dc.html /
 * MobileLeave.dc.html:
 *   - Balances row: one card per EH leave category (first card dark, per
 *     the mobile mockup), hrs + ≈days. No accrual line — the balances
 *     API returns only { accruedAmount, unitType } per category.
 *   - A dashed "Requested leave" tile when a pending request exists.
 *   - Prominent "Apply for leave" opening the EXISTING ApplyLeaveModal
 *     from MyLeaveRequestsCard (not forked).
 *   - "Your requests" history list with status pills.
 *
 * Data layer is identical to the my-portal cards — same queryKeys
 * (["my-leave-balances-eh"], ["my-leave-requests"]), same
 * suppressGlobalErrorToast meta and terminal-404/503 retry predicates —
 * so the cache is shared with /my-portal.
 *
 * Not-linked (404) and not-configured (503) collapse into ONE friendly
 * full-page state instead of per-card copies.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarOff, Plane, Plus } from "lucide-react";
import { fetchApi, ApiResponseError } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { ApplyLeaveModal } from "@/components/my-portal/MyLeaveRequestsCard";

// ─── Types (mirroring the my-portal cards' API shapes) ───────────────

interface LeaveBalance {
  leaveCategoryId: number;
  leaveCategoryName: string;
  accruedAmount: number;
  unitType: "Hours" | "Days" | "Weeks";
}

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

// ─── Helpers ─────────────────────────────────────────────────────────

/** Standard 7.6-hour day for the "≈ N days" hint on hour balances. */
const HOURS_PER_DAY = 7.6;

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s.startsWith("approv"))
    return "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800";
  if (s.startsWith("reject") || s.startsWith("declin"))
    return "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800";
  if (s.startsWith("cancel")) return "bg-surface text-foreground/80 border-border";
  return "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"; // pending / default
}

function formatHumanDate(iso: string): string {
  if (!iso) return "";
  const datePart = iso.slice(0, 10);
  const d = new Date(`${datePart}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "29 Sep – 3 Oct 2026" style range (collapses same-day requests). */
function formatDateRange(from: string, to: string): string {
  if (from === to || from.slice(0, 10) === to.slice(0, 10)) {
    return formatHumanDate(from);
  }
  return `${formatHumanDate(from)} – ${formatHumanDate(to)}`;
}

function formatBalanceValue(b: LeaveBalance): string {
  const decimals = b.unitType === "Hours" ? 1 : 1;
  return `${b.accruedAmount.toFixed(decimals)} ${b.unitType === "Hours" ? "hrs" : b.unitType.toLowerCase()}`;
}

// ─── Component ───────────────────────────────────────────────────────

export function MyLeaveContent() {
  const [applyOpen, setApplyOpen] = useState(false);
  const qc = useQueryClient();

  const balancesQuery = useQuery<{ balances: LeaveBalance[] }, ApiResponseError>({
    queryKey: ["my-leave-balances-eh"],
    queryFn: () => fetchApi("/api/my-portal/leave/balances"),
    // The page renders its own inline states — skip the global toast.
    meta: { suppressGlobalErrorToast: true },
    staleTime: 5 * 60_000,
    retry: (count, err) => {
      const status = (err as ApiResponseError)?.status;
      if (status === 404 || status === 503) return false;
      return count < 2;
    },
  });

  const requestsQuery = useQuery<{ requests: LeaveRequest[] }, ApiResponseError>({
    queryKey: ["my-leave-requests"],
    queryFn: () => fetchApi("/api/my-portal/leave/requests"),
    meta: { suppressGlobalErrorToast: true },
    staleTime: 60_000,
    retry: (count, err) => {
      const status = (err as ApiResponseError)?.status;
      if (status === 404 || status === 503) return false;
      return count < 2;
    },
  });

  const balances = balancesQuery.data?.balances ?? [];
  const requests = requestsQuery.data?.requests ?? [];

  const balancesStatus = (balancesQuery.error as ApiResponseError | undefined)?.status;
  const requestsStatus = (requestsQuery.error as ApiResponseError | undefined)?.status;

  // Both queries hit the same Employment Hero backing — 404 (no linked
  // employee) or 503 (integration off) on either means the whole page
  // gets ONE consolidated friendly state, not two cards of it.
  const terminalStatus = [balancesStatus, requestsStatus].find(
    (s) => s === 404 || s === 503,
  );
  const isLoading = balancesQuery.isLoading || requestsQuery.isLoading;

  const pendingRequest = requests.find((r) =>
    r.status.toLowerCase().startsWith("pend"),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4" data-testid="my-leave-page">
      <PageHeader
        title="Leave"
        description="Balances live from payroll. Requests go straight to your manager for approval."
        primaryAction={{
          label: "Apply for leave",
          icon: Plus,
          onClick: () => setApplyOpen(true),
          hidden: terminalStatus !== undefined || isLoading,
        }}
      />

      {isLoading ? (
        <LoadingSkeleton />
      ) : terminalStatus !== undefined ? (
        <NotAvailableState status={terminalStatus} />
      ) : (
        <>
          {/* ── Balances row ──────────────────────────────────────── */}
          {balancesQuery.error ? (
            <div className="bg-card rounded-xl border border-border p-6" data-testid="my-leave-balances">
              <p className="text-sm text-red-600">
                Unable to load leave balances. Please refresh the page.
              </p>
            </div>
          ) : balances.length > 0 ? (
            <div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
              data-testid="my-leave-balances"
            >
              {balances.map((b, i) => (
                <div
                  key={b.leaveCategoryId}
                  className={
                    i === 0
                      ? "bg-sidebar rounded-xl p-5 shadow-warm"
                      : "bg-card rounded-xl border border-border p-5 shadow-warm"
                  }
                  data-testid={`leave-balance-${b.leaveCategoryId}`}
                >
                  <div
                    className={`text-xs font-semibold ${i === 0 ? "text-white/65" : "text-muted"}`}
                  >
                    {b.leaveCategoryName}
                  </div>
                  <div className="flex items-baseline gap-2 mt-1.5 flex-wrap">
                    <div
                      className={`text-3xl font-heading font-bold tracking-tight ${i === 0 ? "text-white" : "text-foreground"}`}
                    >
                      {formatBalanceValue(b)}
                    </div>
                    {b.unitType === "Hours" && (
                      <div
                        className={`text-sm font-medium ${i === 0 ? "text-accent" : "text-muted"}`}
                      >
                        ≈ {(b.accruedAmount / HOURS_PER_DAY).toFixed(1)} days
                      </div>
                    )}
                  </div>
                  <div
                    className={`text-2xs mt-1 ${i === 0 ? "text-white/65" : "text-muted"}`}
                  >
                    Available
                  </div>
                </div>
              ))}

              {/* Next pending request, surfaced beside the balances
                  (dashed tile per the desktop mockup). */}
              {pendingRequest && (
                <div
                  className="bg-surface rounded-xl border border-dashed border-border p-5"
                  data-testid="my-leave-pending-tile"
                >
                  <div className="text-xs font-semibold text-muted">
                    Requested leave
                  </div>
                  <div className="flex items-center gap-3 mt-3">
                    <div className="bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 text-xs font-bold text-center leading-tight shrink-0">
                      {formatDateRange(pendingRequest.fromDate, pendingRequest.toDate)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground truncate">
                        {pendingRequest.leaveCategory}
                      </div>
                      <div className="text-xs text-muted">
                        {pendingRequest.totalHours.toFixed(1)} hrs · waiting on approval
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-border p-6" data-testid="my-leave-balances">
              <p className="text-sm text-muted">No leave balances on file yet.</p>
            </div>
          )}

          {/* ── Requests history ──────────────────────────────────── */}
          <div
            className="bg-card rounded-xl border border-border shadow-warm overflow-hidden"
            data-testid="my-leave-requests"
          >
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-bold text-foreground">Your requests</h3>
            </div>

            {requestsQuery.error ? (
              <p className="text-sm text-red-600 px-5 py-4">
                Unable to load leave requests. Please refresh the page.
              </p>
            ) : requests.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <Plane className="w-8 h-8 text-muted mx-auto mb-2" aria-hidden />
                <p className="text-sm text-muted">
                  No leave requests yet. Tap <em>Apply for leave</em> to submit
                  your first one.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {requests.map((r) => (
                  <li
                    key={r.id}
                    className="px-5 py-4 flex items-center gap-3"
                    data-testid={`leave-request-${r.id}`}
                  >
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-2xs font-bold shrink-0 ${statusBadgeClass(r.status)}`}
                    >
                      {r.status}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-foreground">
                        {r.leaveCategory} ·{" "}
                        {formatDateRange(r.fromDate, r.toDate)}
                      </div>
                      <div className="text-xs text-muted mt-0.5">
                        {r.totalHours.toFixed(1)} hrs
                        {r.notes && (
                          <>
                            {" · "}
                            <span className="italic">&ldquo;{r.notes}&rdquo;</span>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {applyOpen && (
        <ApplyLeaveModal
          onClose={() => setApplyOpen(false)}
          onSubmitted={() => {
            // Same invalidations as the my-portal card: new pending row
            // + EH decrements available immediately on submission.
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

// ─── Sub-states ──────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="bg-card rounded-xl border border-border p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-32 mt-2" />
            <Skeleton className="h-3 w-16 mt-2" />
          </div>
        ))}
      </div>
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <Skeleton className="h-4 w-28" />
        </div>
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="px-5 py-4 flex items-center gap-3 border-b border-border last:border-0"
          >
            <Skeleton className="h-5 w-16 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** ONE friendly full-page state for not-linked (404) / not-configured (503). */
function NotAvailableState({ status }: { status: number }) {
  return (
    <div
      className="bg-card rounded-xl border border-border p-10 text-center shadow-warm"
      data-testid="my-leave-unavailable"
    >
      <CalendarOff className="w-10 h-10 text-muted mx-auto mb-3" aria-hidden />
      <h3 className="text-base font-semibold text-foreground">
        {status === 503
          ? "Leave isn't switched on yet"
          : "Your leave isn't linked yet"}
      </h3>
      <p className="text-sm text-muted mt-2 max-w-md mx-auto">
        {status === 503
          ? "The payroll integration isn't set up for this organisation yet. Ask your admin to enable it — your balances and requests will appear here automatically."
          : "Your account isn't connected to a payroll record yet, so we can't show balances or take requests. Ask your manager to link it — it only takes a minute."}
      </p>
    </div>
  );
}
