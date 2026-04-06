"use client";

import { X, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";
import { useBillingStatementDetail } from "@/hooks/useBilling";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmt = (n: number) => `$${n.toFixed(2)}`;

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const SESSION_LABELS: Record<string, string> = {
  bsc: "BSC",
  asc: "ASC",
  vc: "VAC",
};

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  issued: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  unpaid: "bg-amber-100 text-amber-700",
  overdue: "bg-red-100 text-red-600",
  void: "bg-gray-100 text-gray-400 line-through",
};

const METHOD_LABELS: Record<string, string> = {
  bank_transfer: "Bank Transfer",
  cash: "Cash",
  card: "Card",
  direct_debit: "Direct Debit",
  other: "Other",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StatementDetailPanel({
  statementId,
  onClose,
}: {
  statementId: string | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useBillingStatementDetail(statementId);

  if (!statementId) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full sm:max-w-lg bg-card shadow-xl overflow-y-auto animate-slide-in-right">
        {/* Header */}
        <div className="sticky top-0 bg-card z-10 flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-heading font-semibold text-foreground">
            Statement Detail
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-surface transition-colors"
            aria-label="Close panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isLoading ? (
          <PanelSkeleton />
        ) : !data ? (
          <div className="p-4 text-sm text-muted">Statement not found.</div>
        ) : (
          <div className="p-4 space-y-6">
            {/* Meta */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-heading font-semibold text-foreground">
                  {[data.contact.firstName, data.contact.lastName]
                    .filter(Boolean)
                    .join(" ") || data.contact.email}
                </h3>
                <span
                  className={cn(
                    "inline-flex px-2 py-0.5 rounded-full text-xs font-semibold capitalize",
                    STATUS_BADGE[data.status] ?? "bg-gray-100 text-gray-600"
                  )}
                >
                  {data.status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted">
                <p>
                  <span className="font-medium">Service:</span>{" "}
                  {data.service.name}
                </p>
                <p>
                  <span className="font-medium">Period:</span>{" "}
                  {formatDate(data.periodStart)} &ndash;{" "}
                  {formatDate(data.periodEnd)}
                </p>
                {data.dueDate && (
                  <p>
                    <span className="font-medium">Due:</span>{" "}
                    {formatDate(data.dueDate)}
                  </p>
                )}
                {data.issuedAt && (
                  <p>
                    <span className="font-medium">Issued:</span>{" "}
                    {formatDate(data.issuedAt)}
                  </p>
                )}
              </div>

              {/* Summary */}
              <div className="grid grid-cols-4 gap-2 pt-2 border-t border-border text-center text-xs">
                <div>
                  <p className="text-muted">Gross</p>
                  <p className="font-semibold text-foreground">{fmt(data.totalFees)}</p>
                </div>
                <div>
                  <p className="text-muted">CCS</p>
                  <p className="font-semibold text-green-600">{fmt(data.totalCcs)}</p>
                </div>
                <div>
                  <p className="text-muted">Gap</p>
                  <p className="font-semibold text-foreground">{fmt(data.gapFee)}</p>
                </div>
                <div>
                  <p className="text-muted">Balance</p>
                  <p
                    className={cn(
                      "font-semibold",
                      data.balance === 0 ? "text-green-600" : "text-red-600"
                    )}
                  >
                    {fmt(data.balance)}
                  </p>
                </div>
              </div>

              {data.notes && (
                <p className="text-xs text-muted bg-surface rounded-lg p-2 mt-2">
                  {data.notes}
                </p>
              )}
            </div>

            {/* Line Items */}
            <section>
              <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                Line Items ({data.lineItems.length})
              </h4>
              {data.lineItems.length === 0 ? (
                <p className="text-xs text-muted">No line items.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted border-b border-border">
                        <th className="pb-1.5 pr-2 font-medium">Child</th>
                        <th className="pb-1.5 pr-2 font-medium">Date</th>
                        <th className="pb-1.5 pr-2 font-medium">Session</th>
                        <th className="pb-1.5 pr-2 font-medium text-right">Gross</th>
                        <th className="pb-1.5 pr-2 font-medium text-right">CCS</th>
                        <th className="pb-1.5 font-medium text-right">Gap</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.lineItems.map((li) => (
                        <tr
                          key={li.id}
                          className="border-b border-border last:border-0"
                        >
                          <td className="py-1.5 pr-2 text-foreground">
                            {li.child.firstName}{" "}
                            {li.child.surname ? li.child.surname[0] + "." : ""}
                          </td>
                          <td className="py-1.5 pr-2 text-muted">
                            {formatDate(li.date)}
                          </td>
                          <td className="py-1.5 pr-2 text-muted">
                            {SESSION_LABELS[li.sessionType] ?? li.sessionType}
                          </td>
                          <td className="py-1.5 pr-2 text-right text-foreground">
                            {fmt(li.grossFee)}
                          </td>
                          <td className="py-1.5 pr-2 text-right text-green-600">
                            -{fmt(li.ccsAmount)}
                          </td>
                          <td className="py-1.5 text-right text-foreground">
                            {fmt(li.gapAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Payments */}
            <section>
              <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                Payments ({data.payments.length})
              </h4>
              {data.payments.length === 0 ? (
                <p className="text-xs text-muted">No payments recorded.</p>
              ) : (
                <div className="space-y-2">
                  {data.payments.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-2 bg-surface rounded-lg"
                    >
                      <div>
                        <p className="text-xs font-medium text-foreground">
                          {fmt(p.amount)}{" "}
                          <span className="text-muted font-normal">
                            via {METHOD_LABELS[p.method] ?? p.method}
                          </span>
                        </p>
                        <p className="text-[10px] text-muted">
                          {formatDate(p.receivedAt)}
                          {p.reference && ` \u00b7 Ref: ${p.reference}`}
                          {p.recordedBy && ` \u00b7 By: ${p.recordedBy.name}`}
                        </p>
                        {p.notes && (
                          <p className="text-[10px] text-muted mt-0.5">
                            {p.notes}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* PDF Download */}
            {data.pdfUrl && (
              <a
                href={data.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:text-brand-hover transition-colors min-h-[44px]"
              >
                <Download className="w-4 h-4" />
                Download PDF
              </a>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function PanelSkeleton() {
  return (
    <div className="p-4 space-y-4">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-32" />
      <div className="grid grid-cols-4 gap-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-32 w-full rounded-lg" />
      <Skeleton className="h-20 w-full rounded-lg" />
    </div>
  );
}
