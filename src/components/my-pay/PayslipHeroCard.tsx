"use client";

/**
 * PayslipHeroCard — the dark "latest payslip" hero on /my-pay.
 *
 * Visual contract from Pay.dc.html / MobilePay.dc.html: dark bg-sidebar
 * card, big net amount in the heading face, accent "net" tag, a
 * gross / tax / hours line (tax derived as gross − net — EH's summary
 * endpoint doesn't return tax separately), and View / Download CTAs.
 * Mobile stacks the CTAs full-width under the figures; sm+ splits them
 * to the right, per the mockups.
 */

import { Download, Eye } from "lucide-react";
import {
  formatCurrency,
  formatPayPeriod,
  payslipDownloadUrl,
  type PayslipSummary,
} from "@/hooks/useMyPayslips";

export function PayslipHeroCard({ slip }: { slip: PayslipSummary }) {
  const deductions = Math.max(0, slip.grossEarnings - slip.netEarnings);
  const downloadUrl = payslipDownloadUrl(slip.payRunId);

  return (
    <div
      className="bg-sidebar text-white rounded-2xl p-6 sm:p-7 shadow-[var(--shadow-warm-lg)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5"
      data-testid="payslip-hero-card"
    >
      <div className="min-w-0">
        <div className="text-xs sm:text-sm text-white/65">
          Latest payslip · {formatPayPeriod(slip)}
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 mt-1.5">
          <div className="font-heading font-bold text-4xl sm:text-5xl tracking-tight leading-none">
            {formatCurrency(slip.netEarnings)}
          </div>
          <div className="text-sm text-accent font-semibold">
            net{!slip.isPublished && " · draft"}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3.5 text-xs sm:text-sm text-white/80">
          <div>
            Gross{" "}
            <strong className="text-white font-semibold">
              {formatCurrency(slip.grossEarnings)}
            </strong>
          </div>
          <div>
            Deductions{" "}
            <strong className="text-white font-semibold">
              {formatCurrency(deductions)}
            </strong>
          </div>
          {slip.totalHours > 0 && (
            <div>
              Hours{" "}
              <strong className="text-white font-semibold">
                {slip.totalHours}
              </strong>
            </div>
          )}
        </div>
      </div>

      <div className="flex sm:flex-col gap-2.5 shrink-0">
        <a
          href={downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 bg-accent text-brand-dark rounded-lg px-5 py-2.5 min-h-[44px] text-sm font-bold text-center hover:opacity-90 transition-opacity"
          data-testid="payslip-hero-view"
        >
          <Eye className="w-4 h-4" aria-hidden="true" />
          View payslip
        </a>
        <a
          href={`${downloadUrl}?download=1`}
          className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 border border-white/35 rounded-lg px-5 py-2.5 min-h-[44px] text-sm font-semibold text-center hover:bg-white/10 transition-colors"
          data-testid="payslip-hero-download"
        >
          <Download className="w-4 h-4" aria-hidden="true" />
          Download PDF
        </a>
      </div>
    </div>
  );
}
