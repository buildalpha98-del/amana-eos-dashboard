"use client";

/**
 * /my-expenses — the full-page Reimbursements destination (Staff Portal
 * v2, Task 1.4).
 *
 * Composes the EXISTING Employment-Hero-backed data + submit flow from
 * MyExpensesCard (same queryKey, same modal — no forked data layer):
 *   - "Snap your receipt" hero: Take photo (capture="environment") and
 *     Upload both open the shared SubmitExpenseModal.
 *   - Totals strip derived client-side from the returned claims. The
 *     API returns the 20 most recent requests, so labels honestly say
 *     "recent claims shown" — never FY totals.
 *   - Claims list with a Submitted → Approval → In your pay pipeline
 *     strip on rows still awaiting approval.
 *
 * Design source: Expenses.dc.html / MobileExpenses.dc.html translated
 * into design tokens.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Paperclip, Receipt, Upload } from "lucide-react";
import { fetchApi, ApiResponseError } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  SubmitExpenseModal,
  statusBadgeClass,
  formatCurrency,
  formatHumanDate,
  totalAmount,
  type ExpenseRequest,
} from "@/components/my-portal/MyExpensesCard";

/* ------------------------------------------------------------------ */
/* Status buckets                                                      */
/* ------------------------------------------------------------------ */

type StatusKind = "pending" | "paid" | "rejected" | "cancelled";

/** Same prefix mapping the card's statusBadgeClass uses: approv* is the
 *  good terminal bucket, reject/declin and cancel prefixes are terminal-bad,
 *  everything else is still in flight. */
function statusKind(status: string): StatusKind {
  const s = status.toLowerCase();
  if (s.startsWith("approv") || s.startsWith("paid") || s.startsWith("process"))
    return "paid";
  if (s.startsWith("reject") || s.startsWith("declin")) return "rejected";
  if (s.startsWith("cancel")) return "cancelled";
  return "pending";
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function MyExpensesContent() {
  // null = closed; "photo" opens the modal with the camera capture
  // hint, "upload" opens it with the plain file picker.
  const [modalMode, setModalMode] = useState<"photo" | "upload" | null>(null);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery<
    { requests: ExpenseRequest[] },
    ApiResponseError
  >({
    queryKey: ["my-expenses"],
    queryFn: () => fetchApi("/api/my-portal/expenses"),
    // The page renders its own friendly 404/503/error states.
    meta: { suppressGlobalErrorToast: true },
    staleTime: 60_000,
    retry: (n, e) => {
      const s = (e as ApiResponseError)?.status;
      if (s === 404 || s === 503) return false;
      return n < 2;
    },
  });

  const requests = data?.requests ?? [];
  const errorStatus = (error as ApiResponseError | undefined)?.status;
  const notAvailable = errorStatus === 404 || errorStatus === 503;

  const pendingSum = requests
    .filter((r) => statusKind(r.status) === "pending")
    .reduce((sum, r) => sum + totalAmount(r), 0);
  const paidSum = requests
    .filter((r) => statusKind(r.status) === "paid")
    .reduce((sum, r) => sum + totalAmount(r), 0);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Reimbursements"
        description="Claim back what you've spent for the centre — approved claims land in your next pay."
      />

      {notAvailable ? (
        /* One consolidated friendly state — not a wall of broken cards. */
        <div
          className="bg-card rounded-xl border border-border p-8 text-center"
          data-testid="my-expenses-unavailable"
        >
          <div className="mx-auto w-12 h-12 rounded-full bg-surface flex items-center justify-center mb-4">
            <Receipt className="w-6 h-6 text-muted" aria-hidden="true" />
          </div>
          <h2 className="text-base font-semibold text-foreground mb-1">
            Reimbursements aren&apos;t available yet
          </h2>
          <p className="text-sm text-muted max-w-md mx-auto">
            {errorStatus === 503
              ? "Payroll integration isn't set up yet. Once it's connected, you'll be able to submit expense claims here."
              : "Your account isn't linked to a payroll record yet. Ask your manager to set this up — it only takes a minute."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr] lg:items-start">
          {/* ── Left column: snap hero + totals strip ─────────────── */}
          <div className="space-y-3">
            {/* Snap-your-receipt hero (dark card, accent CTA) */}
            <div
              className="bg-sidebar rounded-2xl p-6 flex flex-col items-center gap-3 text-center shadow-[var(--shadow-warm-md)]"
              data-testid="expense-snap-hero"
            >
              <div className="w-14 h-14 rounded-full bg-accent flex items-center justify-center">
                <Camera className="w-7 h-7 text-brand-dark" aria-hidden="true" />
              </div>
              <h2 className="text-lg font-heading font-semibold text-white">
                Snap your receipt
              </h2>
              <p className="text-xs text-white/75 max-w-60">
                Take a photo of the receipt, fill in the amount and what it was
                for, and it goes straight to your manager for approval.
              </p>
              <div className="flex gap-2 w-full mt-1">
                <button
                  type="button"
                  onClick={() => setModalMode("photo")}
                  className="flex-1 min-h-11 inline-flex items-center justify-center gap-1.5 bg-accent text-brand-dark rounded-lg px-3 py-2.5 text-sm font-bold hover:bg-accent/90 transition-colors"
                  data-testid="expense-take-photo"
                >
                  <Camera className="w-4 h-4" aria-hidden="true" />
                  Take photo
                </button>
                <button
                  type="button"
                  onClick={() => setModalMode("upload")}
                  className="flex-1 min-h-11 inline-flex items-center justify-center gap-1.5 border border-white/35 text-white rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-white/10 transition-colors"
                  data-testid="expense-upload"
                >
                  <Upload className="w-4 h-4" aria-hidden="true" />
                  Upload
                </button>
              </div>
            </div>

            {/* Totals strip — derived from the claims shown below (the
                API returns recent claims only, so don't claim FY sums). */}
            <div className="grid grid-cols-2 gap-3" data-testid="expense-totals">
              <div className="bg-card rounded-xl border border-border px-4 py-3">
                <div className="text-2xs text-muted">Awaiting approval</div>
                <div className="text-base font-bold text-amber-700 dark:text-amber-300">
                  {isLoading ? "—" : formatCurrency(pendingSum)}
                </div>
              </div>
              <div className="bg-card rounded-xl border border-border px-4 py-3">
                <div className="text-2xs text-muted">Approved &amp; paid</div>
                <div className="text-base font-bold text-emerald-700 dark:text-emerald-300">
                  {isLoading ? "—" : formatCurrency(paidSum)}
                </div>
              </div>
            </div>
            <p className="text-2xs text-muted text-center">
              Totals cover your recent claims shown here.
            </p>
          </div>

          {/* ── Right column: claims list ─────────────────────────── */}
          <div
            className="bg-card rounded-xl border border-border shadow-[var(--shadow-warm)] overflow-hidden"
            data-testid="expense-claims-list"
          >
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-bold text-foreground">Your claims</h2>
            </div>

            {isLoading ? (
              <p className="px-5 py-6 text-sm text-muted">Loading claims…</p>
            ) : error ? (
              <p className="px-5 py-6 text-sm text-red-600">
                Unable to load your claims. Please refresh the page.
              </p>
            ) : requests.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm text-muted">
                  No claims yet — snap a receipt to claim your first
                  reimbursement.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {requests.map((r) => (
                  <ClaimRow key={r.id} request={r} />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {modalMode !== null && (
        <SubmitExpenseModal
          capture={modalMode === "photo" ? "environment" : undefined}
          onClose={() => setModalMode(null)}
          onSubmitted={(warning) => {
            qc.invalidateQueries({ queryKey: ["my-expenses"] });
            setModalMode(null);
            if (warning) {
              toast({ variant: "destructive", description: warning });
            } else {
              toast({ description: "Expense submitted for approval." });
            }
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Claim row                                                           */
/* ------------------------------------------------------------------ */

function ClaimRow({ request }: { request: ExpenseRequest }) {
  const firstLine = request.lineItems[0];
  const hasAttachment = request.attachments.length > 0;
  const kind = statusKind(request.status);

  return (
    <li className="px-5 py-4" data-testid={`expense-claim-${request.id}`}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center shrink-0">
          <Receipt className="w-4.5 h-4.5 text-muted" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground truncate">
            {request.description ||
              firstLine?.expenseCategoryName ||
              "Expense claim"}
          </div>
          <div className="text-xs text-muted mt-0.5 flex flex-wrap items-center gap-x-1">
            <span className="font-medium">
              {formatCurrency(totalAmount(request))}
            </span>
            {firstLine?.dateIncurred && (
              <>
                <span aria-hidden="true">·</span>
                <span>{formatHumanDate(firstLine.dateIncurred)}</span>
              </>
            )}
            {firstLine?.expenseCategoryName && request.description && (
              <>
                <span aria-hidden="true">·</span>
                <span>{firstLine.expenseCategoryName}</span>
              </>
            )}
            {hasAttachment && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-0.5">
                  <Paperclip className="w-3 h-3" aria-hidden="true" />
                  receipt attached
                </span>
              </>
            )}
          </div>
          {request.statusUpdateNotes && (
            <div className="text-xs text-red-700 dark:text-red-300 mt-1">
              Manager note: {request.statusUpdateNotes}
            </div>
          )}
        </div>
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-2xs font-bold shrink-0 ${statusBadgeClass(request.status)}`}
        >
          {request.status}
        </span>
      </div>

      {/* Pipeline strip — only while the claim is still in flight */}
      {kind === "pending" && <PipelineStrip />}
    </li>
  );
}

/** Submitted → Approval → In your pay. Purely presentational: every
 *  non-terminal EH status sits at the "Approval" stage from the staff
 *  member's point of view (submitted is done, pay hasn't happened). */
function PipelineStrip() {
  return (
    <div
      className="flex items-center gap-1.5 mt-3 sm:ml-13"
      aria-label="Claim progress: submitted, awaiting approval"
      data-testid="expense-pipeline"
    >
      <span className="w-2 h-2 rounded-full bg-emerald-600" aria-hidden="true" />
      <span className="text-2xs text-muted">Submitted</span>
      <span className="flex-1 max-w-12 h-0.5 bg-emerald-600" aria-hidden="true" />
      <span className="w-2 h-2 rounded-full bg-amber-600" aria-hidden="true" />
      <span className="text-2xs font-bold text-amber-700 dark:text-amber-300">
        Approval
      </span>
      <span className="flex-1 max-w-12 h-0.5 bg-border" aria-hidden="true" />
      <span className="w-2 h-2 rounded-full bg-border" aria-hidden="true" />
      <span className="text-2xs text-muted">In your pay</span>
    </div>
  );
}
