"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Send,
  X,
} from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/Sheet";
import {
  useClearEscalation,
  useEscalateVendorBrief,
  useTransitionVendorBrief,
  useVendorBrief,
} from "@/hooks/useVendorBriefs";
import { SlaPill } from "./sla-pill";
import { StatusPill } from "./status-pill";
import type { VendorBriefStatus } from "@prisma/client";
import { toast } from "@/hooks/useToast";

const NEXT_STATUSES: Record<VendorBriefStatus, VendorBriefStatus | null> = {
  draft: "brief_sent",
  brief_sent: "awaiting_quote",
  awaiting_ack: "awaiting_quote",
  awaiting_quote: "quote_received",
  quote_received: "approved",
  approved: "ordered",
  ordered: "delivered",
  delivered: "installed",
  installed: null,
  cancelled: null,
};

const NEXT_LABELS: Record<VendorBriefStatus, string> = {
  draft: "Mark as sent",
  brief_sent: "Mark acknowledged + awaiting quote",
  awaiting_ack: "Mark acknowledged",
  awaiting_quote: "Mark quote received",
  quote_received: "Mark approved",
  approved: "Mark ordered",
  ordered: "Mark delivered",
  delivered: "Mark installed",
  installed: "",
  cancelled: "",
};

const TIMELINE_STEPS: Array<{
  key:
    | "briefSentAt"
    | "acknowledgedAt"
    | "quoteReceivedAt"
    | "approvedAt"
    | "orderedAt"
    | "deliveredAt"
    | "installedAt";
  label: string;
}> = [
  { key: "briefSentAt", label: "Brief sent" },
  { key: "acknowledgedAt", label: "Acknowledged" },
  { key: "quoteReceivedAt", label: "Quote received" },
  { key: "approvedAt", label: "Approved" },
  { key: "orderedAt", label: "Ordered" },
  { key: "deliveredAt", label: "Delivered" },
  { key: "installedAt", label: "Installed" },
];

export function BriefDetailPanel({
  briefId,
  onClose,
}: {
  briefId: string | null;
  onClose: () => void;
}) {
  const { data: brief, isLoading } = useVendorBrief(briefId);
  const transition = useTransitionVendorBrief();
  const escalate = useEscalateVendorBrief();
  const clearEscalation = useClearEscalation();

  const [escalateOpen, setEscalateOpen] = useState(false);
  const [escalateReason, setEscalateReason] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const open = !!briefId;

  const advanceStatus = async () => {
    if (!brief) return;
    const next = NEXT_STATUSES[brief.status];
    if (!next) return;
    try {
      await transition.mutateAsync({ id: brief.id, toStatus: next });
      toast({ description: `Status moved to ${next.replace(/_/g, " ")}.` });
    } catch {
      // toast handled by hook onError
    }
  };

  const submitEscalate = async () => {
    if (!brief) return;
    if (!escalateReason.trim()) {
      toast({ variant: "destructive", description: "Reason is required." });
      return;
    }
    try {
      await escalate.mutateAsync({ id: brief.id, reason: escalateReason.trim() });
      setEscalateOpen(false);
      setEscalateReason("");
      toast({ description: "Brief escalated. Task created for the escalation target." });
    } catch {
      // hook toasts
    }
  };

  const submitCancel = async () => {
    if (!brief) return;
    if (!cancelReason.trim()) {
      toast({ variant: "destructive", description: "Cancellation reason is required." });
      return;
    }
    try {
      await transition.mutateAsync({
        id: brief.id,
        toStatus: "cancelled",
        notes: cancelReason.trim(),
      });
      setCancelOpen(false);
      setCancelReason("");
      toast({ description: "Brief cancelled." });
    } catch {
      // hook toasts
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" width="max-w-xl" className="flex flex-col">
        {isLoading || !brief ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted" />
          </div>
        ) : (
          <>
            <div className="sticky top-0 z-10 border-b border-border bg-card px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs text-muted">{brief.briefNumber}</p>
                  <h2 className="mt-0.5 truncate text-base font-semibold">{brief.title}</h2>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusPill status={brief.status} />
                    <SlaPill state={brief.slaState} />
                    {brief.escalatedAt && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
                        <AlertTriangle className="h-3 w-3" /> Escalated
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="rounded-lg p-1.5 text-muted hover:bg-surface"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4 text-sm">
              {/* Metadata */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <Pair k="Centre" v={brief.serviceName ?? "Portfolio"} />
                <Pair k="Vendor" v={brief.vendorContactName ?? brief.vendorName ?? "—"} />
                <Pair k="Type" v={brief.type.replace(/_/g, " ")} />
                <Pair k="Owner" v={brief.ownerName ?? "—"} />
                {brief.quantity !== null && <Pair k="Quantity" v={String(brief.quantity)} />}
                {brief.deliveryDeadline && (
                  <Pair k="Delivery deadline" v={fmtDate(brief.deliveryDeadline)} />
                )}
                {brief.termYear && (
                  <Pair
                    k="Term readiness"
                    v={`Term ${brief.termNumber} ${brief.termYear} · ${brief.termReadinessCategory?.replace(/_/g, " ") ?? ""}`}
                  />
                )}
              </div>

              {/* Brief body */}
              {brief.briefBody && (
                <Section title="Brief body">
                  <pre className="whitespace-pre-wrap rounded-md border border-border bg-surface/30 p-3 font-sans text-xs leading-relaxed text-foreground/90">
                    {brief.briefBody}
                  </pre>
                </Section>
              )}

              {brief.specifications && (
                <Section title="Specifications">
                  <p className="whitespace-pre-wrap text-xs">{brief.specifications}</p>
                </Section>
              )}

              {brief.deliveryAddress && (
                <Section title="Delivery address">
                  <p className="whitespace-pre-wrap text-xs">{brief.deliveryAddress}</p>
                </Section>
              )}

              {/* Status timeline */}
              <Section title="Status timeline">
                <ol className="space-y-1.5">
                  {TIMELINE_STEPS.map(({ key, label }) => {
                    const stamp = brief[key];
                    return (
                      <li key={key} className="flex items-center gap-2 text-xs">
                        {stamp ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                        ) : (
                          <span className="h-3.5 w-3.5 rounded-full border border-border" aria-hidden />
                        )}
                        <span className="font-medium text-foreground/90">{label}</span>
                        <span className="text-muted">
                          {stamp ? fmtDateTime(stamp) : "not yet"}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </Section>

              {/* Escalation */}
              {brief.escalatedAt && (
                <Section title="Escalation">
                  <p className="text-xs text-foreground/90">
                    Escalated {fmtDateTime(brief.escalatedAt)}.
                  </p>
                  {brief.escalationReason && (
                    <p className="mt-1 whitespace-pre-wrap rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-800">
                      {brief.escalationReason}
                    </p>
                  )}
                </Section>
              )}

              {brief.cancellationReason && (
                <Section title="Cancellation reason">
                  <p className="whitespace-pre-wrap text-xs">{brief.cancellationReason}</p>
                </Section>
              )}

              {brief.notes && (
                <Section title="Notes">
                  <pre className="whitespace-pre-wrap rounded-md border border-border bg-surface/30 p-3 font-sans text-xs leading-relaxed text-foreground/90">
                    {brief.notes}
                  </pre>
                </Section>
              )}
            </div>

            {/* Actions */}
            <div className="border-t border-border bg-card px-5 py-3">
              {escalateOpen ? (
                <div className="space-y-2">
                  <textarea
                    value={escalateReason}
                    onChange={(e) => setEscalateReason(e.target.value)}
                    rows={3}
                    placeholder="Why are you escalating? (Required)"
                    className="w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => {
                        setEscalateOpen(false);
                        setEscalateReason("");
                      }}
                      className="rounded-md border border-border bg-card px-3 py-1.5 text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={submitEscalate}
                      disabled={escalate.isPending}
                      className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                    >
                      {escalate.isPending ? "Escalating..." : "Escalate"}
                    </button>
                  </div>
                </div>
              ) : cancelOpen ? (
                <div className="space-y-2">
                  <textarea
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    rows={3}
                    placeholder="Cancellation reason (required)"
                    className="w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => {
                        setCancelOpen(false);
                        setCancelReason("");
                      }}
                      className="rounded-md border border-border bg-card px-3 py-1.5 text-xs"
                    >
                      Back
                    </button>
                    <button
                      onClick={submitCancel}
                      disabled={transition.isPending}
                      className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                    >
                      {transition.isPending ? "Cancelling..." : "Confirm cancel"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    {NEXT_STATUSES[brief.status] && (
                      <button
                        onClick={advanceStatus}
                        disabled={transition.isPending}
                        className="inline-flex items-center gap-1 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-50"
                      >
                        {transition.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                        {NEXT_LABELS[brief.status]}
                      </button>
                    )}
                    {brief.status !== "cancelled" &&
                      brief.status !== "delivered" &&
                      brief.status !== "installed" && (
                        <button
                          onClick={() => setCancelOpen(true)}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-surface"
                        >
                          Cancel brief
                        </button>
                      )}
                  </div>
                  <div className="flex gap-2">
                    {brief.escalatedAt ? (
                      <button
                        onClick={() => clearEscalation.mutate(brief.id)}
                        disabled={clearEscalation.isPending}
                        className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        Clear escalation
                      </button>
                    ) : (
                      <button
                        onClick={() => setEscalateOpen(true)}
                        className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
                      >
                        Escalate
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Pair({ k, v }: { k: string; v: string }) {
  return (
    <div className="text-xs">
      <span className="text-muted">{k}: </span>
      <span className="font-medium text-foreground/90">{v}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/70">
        {title}
      </h3>
      {children}
    </div>
  );
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
