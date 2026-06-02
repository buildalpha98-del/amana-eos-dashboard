"use client";

/**
 * ServicePurchaseApprovalsTab — Finance → Approvals sub-tab.
 *
 * Staff at the service raise approval requests BEFORE buying
 * something with personal funds. Admin (or the service manager)
 * approves or rejects. On approval, the staff member is told to
 * complete the purchase and submit an expense claim through My
 * Portal → My Expenses.
 *
 * Notifications fire on every status change so the requester sees
 * the outcome in the bell-icon menu without refreshing.
 *
 * Roles:
 *   - admin / owner / head_office: see + decide every request
 *   - service manager: see + decide every request for THEIR service
 *   - other staff at the service: see + create their OWN requests;
 *     can cancel a pending one
 *
 * 2026-06-02.
 */

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Loader2,
  X,
  CheckCircle2,
  XCircle,
  Clock,
  Receipt,
  ShoppingBag,
  AlertCircle,
} from "lucide-react";
import { fetchApi, mutateApi, ApiResponseError } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";

type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";

interface Approval {
  id: string;
  serviceId: string;
  vendor: string;
  product: string;
  costCents: number;
  reason: string | null;
  status: ApprovalStatus;
  requestedById: string;
  requestedBy: { id: string; name: string };
  decidedById: string | null;
  decidedBy: { id: string; name: string } | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

const ADMIN_ROLES = new Set(["owner", "head_office", "admin"]);

function statusPill(s: ApprovalStatus): string {
  switch (s) {
    case "approved":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "rejected":
      return "bg-red-50 text-red-700 border-red-200";
    case "cancelled":
      return "bg-gray-50 text-gray-700 border-gray-200";
    default:
      return "bg-amber-50 text-amber-700 border-amber-200";
  }
}

function statusIcon(s: ApprovalStatus) {
  switch (s) {
    case "approved":
      return <CheckCircle2 className="w-3.5 h-3.5" />;
    case "rejected":
      return <XCircle className="w-3.5 h-3.5" />;
    case "cancelled":
      return <X className="w-3.5 h-3.5" />;
    default:
      return <Clock className="w-3.5 h-3.5" />;
  }
}

function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
  });
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export interface ServicePurchaseApprovalsTabProps {
  serviceId: string;
  serviceName: string;
}

export function ServicePurchaseApprovalsTab({
  serviceId,
  serviceName,
}: ServicePurchaseApprovalsTabProps) {
  const { data: session } = useSession();
  const callerId = session?.user?.id;
  const callerRole = session?.user?.role as string | undefined;
  const callerIsAdmin = ADMIN_ROLES.has(callerRole ?? "");

  const [createOpen, setCreateOpen] = useState(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<
    { approvals: Approval[] },
    ApiResponseError
  >({
    queryKey: ["purchase-approvals", serviceId],
    queryFn: () => fetchApi(`/api/services/${serviceId}/purchase-approvals`),
    staleTime: 30_000,
  });

  const approvals = data?.approvals ?? [];

  // Sort pending first, then by createdAt desc.
  const sorted = useMemo(() => {
    const order: Record<ApprovalStatus, number> = {
      pending: 0,
      approved: 1,
      rejected: 2,
      cancelled: 3,
    };
    return [...approvals].sort((a, b) => {
      const so = order[a.status] - order[b.status];
      if (so !== 0) return so;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [approvals]);

  const deciding = sorted.find((a) => a.id === decidingId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Receipt className="w-4 h-4 text-muted" />
            Purchase approvals
          </h3>
          <p className="text-sm text-muted">
            Request approval BEFORE buying something with your own funds.
            Once approved, complete the purchase and submit an expense
            claim from My Portal → My Expenses.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90 shrink-0"
        >
          <Plus className="w-4 h-4" />
          New approval request
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-600">Unable to load approvals.</p>
      ) : sorted.length === 0 ? (
        <EmptyState onClick={() => setCreateOpen(true)} />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {sorted.map((a) => {
            const canDecide =
              a.status === "pending" && callerIsAdmin;
            const canCancel =
              a.status === "pending" && a.requestedById === callerId;
            return (
              <li
                key={a.id}
                className="p-3 flex flex-wrap items-start gap-3"
                data-testid={`approval-${a.id}`}
              >
                <div className="shrink-0 p-1.5 rounded-md border bg-surface text-muted">
                  <ShoppingBag className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {a.product}
                    </span>
                    <span className="text-xs text-muted">from {a.vendor}</span>
                    <span className="text-sm font-semibold text-foreground">
                      {formatMoney(a.costCents)}
                    </span>
                  </div>
                  <div className="text-xs text-muted mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span>Requested by {a.requestedBy.name}</span>
                    <span>·</span>
                    <span>{formatDate(a.createdAt)}</span>
                    {a.decidedBy && a.decidedAt && (
                      <>
                        <span>·</span>
                        <span>
                          {a.status === "approved" ? "Approved" : a.status === "rejected" ? "Rejected" : "Decided"} by{" "}
                          {a.decidedBy.name} on {formatDate(a.decidedAt)}
                        </span>
                      </>
                    )}
                  </div>
                  {a.reason && (
                    <p className="text-xs text-muted mt-1">
                      <span className="font-semibold">Reason:</span> {a.reason}
                    </p>
                  )}
                  {a.decisionNote && (
                    <p className="text-xs text-muted mt-1">
                      <span className="font-semibold">
                        {a.status === "approved" ? "Approver note" : "Reason"}:
                      </span>{" "}
                      {a.decisionNote}
                    </p>
                  )}
                  {a.status === "approved" && a.requestedById === callerId && (
                    <p className="text-xs text-emerald-700 mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Next: complete the purchase, then submit an expense
                      claim from My Portal → My Expenses.
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-medium",
                      statusPill(a.status),
                    )}
                  >
                    {statusIcon(a.status)}
                    {a.status[0].toUpperCase() + a.status.slice(1)}
                  </span>
                  {canDecide && (
                    <button
                      type="button"
                      onClick={() => setDecidingId(a.id)}
                      className="text-xs text-brand hover:underline"
                    >
                      Review
                    </button>
                  )}
                  {canCancel && (
                    <CancelButton
                      serviceId={serviceId}
                      approvalId={a.id}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {createOpen && (
        <CreateApprovalModal
          serviceId={serviceId}
          serviceName={serviceName}
          onClose={() => setCreateOpen(false)}
        />
      )}
      {deciding && (
        <DecideApprovalModal
          serviceId={serviceId}
          approval={deciding}
          onClose={() => setDecidingId(null)}
        />
      )}
    </div>
  );
}

function EmptyState({ onClick }: { onClick: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-6 text-center">
      <Receipt className="w-8 h-8 mx-auto mb-2 text-border" />
      <p className="text-sm text-muted">No purchase approvals yet.</p>
      <p className="text-xs text-muted mt-1">
        Need to buy something for the centre with your own money? Raise an
        approval first.
      </p>
      <button
        type="button"
        onClick={onClick}
        className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90"
      >
        <Plus className="w-4 h-4" />
        New approval request
      </button>
    </div>
  );
}

// ── Create modal ────────────────────────────────────────────────────

function CreateApprovalModal({
  serviceId,
  serviceName,
  onClose,
}: {
  serviceId: string;
  serviceName: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [vendor, setVendor] = useState("");
  const [product, setProduct] = useState("");
  const [costDollars, setCostDollars] = useState("");
  const [reason, setReason] = useState("");

  const submit = useMutation({
    mutationFn: () =>
      mutateApi(`/api/services/${serviceId}/purchase-approvals`, {
        method: "POST",
        body: {
          vendor: vendor.trim(),
          product: product.trim(),
          costDollars: Number(costDollars),
          reason: reason.trim() || null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["purchase-approvals", serviceId],
      });
      toast({ description: "Approval request submitted." });
      onClose();
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  const cost = Number(costDollars);
  const canSubmit =
    !!vendor.trim() &&
    !!product.trim() &&
    !isNaN(cost) &&
    cost > 0 &&
    cost <= 5000 &&
    !submit.isPending;

  return (
    <ModalShell
      title={`New purchase approval — ${serviceName}`}
      onClose={onClose}
      disabled={submit.isPending}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={submit.isPending}
            className="px-4 py-2 text-sm text-muted hover:text-foreground rounded-md border border-border disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => submit.mutate()}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90 disabled:opacity-50"
          >
            {submit.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Submit for approval
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Store / vendor">
          <input
            type="text"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            maxLength={200}
            disabled={submit.isPending}
            placeholder="e.g. Officeworks"
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Cost (AUD)">
          <input
            type="number"
            step="0.01"
            min="0.01"
            max="5000"
            value={costDollars}
            onChange={(e) => setCostDollars(e.target.value)}
            disabled={submit.isPending}
            placeholder="20.00"
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          />
        </Field>
      </div>
      <Field label="Product / what you want to buy">
        <input
          type="text"
          value={product}
          onChange={(e) => setProduct(e.target.value)}
          maxLength={500}
          disabled={submit.isPending}
          placeholder="e.g. Pack of coloring pens (50ct)"
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
        />
      </Field>
      <Field label="Reason (optional)">
        <textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={2000}
          disabled={submit.isPending}
          placeholder="Why does the centre need this? Helps admin approve faster."
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
        />
      </Field>
      <div className="rounded-md border border-blue-200 bg-blue-50/40 p-3 text-xs text-blue-900">
        <p className="font-semibold">How this works</p>
        <ol className="list-decimal pl-4 mt-1 space-y-0.5">
          <li>You submit this request</li>
          <li>Admin reviews — you&apos;ll get a notification with the decision</li>
          <li>On approval: complete the purchase with your own funds</li>
          <li>Submit an expense claim from My Portal → My Expenses</li>
        </ol>
      </div>
    </ModalShell>
  );
}

// ── Decide modal (admin/manager) ────────────────────────────────────

function DecideApprovalModal({
  serviceId,
  approval,
  onClose,
}: {
  serviceId: string;
  approval: Approval;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [decisionNote, setDecisionNote] = useState("");
  const [pendingStatus, setPendingStatus] = useState<
    "approved" | "rejected" | null
  >(null);

  const decide = useMutation({
    mutationFn: (status: "approved" | "rejected") =>
      mutateApi(
        `/api/services/${serviceId}/purchase-approvals/${approval.id}`,
        {
          method: "PATCH",
          body: {
            status,
            decisionNote: decisionNote.trim() || null,
          },
        },
      ),
    onMutate: (status) => setPendingStatus(status),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["purchase-approvals", serviceId],
      });
      toast({ description: "Decision recorded." });
      onClose();
    },
    onError: (err: Error) => {
      setPendingStatus(null);
      toast({ variant: "destructive", description: err.message });
    },
  });

  return (
    <ModalShell
      title="Review purchase approval"
      onClose={onClose}
      disabled={decide.isPending}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={decide.isPending}
            className="px-4 py-2 text-sm text-muted hover:text-foreground rounded-md border border-border disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => decide.mutate("rejected")}
            disabled={decide.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-700 border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-50"
          >
            {pendingStatus === "rejected" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <XCircle className="w-4 h-4" />
            )}
            Reject
          </button>
          <button
            type="button"
            onClick={() => decide.mutate("approved")}
            disabled={decide.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700 disabled:opacity-50"
          >
            {pendingStatus === "approved" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            Approve
          </button>
        </>
      }
    >
      <div className="rounded-md border border-border p-3 bg-surface/40 space-y-1.5">
        <p className="text-sm">
          <span className="text-muted">Requested by:</span>{" "}
          <span className="font-medium text-foreground">
            {approval.requestedBy.name}
          </span>
        </p>
        <p className="text-sm">
          <span className="text-muted">Product:</span>{" "}
          <span className="font-medium text-foreground">{approval.product}</span>
        </p>
        <p className="text-sm">
          <span className="text-muted">Vendor:</span>{" "}
          <span className="font-medium text-foreground">{approval.vendor}</span>
        </p>
        <p className="text-sm">
          <span className="text-muted">Cost:</span>{" "}
          <span className="font-semibold text-foreground">
            {formatMoney(approval.costCents)}
          </span>
        </p>
        {approval.reason && (
          <p className="text-sm">
            <span className="text-muted">Reason:</span>{" "}
            <span className="text-foreground">{approval.reason}</span>
          </p>
        )}
      </div>
      <Field label="Decision note (optional)">
        <textarea
          rows={3}
          value={decisionNote}
          onChange={(e) => setDecisionNote(e.target.value)}
          maxLength={2000}
          disabled={decide.isPending}
          placeholder="Add a note that goes to the requester. e.g. 'Please choose the bulk pack' or 'Out of budget this month'."
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
        />
      </Field>
      <div className="rounded-md border border-blue-200 bg-blue-50/40 p-3 text-xs text-blue-900">
        After your decision the requester is notified instantly. On
        approval they&apos;re told to make the purchase and submit an
        expense claim from My Portal.
      </div>
    </ModalShell>
  );
}

// ── Cancel button (requester-only) ──────────────────────────────────

function CancelButton({
  serviceId,
  approvalId,
}: {
  serviceId: string;
  approvalId: string;
}) {
  const qc = useQueryClient();
  const cancel = useMutation({
    mutationFn: () =>
      mutateApi(`/api/services/${serviceId}/purchase-approvals/${approvalId}`, {
        method: "PATCH",
        body: { status: "cancelled" },
      }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["purchase-approvals", serviceId],
      });
      toast({ description: "Request cancelled." });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });
  return (
    <button
      type="button"
      onClick={() => {
        if (window.confirm("Cancel this request?")) cancel.mutate();
      }}
      disabled={cancel.isPending}
      className="text-xs text-muted hover:text-foreground disabled:opacity-50"
    >
      {cancel.isPending ? "Cancelling…" : "Cancel request"}
    </button>
  );
}

// ── Shell helpers ───────────────────────────────────────────────────

function ModalShell({
  title,
  onClose,
  disabled,
  footer,
  children,
}: {
  title: string;
  onClose: () => void;
  disabled: boolean;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-stretch sm:items-center justify-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !disabled) onClose();
      }}
    >
      <div className="bg-card w-full h-full sm:h-auto sm:max-h-[90vh] sm:w-full sm:max-w-xl flex flex-col shadow-2xl sm:rounded-xl">
        <header className="flex items-center justify-between gap-3 p-4 border-b border-border shrink-0">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={disabled}
            className="p-2 -mr-1.5 rounded-lg hover:bg-surface disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-muted" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">{children}</div>
        <footer
          className="border-t border-border bg-card shrink-0 p-4 flex flex-wrap items-center justify-end gap-2"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          {footer}
        </footer>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
