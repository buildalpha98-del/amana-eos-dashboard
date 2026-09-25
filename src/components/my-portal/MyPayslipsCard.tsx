"use client";

/**
 * MyPayslipsCard — staff-facing payslip list on My Portal.
 *
 * Renders the 12 most recent pay-run summaries from Employment Hero
 * Payroll. Each row has a "View" button that opens the existing
 * FileViewerModal pointed at our proxy endpoint, plus a download link.
 *
 * Data comes from the shared `useMyPayslips` hook (also powering the
 * /my-pay destination — same query key, same cache entry).
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
import { Download, Eye, Wallet } from "lucide-react";
import { FileViewerModal } from "@/components/files/FileViewerModal";
import {
  useMyPayslips,
  formatCurrency,
  formatPayPeriod,
  payslipDownloadUrl,
  type PayslipSummary,
} from "@/hooks/useMyPayslips";

export function MyPayslipsCard() {
  const [viewing, setViewing] = useState<PayslipSummary | null>(null);

  const { data, isLoading, error } = useMyPayslips();

  const slips = data?.payslips ?? [];
  const errorStatus = error?.status;

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
          Your account isn&apos;t linked to a payroll record yet. Ask your
          manager to set this up — it only takes a minute.
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
                href={`${payslipDownloadUrl(slip.payRunId)}?download=1`}
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
          viewerUrl={payslipDownloadUrl(viewing.payRunId)}
          downloadUrl={`${payslipDownloadUrl(viewing.payRunId)}?download=1`}
          fileName={`payslip-${viewing.payRunId}.pdf`}
        />
      )}
    </div>
  );
}
