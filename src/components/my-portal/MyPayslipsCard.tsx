"use client";

/**
 * MyPayslipsCard — staff-facing payslip list on My Portal.
 *
 * Renders the 12 most recent pay-run summaries from Employment Hero
 * Payroll. Each row has a "View" button that opens the existing
 * FileViewerModal pointed at our proxy endpoint, plus a download link.
 *
 * Empty + error states are deliberately distinct:
 *   - integration not configured (503): "Payroll integration not set up."
 *   - user not mapped (404):             "Contact your manager."
 *   - genuine fetch error:               retry-friendly message.
 *
 * No client-side filtering. The server already scopes to the signed-in
 * user via `requireOwnEmployee`; this component never sees another
 * user's payslips.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Eye, Wallet } from "lucide-react";
import { FileViewerModal } from "@/components/files/FileViewerModal";
import { fetchApi, ApiResponseError } from "@/lib/fetch-api";

interface PayslipSummary {
  id: number;
  payRunId: number;
  payPeriodStarting: string | null;
  payPeriodEnding: string | null;
  grossEarnings: number;
  netEarnings: number;
  totalHours: number;
  isPublished: boolean;
}

interface PayslipsResponse {
  payslips: PayslipSummary[];
}

// EH returns dates as DD/MM/YYYY strings — pass them through to the UI
// rather than re-parsing, so what staff see matches what EH would show
// in their own portal. If we ever switch source, this helper isolates
// the formatting.
function formatPayPeriod(slip: PayslipSummary): string {
  const start = slip.payPeriodStarting;
  const end = slip.payPeriodEnding;
  if (start && end) return `${start} – ${end}`;
  return end ?? start ?? "—";
}

function formatCurrency(n: number): string {
  return n.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  });
}

export function MyPayslipsCard() {
  const [viewing, setViewing] = useState<PayslipSummary | null>(null);

  const { data, isLoading, error } = useQuery<PayslipsResponse, ApiResponseError>({
    queryKey: ["my-payslips"],
    queryFn: () => fetchApi<PayslipsResponse>("/api/my-portal/payslips"),
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

  const slips = data?.payslips ?? [];
  const errorStatus = (error as ApiResponseError | undefined)?.status;

  return (
    <div className="bg-card rounded-xl border border-border p-6" data-testid="my-payslips-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Wallet className="w-5 h-5 text-brand" />
          My Payslips
        </h3>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted">Loading payslips…</p>
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
          Unable to load payslips. Please refresh the page.
        </p>
      ) : slips.length === 0 ? (
        <p className="text-sm text-muted">
          No payslips yet. They&apos;ll appear here once your first pay run is processed.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {slips.map((slip) => (
            <li
              key={`${slip.payRunId}-${slip.id}`}
              className="py-3 flex flex-wrap items-center gap-3"
              data-testid={`my-payslip-${slip.payRunId}`}
            >
              <div className="flex-1 min-w-[200px]">
                <button
                  type="button"
                  onClick={() => setViewing(slip)}
                  className="text-sm font-medium text-foreground hover:text-brand hover:underline text-left"
                  data-testid="payslip-period-button"
                >
                  {formatPayPeriod(slip)}
                </button>
                <div className="text-xs text-muted mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                  <span>Gross: {formatCurrency(slip.grossEarnings)}</span>
                  <span>Net: {formatCurrency(slip.netEarnings)}</span>
                  {slip.totalHours > 0 && <span>{slip.totalHours.toFixed(2)} hrs</span>}
                  {!slip.isPublished && (
                    <span className="text-amber-600 font-medium">Draft</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewing(slip)}
                className="inline-flex items-center gap-1 text-sm text-brand hover:underline shrink-0"
                data-testid="payslip-view-button"
              >
                <Eye className="w-3.5 h-3.5" />
                View
              </button>
              <a
                href={`/api/my-portal/payslips/${slip.payRunId}/download?download=1`}
                className="inline-flex items-center gap-1 text-sm text-brand hover:underline shrink-0"
                data-testid="payslip-download-link"
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </a>
            </li>
          ))}
        </ul>
      )}

      {viewing && (
        <FileViewerModal
          open={!!viewing}
          onClose={() => setViewing(null)}
          title={`Payslip — ${formatPayPeriod(viewing)}`}
          viewerUrl={`/api/my-portal/payslips/${viewing.payRunId}/download`}
          downloadUrl={`/api/my-portal/payslips/${viewing.payRunId}/download?download=1`}
          fileName={`payslip-${viewing.payRunId}.pdf`}
        />
      )}
    </div>
  );
}
