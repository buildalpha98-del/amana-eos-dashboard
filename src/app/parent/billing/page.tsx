"use client";

import { useState } from "react";
import { Download, FileText, AlertCircle, Building2, ChevronDown, ChevronUp } from "lucide-react";
import { useParentStatements, useParentStatementDetail, type StatementRecord } from "@/hooks/useParentPortal";
import { SectionLabel, StatusBadge, type StatusVariant } from "@/components/parent/ui";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

const STATUS_TO_VARIANT: Record<string, StatusVariant> = {
  issued: "confirmed",
  paid: "in-care",
  unpaid: "requested",
  overdue: "overdue",
};

const SESSION_LABELS: Record<string, string> = {
  bsc: "Before School Care",
  asc: "After School Care",
  vc: "Vacation Care",
};

export default function BillingPage() {
  const { data, isLoading } = useParentStatements();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) return <BillingSkeleton />;

  const statements = data?.statements ?? [];
  const summary = data?.summary ?? { currentBalance: 0, overdueCount: 0 };

  const nextDebitDate = getNextDebitDate();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[24px] font-heading font-bold text-[color:var(--color-foreground)] leading-tight">
          Billing
        </h1>
        <p className="text-sm text-[color:var(--color-muted)] mt-1">
          View your balance and download statements.
        </p>
      </div>

      {/* Balance summary */}
      <div className="warm-card">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-heading font-semibold text-[color:var(--color-muted)] uppercase tracking-[0.08em]">
              Current Balance
            </p>
            <p
              className={cn(
                "text-3xl font-heading font-bold mt-1",
                summary.currentBalance === 0
                  ? "text-[color:var(--color-success)]"
                  : "text-[color:var(--color-status-alert-fg)]",
              )}
            >
              ${summary.currentBalance.toFixed(2)}
            </p>
          </div>
          {summary.overdueCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[color:var(--color-status-alert-bg)] text-[color:var(--color-status-alert-fg)] text-xs font-semibold">
              <AlertCircle className="w-3 h-3" />
              {summary.overdueCount} overdue
            </span>
          )}
        </div>
        <div className="mt-3 pt-3 border-t border-[color:var(--color-border)]">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[color:var(--color-muted)]">Next Direct Debit</span>
            <span className="text-sm font-medium text-[color:var(--color-foreground)]">
              {nextDebitDate}
            </span>
          </div>
        </div>
      </div>

      {/* Statements */}
      <section>
        <SectionLabel label="Statements" />

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
              <StatementCard
                key={stmt.id}
                statement={stmt}
                isExpanded={expandedId === stmt.id}
                onToggle={() =>
                  setExpandedId(expandedId === stmt.id ? null : stmt.id)
                }
              />
            ))}
          </div>
        )}
      </section>

      {/* Payment Methods */}
      <section>
        <SectionLabel label="Payment Method" />
        <div className="warm-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[color:var(--color-brand-soft)] flex items-center justify-center">
              <Building2 className="w-5 h-5 text-[color:var(--color-brand)]" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-[color:var(--color-foreground)]">
                Direct Debit — BSB 000-000
              </p>
              <p className="text-xs text-[color:var(--color-muted)]">
                Account ending in 1234
              </p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-[color:var(--color-border)]">
            <p className="text-xs text-[color:var(--color-muted)]">
              To update your payment method, please contact the centre.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

// ── Statement Card ──────────────────────────────────────

function StatementCard({
  statement,
  isExpanded,
  onToggle,
}: {
  statement: StatementRecord;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const statusVariant: StatusVariant =
    STATUS_TO_VARIANT[statement.status] ?? "requested";
  const statusLabel =
    statement.status.charAt(0).toUpperCase() + statement.status.slice(1);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  };

  const formatFullDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const periodLabel = `${formatDate(statement.periodStart)} – ${formatDate(statement.periodEnd)}`;

  return (
    <div className="warm-card !p-0 overflow-hidden">
      <button
        type="button"
        className="w-full p-4 text-left"
        onClick={onToggle}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[color:var(--color-foreground)]">{periodLabel}</p>
            <p className="text-xs text-[color:var(--color-muted)] mt-0.5">
              {statement.service.name}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge variant={statusVariant} label={statusLabel} />
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-[color:var(--color-muted)]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[color:var(--color-muted)]" />
            )}
          </div>
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

        {/* Paid / Balance row */}
        <div className="grid grid-cols-2 gap-2 mt-2 text-center">
          <div>
            <p className="text-[10px] text-[#7c7c8a] uppercase">Paid</p>
            <p className="text-sm font-semibold text-[#1a1a2e]">
              ${statement.amountPaid.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-[#7c7c8a] uppercase">Balance</p>
            <p
              className={cn(
                "text-sm font-semibold",
                statement.balance === 0 ? "text-green-600" : "text-red-600"
              )}
            >
              ${statement.balance.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Overdue due date */}
        {statement.status === "overdue" && statement.dueDate && (
          <p className="text-xs text-red-600 font-medium mt-2">
            Due: {formatFullDate(statement.dueDate)}
          </p>
        )}
      </button>

      {/* Download PDF */}
      <div className="px-4 pb-3 pt-0 border-t border-[#e8e4df] mx-4 mt-0">
        <div className="pt-3">
          {statement.pdfUrl ? (
            <a
              href={statement.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#004E64] hover:text-[#0A7E9E] transition-colors min-h-[44px]"
              onClick={(e) => e.stopPropagation()}
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

      {/* Expanded detail */}
      {isExpanded && (
        <StatementDetail statementId={statement.id} />
      )}
    </div>
  );
}

// ── Statement Detail (line items) ──────────────────────

function StatementDetail({ statementId }: { statementId: string }) {
  const { data, isLoading } = useParentStatementDetail(statementId);

  if (isLoading) {
    return (
      <div className="px-4 pb-4 space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }

  if (!data || data.lineItems.length === 0) {
    return (
      <div className="px-4 pb-4">
        <p className="text-xs text-[#7c7c8a]">No line items available.</p>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  };

  return (
    <div className="px-4 pb-4 border-t border-[#e8e4df] mx-4">
      <div className="pt-3">
        <p className="text-xs font-semibold text-[#7c7c8a] uppercase tracking-wider mb-2">
          Line Items
        </p>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[#7c7c8a] border-b border-[#e8e4df]">
                <th className="pb-1.5 px-1 font-medium">Child</th>
                <th className="pb-1.5 px-1 font-medium">Date</th>
                <th className="pb-1.5 px-1 font-medium">Session</th>
                <th className="pb-1.5 px-1 font-medium text-right">Gross</th>
                <th className="pb-1.5 px-1 font-medium text-right">CCS</th>
                <th className="pb-1.5 px-1 font-medium text-right">Gap</th>
              </tr>
            </thead>
            <tbody>
              {data.lineItems.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-[#e8e4df] last:border-0"
                >
                  <td className="py-1.5 px-1 text-[#1a1a2e]">
                    {item.child.firstName}
                  </td>
                  <td className="py-1.5 px-1 text-[#7c7c8a]">
                    {formatDate(item.date)}
                  </td>
                  <td className="py-1.5 px-1 text-[#7c7c8a]">
                    {SESSION_LABELS[item.sessionType] ?? item.sessionType}
                  </td>
                  <td className="py-1.5 px-1 text-right text-[#1a1a2e]">
                    ${item.grossFee.toFixed(2)}
                  </td>
                  <td className="py-1.5 px-1 text-right text-green-600">
                    -${item.ccsAmount.toFixed(2)}
                  </td>
                  <td className="py-1.5 px-1 text-right text-[#1a1a2e]">
                    ${item.gapAmount.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
