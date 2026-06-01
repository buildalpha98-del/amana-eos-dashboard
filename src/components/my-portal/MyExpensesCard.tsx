"use client";

/**
 * MyExpensesCard — staff-facing expense claim history + submit flow,
 * backed by Employment Hero Payroll.
 *
 * Mirrors MyLeaveRequestsCard layout: history list with status pills
 * at the top, "Submit expense" button opens a modal with category,
 * amount, date, description, receipt picker.
 *
 * V1 deliberately constrains each submission to ONE line item. EH
 * supports multi-line per request but the UI complexity isn't
 * justified for staff reimbursements.
 *
 * Receipt is optional but the UI strongly encourages it (warning
 * banner if Submit without one).
 */

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Receipt, X, AlertTriangle, Paperclip } from "lucide-react";
import { fetchApi, ApiResponseError } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

interface ExpenseLineItem {
  id: number;
  expenseCategoryId: number;
  expenseCategoryName: string | null;
  notes: string | null;
  amount: number;
  dateIncurred: string;
}

interface Attachment {
  id: number;
  friendlyName: string | null;
  url: string | null;
  isInfected: boolean;
}

interface ExpenseRequest {
  id: number;
  status: string;
  description: string | null;
  lineItems: ExpenseLineItem[];
  attachments: Attachment[];
  dateCreated: string | null;
  statusUpdateNotes: string | null;
  warning?: string; // tacked on by the POST handler for partial-success
}

interface ExpenseCategory {
  id: number;
  name: string;
  description: string | null;
}

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s.startsWith("approv")) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s.startsWith("reject") || s.startsWith("declin"))
    return "bg-red-50 text-red-700 border-red-200";
  if (s.startsWith("cancel")) return "bg-gray-100 text-gray-700 border-gray-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

function todayIso(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function formatHumanDate(iso: string | null): string {
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

function formatCurrency(n: number): string {
  return n.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  });
}

/** Total a request's line items — v1 always has 1 line, but render
 *  defensively in case a manager edits in EH to add more. */
function totalAmount(req: ExpenseRequest): number {
  return req.lineItems.reduce((sum, li) => sum + (li.amount ?? 0), 0);
}

export function MyExpensesCard() {
  const [submitOpen, setSubmitOpen] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery<
    { requests: ExpenseRequest[] },
    ApiResponseError
  >({
    queryKey: ["my-expenses"],
    queryFn: () => fetchApi("/api/my-portal/expenses"),
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
    <div className="bg-card rounded-xl border border-border p-6" data-testid="my-expenses-card">
      <div className="flex items-center justify-between mb-4 gap-2">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Receipt className="w-5 h-5 text-brand" />
          My Expenses
        </h3>
        {errorStatus !== 404 && errorStatus !== 503 && (
          <button
            type="button"
            onClick={() => setSubmitOpen(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90 transition-colors"
            data-testid="expense-submit-button"
          >
            <Plus className="w-4 h-4" />
            Submit expense
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted">Loading expenses…</p>
      ) : errorStatus === 503 ? (
        <p className="text-sm text-muted">
          Payroll integration isn&apos;t set up yet.
        </p>
      ) : errorStatus === 404 ? (
        <p className="text-sm text-muted">
          Your account isn&apos;t linked to a payroll record yet. Contact your
          manager so they can set you up in Settings → Team.
        </p>
      ) : error ? (
        <p className="text-sm text-red-600">
          Unable to load expenses. Please refresh the page.
        </p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-muted">
          No expenses yet. Click <em>Submit expense</em> to claim a reimbursement.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {requests.map((r) => {
            const firstLine = r.lineItems[0];
            const hasAttachment = r.attachments.length > 0;
            return (
              <li
                key={r.id}
                className="py-3 flex flex-wrap items-start gap-3"
                data-testid={`expense-${r.id}`}
              >
                <div className="flex-1 min-w-[200px]">
                  <div className="text-sm font-medium text-foreground flex items-center gap-2">
                    {firstLine?.expenseCategoryName ?? "Expense"}
                    {hasAttachment && (
                      <Paperclip
                        className="w-3.5 h-3.5 text-muted"
                        aria-label="Receipt attached"
                      />
                    )}
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    {firstLine?.dateIncurred && formatHumanDate(firstLine.dateIncurred)}
                    {" · "}
                    {formatCurrency(totalAmount(r))}
                  </div>
                  {r.description && (
                    <div className="text-xs text-muted mt-1 italic">
                      &ldquo;{r.description}&rdquo;
                    </div>
                  )}
                  {r.statusUpdateNotes && (
                    <div className="text-xs text-red-700 mt-1">
                      Manager note: {r.statusUpdateNotes}
                    </div>
                  )}
                </div>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-medium ${statusBadgeClass(r.status)}`}
                >
                  {r.status}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {submitOpen && (
        <SubmitExpenseModal
          onClose={() => setSubmitOpen(false)}
          onSubmitted={(warning) => {
            qc.invalidateQueries({ queryKey: ["my-expenses"] });
            setSubmitOpen(false);
            if (warning) {
              toast({
                variant: "destructive",
                description: warning,
              });
            } else {
              toast({ description: "Expense submitted for approval." });
            }
          }}
        />
      )}
    </div>
  );
}

// ─── Submit-expense modal ────────────────────────────────────────────

interface SubmitExpenseModalProps {
  onClose: () => void;
  /** Called on successful POST. `warning` is non-null when the request
   *  was created but the receipt upload failed (so we surface a
   *  destructive toast rather than a happy one). */
  onSubmitted: (warning: string | null) => void;
}

function SubmitExpenseModal({ onClose, onSubmitted }: SubmitExpenseModalProps) {
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [dateIncurred, setDateIncurred] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data: categoriesData, isLoading: catsLoading } = useQuery<{
    categories: ExpenseCategory[];
  }>({
    queryKey: ["my-expense-categories"],
    queryFn: () => fetchApi("/api/my-portal/expenses/categories"),
    staleTime: 30 * 60_000,
  });
  const categories = categoriesData?.categories ?? [];

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!categoryId) throw new Error("Pick an expense category");
      const amountNum = Number(amount);
      if (!Number.isFinite(amountNum) || amountNum <= 0) {
        throw new Error("Amount must be a positive number");
      }
      if (!description.trim()) throw new Error("Description is required");

      // multipart/form-data — `data` field is JSON, `receipt` is the
      // optional file. Server handles the two-step EH flow.
      const fd = new FormData();
      fd.append(
        "data",
        JSON.stringify({
          description: description.trim(),
          expenseCategoryId: categoryId,
          amount: amountNum,
          dateIncurred,
          notes: notes.trim() || undefined,
        }),
      );
      if (receipt) {
        fd.append("receipt", receipt, receipt.name);
      }
      const res = await fetch("/api/my-portal/expenses", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Submission failed (${res.status})`);
      }
      const json = (await res.json()) as ExpenseRequest;
      return json.warning ?? null;
    },
    onSuccess: (warning) => onSubmitted(warning),
    onError: (err: Error) => setSubmitError(err.message),
  });

  // Escape to close (unless submitting).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitMutation.isPending) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submitMutation.isPending, onClose]);

  const canSubmit =
    !!categoryId &&
    !!amount &&
    !!description.trim() &&
    !!dateIncurred &&
    !submitMutation.isPending;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-stretch sm:items-center justify-center sm:p-4"
      data-testid="expense-submit-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitMutation.isPending) onClose();
      }}
    >
      <div
        className="bg-card w-full h-full sm:h-auto sm:max-h-[90vh] sm:w-full sm:max-w-lg flex flex-col shadow-2xl sm:rounded-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="expense-submit-title"
        data-testid="expense-submit-dialog"
      >
        <header className="flex items-center justify-between gap-3 p-4 border-b border-border shrink-0">
          <h2 id="expense-submit-title" className="text-base font-semibold text-foreground">
            Submit expense
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
            <label htmlFor="expense-category" className="block text-sm font-medium text-foreground mb-1">
              Category
            </label>
            <select
              id="expense-category"
              value={categoryId ?? ""}
              onChange={(e) => setCategoryId(Number(e.target.value) || null)}
              disabled={catsLoading || submitMutation.isPending}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
              data-testid="expense-submit-category"
            >
              <option value="">
                {catsLoading ? "Loading…" : "Pick a category…"}
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
              <label htmlFor="expense-amount" className="block text-sm font-medium text-foreground mb-1">
                Amount (AUD)
              </label>
              <input
                id="expense-amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={submitMutation.isPending}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
                data-testid="expense-submit-amount"
              />
            </div>
            <div>
              <label htmlFor="expense-date" className="block text-sm font-medium text-foreground mb-1">
                Date incurred
              </label>
              <input
                id="expense-date"
                type="date"
                value={dateIncurred}
                max={todayIso()}
                onChange={(e) => setDateIncurred(e.target.value)}
                disabled={submitMutation.isPending}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
                data-testid="expense-submit-date"
              />
            </div>
          </div>

          <div>
            <label htmlFor="expense-description" className="block text-sm font-medium text-foreground mb-1">
              Description
            </label>
            <input
              id="expense-description"
              type="text"
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitMutation.isPending}
              placeholder="e.g. First aid course renewal"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
              data-testid="expense-submit-description"
            />
          </div>

          <div>
            <label htmlFor="expense-notes" className="block text-sm font-medium text-foreground mb-1">
              Notes <span className="text-muted">(optional)</span>
            </label>
            <textarea
              id="expense-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={submitMutation.isPending}
              maxLength={1000}
              rows={2}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 resize-y"
              data-testid="expense-submit-notes"
            />
          </div>

          <div>
            <label htmlFor="expense-receipt" className="block text-sm font-medium text-foreground mb-1">
              Receipt <span className="text-muted">(optional but recommended)</span>
            </label>
            <input
              id="expense-receipt"
              type="file"
              accept="application/pdf,image/jpeg,image/jpg,image/png,image/heic,image/heif,image/webp"
              onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
              disabled={submitMutation.isPending}
              className="block w-full text-sm text-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-brand/10 file:text-brand hover:file:bg-brand/20"
              data-testid="expense-submit-receipt"
            />
            <p className="mt-1 text-xs text-muted">
              PDF, JPG, PNG, HEIC, or WebP. Max 10 MB.
            </p>
            {!receipt && (
              <div className="mt-2 flex items-start gap-2 text-xs text-amber-700">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  No receipt attached — your manager may still approve, but
                  reimbursement is faster with one.
                </span>
              </div>
            )}
          </div>

          {submitError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
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
            data-testid="expense-submit-confirm"
          >
            {submitMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Submit for approval
          </button>
        </footer>
      </div>
    </div>
  );
}
