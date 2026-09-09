"use client";

/**
 * useMyPayslips — shared payslip query for the staff pay surfaces.
 *
 * Lifted out of MyPayslipsCard so the My Portal card and the /my-pay
 * destination share one query (same key, same cache entry). The server
 * scopes to the signed-in user via `requireOwnEmployee`; this hook never
 * sees another user's payslips.
 *
 * Error semantics (rendered inline by consumers, hence the suppressed
 * global toast):
 *   - 503: payroll integration not configured
 *   - 404: user not mapped to a payroll employee
 *   - anything else: genuine fetch error, retried twice
 */

import { useQuery } from "@tanstack/react-query";
import { fetchApi, ApiResponseError } from "@/lib/fetch-api";

export interface PayslipSummary {
  id: number;
  payRunId: number;
  payPeriodStarting: string | null;
  payPeriodEnding: string | null;
  grossEarnings: number;
  netEarnings: number;
  totalHours: number;
  isPublished: boolean;
}

export interface PayslipsResponse {
  payslips: PayslipSummary[];
}

// EH returns dates as DD/MM/YYYY strings — pass them through to the UI
// rather than re-parsing, so what staff see matches what EH would show
// in their own portal. If we ever switch source, this helper isolates
// the formatting.
export function formatPayPeriod(slip: PayslipSummary): string {
  const start = slip.payPeriodStarting;
  const end = slip.payPeriodEnding;
  if (start && end) return `${start} – ${end}`;
  return end ?? start ?? "—";
}

export function formatCurrency(n: number): string {
  return n.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  });
}

export function payslipDownloadUrl(payRunId: number): string {
  return `/api/my-portal/payslips/${payRunId}/download`;
}

export function useMyPayslips() {
  return useQuery<PayslipsResponse, ApiResponseError>({
    queryKey: ["my-payslips"],
    queryFn: () => fetchApi<PayslipsResponse>("/api/my-portal/payslips"),
    // Consumers render their own inline error/empty states (404 = not
    // linked, 503 = not configured) — the global error toast is noise.
    meta: { suppressGlobalErrorToast: true },
    // Payslips don't change often. 5 min stale window is plenty.
    staleTime: 5 * 60_000,
    retry: (failureCount, err) => {
      // 404 (user not mapped) and 503 (not configured) are terminal —
      // retrying won't help and burns API budget.
      const status = (err as ApiResponseError)?.status;
      if (status === 404 || status === 503) return false;
      return failureCount < 2;
    },
  });
}
