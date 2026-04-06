"use client";

import { useState, useMemo } from "react";
import { Plus, DollarSign, FileText, AlertTriangle, Send, CreditCard, Eye, XCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import {
  useBillingStatements,
  useIssueStatement,
  useVoidStatement,
  type StatementListItem,
} from "@/hooks/useBilling";
import { NewStatementDialog } from "./NewStatementDialog";
import { RecordPaymentDialog } from "./RecordPaymentDialog";
import { StatementDetailPanel } from "./StatementDetailPanel";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmt = (n: number) => `$${n.toFixed(2)}`;

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "issued", label: "Issued" },
  { value: "paid", label: "Paid" },
  { value: "unpaid", label: "Unpaid" },
  { value: "overdue", label: "Overdue" },
  { value: "void", label: "Void" },
] as const;

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  issued: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  unpaid: "bg-amber-100 text-amber-700",
  overdue: "bg-red-100 text-red-600",
  void: "bg-gray-100 text-gray-400 line-through",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BillingDashboard() {
  // Filters
  const [serviceId, setServiceId] = useState("");
  const [status, setStatus] = useState("");

  // Dialogs / panels
  const [newOpen, setNewOpen] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<{
    statementId: string;
    contactId: string;
    serviceId: string;
  } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [voidConfirmId, setVoidConfirmId] = useState<string | null>(null);

  // Data
  const { data, isLoading } = useBillingStatements({
    serviceId: serviceId || undefined,
    status: status || undefined,
  });

  const issueStatement = useIssueStatement();
  const voidStatement = useVoidStatement();

  const statements = data?.statements ?? [];

  // Summary cards
  const summary = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    let totalOutstanding = 0;
    let thisWeek = 0;
    let overdue = 0;

    for (const s of statements) {
      if (s.balance > 0) totalOutstanding += s.balance;
      if (s.status === "overdue") overdue++;
      if (new Date(s.periodStart) >= weekStart) thisWeek++;
    }

    return { totalOutstanding, thisWeek, overdue };
  }, [statements]);

  // Unique services for filter dropdown
  const serviceOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of statements) {
      map.set(s.service.id, s.service.name);
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [statements]);

  // Void confirm handler
  const handleVoid = (id: string) => {
    voidStatement.mutate(id);
    setVoidConfirmId(null);
  };

  if (isLoading) return <BillingSkeleton />;

  return (
    <>
      {/* Header */}
      <PageHeader
        title="Billing"
        description="Manage statements, payments, and family balances"
        primaryAction={{
          label: "New Statement",
          icon: Plus,
          onClick: () => setNewOpen(true),
        }}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <SummaryCard
          icon={DollarSign}
          label="Total Outstanding"
          value={fmt(summary.totalOutstanding)}
          color={summary.totalOutstanding > 0 ? "text-red-600" : "text-green-600"}
        />
        <SummaryCard
          icon={FileText}
          label="Statements This Week"
          value={String(summary.thisWeek)}
          color="text-foreground"
        />
        <SummaryCard
          icon={AlertTriangle}
          label="Overdue"
          value={String(summary.overdue)}
          color={summary.overdue > 0 ? "text-red-600" : "text-green-600"}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand/50"
          aria-label="Filter by service"
        >
          <option value="">All Services</option>
          {serviceOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand/50"
          aria-label="Filter by status"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Statements Table */}
      {statements.length === 0 ? (
        <div className="bg-card rounded-xl p-8 text-center shadow-sm border border-border">
          <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center mx-auto mb-3">
            <FileText className="w-6 h-6 text-brand" />
          </div>
          <h3 className="text-base font-heading font-semibold text-foreground mb-1">
            No statements found
          </h3>
          <p className="text-sm text-muted">
            {status || serviceId
              ? "Try adjusting your filters."
              : "Create your first statement to get started."}
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface/50">
                  <th className="text-left px-4 py-3 font-medium text-muted">Family</th>
                  <th className="text-left px-4 py-3 font-medium text-muted hidden sm:table-cell">Service</th>
                  <th className="text-left px-4 py-3 font-medium text-muted">Week</th>
                  <th className="text-right px-4 py-3 font-medium text-muted">Gap Fee</th>
                  <th className="text-right px-4 py-3 font-medium text-muted hidden sm:table-cell">Paid</th>
                  <th className="text-right px-4 py-3 font-medium text-muted">Balance</th>
                  <th className="text-center px-4 py-3 font-medium text-muted">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-muted">Actions</th>
                </tr>
              </thead>
              <tbody>
                {statements.map((stmt) => (
                  <tr key={stmt.id} className="border-b border-border last:border-0 hover:bg-surface/30 transition-colors">
                    <td className="px-4 py-3 text-foreground font-medium">
                      {[stmt.contact.firstName, stmt.contact.lastName].filter(Boolean).join(" ") || stmt.contact.email}
                    </td>
                    <td className="px-4 py-3 text-muted hidden sm:table-cell">{stmt.service.name}</td>
                    <td className="px-4 py-3 text-muted">
                      {formatDate(stmt.periodStart)}
                    </td>
                    <td className="px-4 py-3 text-right text-foreground">{fmt(stmt.gapFee)}</td>
                    <td className="px-4 py-3 text-right text-foreground hidden sm:table-cell">{fmt(stmt.amountPaid)}</td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right font-semibold",
                        stmt.balance === 0 ? "text-green-600" : "text-red-600"
                      )}
                    >
                      {fmt(stmt.balance)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={cn(
                          "inline-flex px-2 py-0.5 rounded-full text-xs font-semibold capitalize",
                          STATUS_BADGE[stmt.status] ?? "bg-gray-100 text-gray-600"
                        )}
                      >
                        {stmt.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {stmt.status === "draft" && (
                          <ActionBtn
                            icon={Send}
                            label="Issue"
                            onClick={() => issueStatement.mutate(stmt.id)}
                          />
                        )}
                        {(stmt.status === "issued" || stmt.status === "overdue") && (
                          <ActionBtn
                            icon={CreditCard}
                            label="Payment"
                            onClick={() =>
                              setPaymentTarget({
                                statementId: stmt.id,
                                contactId: stmt.contactId,
                                serviceId: stmt.serviceId,
                              })
                            }
                          />
                        )}
                        <ActionBtn
                          icon={Eye}
                          label="View"
                          onClick={() => setDetailId(stmt.id)}
                        />
                        {(stmt.status === "draft" || stmt.status === "issued") && (
                          <ActionBtn
                            icon={XCircle}
                            label="Void"
                            onClick={() => setVoidConfirmId(stmt.id)}
                            destructive
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Void Confirmation */}
      {voidConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-xl p-6 shadow-lg max-w-sm mx-4 w-full">
            <h3 className="text-base font-heading font-semibold text-foreground mb-2">
              Void Statement?
            </h3>
            <p className="text-sm text-muted mb-4">
              This action cannot be undone. The statement will be marked as void.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setVoidConfirmId(null)}
                className="px-4 py-2 text-sm rounded-lg border border-border bg-card hover:bg-surface transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleVoid(voidConfirmId)}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors min-h-[44px]"
              >
                Void Statement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <NewStatementDialog open={newOpen} onOpenChange={setNewOpen} />

      {paymentTarget && (
        <RecordPaymentDialog
          statementId={paymentTarget.statementId}
          contactId={paymentTarget.contactId}
          serviceId={paymentTarget.serviceId}
          open={!!paymentTarget}
          onOpenChange={(open) => {
            if (!open) setPaymentTarget(null);
          }}
        />
      )}

      <StatementDetailPanel
        statementId={detailId}
        onClose={() => setDetailId(null)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="bg-card rounded-xl p-4 shadow-sm border border-border">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-brand" />
        </div>
        <div>
          <p className="text-xs font-medium text-muted uppercase tracking-wider">
            {label}
          </p>
          <p className={cn("text-xl font-heading font-bold mt-0.5", color)}>
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: typeof Send;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "p-2 rounded-lg transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center",
        destructive
          ? "text-red-500 hover:bg-red-50 hover:text-red-600"
          : "text-muted hover:bg-surface hover:text-foreground"
      )}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function BillingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <Skeleton className="h-7 w-24 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-36 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-11 w-40 rounded-lg" />
        <Skeleton className="h-11 w-40 rounded-lg" />
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
