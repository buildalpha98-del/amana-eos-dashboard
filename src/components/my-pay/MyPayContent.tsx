"use client";

/**
 * MyPayContent — the /my-pay destination (staff Pay tab).
 *
 * Layout per Pay.dc.html / MobilePay.dc.html: latest-payslip hero,
 * a totals strip, then the full payslip history. Data comes from the
 * same `useMyPayslips` hook the My Portal card uses (shared cache).
 *
 * Honesty note: the API returns the recent payslips only — the totals
 * strip sums what's shown and says so. It is NOT a financial-year or
 * YTD figure and must not be labelled as one.
 */

import { useState } from "react";
import { Download, Eye, Wallet } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PayslipHeroCard } from "@/components/my-pay/PayslipHeroCard";
import { FileViewerModal } from "@/components/files/FileViewerModal";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  useMyPayslips,
  formatCurrency,
  formatPayPeriod,
  payslipDownloadUrl,
  type PayslipSummary,
} from "@/hooks/useMyPayslips";

export function MyPayContent() {
  const [viewing, setViewing] = useState<PayslipSummary | null>(null);
  const { data, isLoading, error } = useMyPayslips();

  const slips = data?.payslips ?? [];
  const errorStatus = error?.status;

  const latest = slips[0];
  const rest = slips.slice(1);

  const totals = slips.reduce(
    (acc, s) => ({
      gross: acc.gross + s.grossEarnings,
      net: acc.net + s.netEarnings,
      hours: acc.hours + s.totalHours,
    }),
    { gross: 0, net: 0, hours: 0 },
  );

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        title="Pay"
        description="Your payslips and pay history — synced from payroll."
      />

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      ) : errorStatus === 503 ? (
        <StateCard>
          Payroll integration isn&apos;t set up yet. Ask your admin to enable it.
        </StateCard>
      ) : errorStatus === 404 ? (
        <StateCard>
          Your account isn&apos;t linked to a payroll record yet. Ask your
          manager to set this up — it only takes a minute.
        </StateCard>
      ) : error ? (
        <StateCard tone="error">
          Unable to load payslips. Please refresh the page.
        </StateCard>
      ) : slips.length === 0 ? (
        <StateCard>
          No payslips yet. They&apos;ll appear here once your first pay run is
          processed.
        </StateCard>
      ) : (
        <div className="space-y-4">
          {latest && <PayslipHeroCard slip={latest} />}

          {/* Totals strip — sums the payslips the API returned, no more. */}
          <div
            className="bg-card border border-border rounded-xl px-4 py-3.5 sm:px-6"
            data-testid="my-pay-totals-strip"
          >
            <div className="grid grid-cols-3 gap-3">
              <TotalStat label="Gross" value={formatCurrency(totals.gross)} />
              <TotalStat label="Net" value={formatCurrency(totals.net)} />
              <TotalStat label="Hours" value={totals.hours.toFixed(1)} />
            </div>
            <p className="text-2xs text-muted mt-2">
              Across the {slips.length} payslip{slips.length === 1 ? "" : "s"}{" "}
              shown below.
            </p>
          </div>

          {/* History */}
          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
              <Wallet className="w-5 h-5 text-brand" aria-hidden="true" />
              {rest.length > 0 ? "Earlier payslips" : "Payslip history"}
            </h3>
            {rest.length === 0 ? (
              <p className="text-sm text-muted">
                Your latest payslip is shown above. Earlier ones will appear
                here as pay runs are processed.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {rest.map((slip) => (
                  <li
                    key={`${slip.payRunId}-${slip.id}`}
                    className="py-3 flex flex-wrap items-center gap-3"
                    data-testid={`my-pay-slip-${slip.payRunId}`}
                  >
                    <div className="flex-1 min-w-[200px]">
                      <button
                        type="button"
                        onClick={() => setViewing(slip)}
                        className="text-sm font-medium text-foreground hover:text-brand hover:underline text-left"
                      >
                        {formatPayPeriod(slip)}
                      </button>
                      <div className="text-xs text-muted mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>Gross: {formatCurrency(slip.grossEarnings)}</span>
                        <span>Net: {formatCurrency(slip.netEarnings)}</span>
                        {slip.totalHours > 0 && (
                          <span>{slip.totalHours.toFixed(2)} hrs</span>
                        )}
                        {!slip.isPublished && (
                          <span className="text-amber-600 dark:text-amber-400 font-medium">
                            Draft
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setViewing(slip)}
                      className="inline-flex items-center gap-1 text-sm text-brand hover:underline shrink-0"
                    >
                      <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                      View
                    </button>
                    <a
                      href={`${payslipDownloadUrl(slip.payRunId)}?download=1`}
                      className="inline-flex items-center gap-1 text-sm text-brand hover:underline shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      Download
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
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

/* ------------------------------------------------------------------ */
/* Bits                                                                */
/* ------------------------------------------------------------------ */

function TotalStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="font-heading font-bold text-lg text-foreground">
        {value}
      </div>
    </div>
  );
}

function StateCard({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "error";
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <p
        className={
          tone === "error"
            ? "text-sm text-red-600 dark:text-red-400"
            : "text-sm text-muted"
        }
      >
        {children}
      </p>
    </div>
  );
}
