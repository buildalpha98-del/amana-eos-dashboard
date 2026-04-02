"use client";

import { CreditCard, Download, FileText, AlertCircle, Building2 } from "lucide-react";
import { useParentStatements, type StatementRecord } from "@/hooks/useParentPortal";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  paid: { bg: "bg-green-100", text: "text-green-700", label: "Paid" },
  unpaid: { bg: "bg-amber-100", text: "text-amber-700", label: "Unpaid" },
  overdue: { bg: "bg-red-100", text: "text-red-600", label: "Overdue" },
};

export default function BillingPage() {
  const { data, isLoading } = useParentStatements();

  if (isLoading) return <BillingSkeleton />;

  const statements = data?.statements ?? [];
  const summary = data?.summary ?? { currentBalance: 0, overdueCount: 0 };

  const nextDebitDate = getNextDebitDate();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-heading font-bold text-[#1a1a2e]">
          Billing
        </h1>
        <p className="text-sm text-[#7c7c8a] mt-1">
          View your balance and download statements.
        </p>
      </div>

      {/* Balance summary */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-[#e8e4df]">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-[#7c7c8a] uppercase tracking-wider">
              Current Balance
            </p>
            <p
              className={cn(
                "text-3xl font-heading font-bold mt-1",
                summary.currentBalance === 0
                  ? "text-green-600"
                  : "text-red-600"
              )}
            >
              ${summary.currentBalance.toFixed(2)}
            </p>
          </div>
          {summary.overdueCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-100 text-red-600 text-xs font-semibold">
              <AlertCircle className="w-3 h-3" />
              {summary.overdueCount} overdue
            </span>
          )}
        </div>
        <div className="mt-3 pt-3 border-t border-[#e8e4df]">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#7c7c8a]">Next Direct Debit</span>
            <span className="text-sm font-medium text-[#1a1a2e]">
              {nextDebitDate}
            </span>
          </div>
        </div>
      </div>

      {/* Statements */}
      <section>
        <h2 className="text-sm font-heading font-semibold text-[#7c7c8a] uppercase tracking-wider mb-3">
          Statements
        </h2>

        {statements.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center shadow-sm border border-[#e8e4df]">
            <div className="w-12 h-12 rounded-full bg-[#FECE00]/20 flex items-center justify-center mx-auto mb-3">
              <FileText className="w-6 h-6 text-[#004E64]" />
            </div>
            <h3 className="text-base font-heading font-semibold text-[#1a1a2e] mb-1">
              No statements yet
            </h3>
            <p className="text-sm text-[#7c7c8a]">
              Statements will appear here once generated.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {statements.map((stmt) => (
              <StatementCard key={stmt.id} statement={stmt} />
            ))}
          </div>
        )}
      </section>

      {/* Payment Methods (mock — Australian direct debit) */}
      <section>
        <h2 className="text-sm font-heading font-semibold text-[#7c7c8a] uppercase tracking-wider mb-3">
          Payment Method
        </h2>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-[#e8e4df]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#004E64]/10 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-[#004E64]" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-[#1a1a2e]">
                Direct Debit — BSB 000-000
              </p>
              <p className="text-xs text-[#7c7c8a]">Account ending in 1234</p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-[#e8e4df]">
            <p className="text-xs text-[#7c7c8a]">
              To update your payment method, please contact the centre.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

// ── Statement Card ──────────────────────────────────────

function StatementCard({ statement }: { statement: StatementRecord }) {
  const status = STATUS_STYLES[statement.status] ?? STATUS_STYLES.unpaid;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  };

  const periodLabel = `${formatDate(statement.periodStart)} – ${formatDate(statement.periodEnd)}`;

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-[#e8e4df]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#1a1a2e]">{periodLabel}</p>
          <p className="text-xs text-[#7c7c8a] mt-0.5">
            {statement.service.name}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0",
            status.bg,
            status.text
          )}
        >
          {status.label}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3 text-center">
        <div>
          <p className="text-[10px] text-[#7c7c8a] uppercase">Fees</p>
          <p className="text-sm font-semibold text-[#1a1a2e]">
            ${statement.totalFees.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-[#7c7c8a] uppercase">CCS</p>
          <p className="text-sm font-semibold text-green-600">
            -${statement.totalCcs.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-[#7c7c8a] uppercase">Gap</p>
          <p className="text-sm font-semibold text-[#1a1a2e]">
            ${statement.gapFee.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Download PDF */}
      <div className="mt-3 pt-3 border-t border-[#e8e4df]">
        {statement.pdfUrl ? (
          <a
            href={statement.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#004E64] hover:text-[#0A7E9E] transition-colors min-h-[44px]"
          >
            <Download className="w-3.5 h-3.5" />
            Download PDF
          </a>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-[#7c7c8a] min-h-[44px]">
            <Download className="w-3.5 h-3.5" />
            PDF not yet available
          </span>
        )}
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────

function getNextDebitDate(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return next.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ── Skeleton ────────────────────────────────────────────

function BillingSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-24 mb-2" />
        <Skeleton className="h-4 w-56" />
      </div>
      <Skeleton className="h-36 w-full rounded-xl" />
      <div>
        <Skeleton className="h-4 w-28 mb-3" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl mb-2" />
        ))}
      </div>
      <div>
        <Skeleton className="h-4 w-36 mb-3" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    </div>
  );
}
