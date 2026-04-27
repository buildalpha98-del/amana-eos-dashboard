"use client";

import { useState } from "react";
import type { ActivationLifecycleStage } from "@prisma/client";
import { Check, Circle, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { STAGE_ORDER, STAGE_LABEL } from "@/lib/activation-lifecycle";
import { useTransitionActivation, type ActivationRow } from "@/hooks/useActivations";
import { toast } from "@/hooks/useToast";

const TIMESTAMP_FIELD: Record<Exclude<ActivationLifecycleStage, "concept" | "cancelled">, keyof ActivationRow["timestamps"]> = {
  approved: "conceptApprovedAt",
  logistics: "logisticsStartedAt",
  final_push: "finalPushStartedAt",
  delivered: "activationDeliveredAt",
  recap_published: "recapPublishedAt",
};

function fmt(ts: string | null): string {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("en-AU", { day: "2-digit", month: "short" });
}

interface LifecycleStepperProps {
  activation: ActivationRow;
}

export function LifecycleStepper({ activation }: LifecycleStepperProps) {
  const transition = useTransitionActivation();
  const [pendingStage, setPendingStage] = useState<ActivationLifecycleStage | null>(null);
  const [attendance, setAttendance] = useState<string>(activation.actualAttendance?.toString() ?? "");
  const [enquiries, setEnquiries] = useState<string>(activation.enquiriesGenerated?.toString() ?? "");
  const [recapPostId, setRecapPostId] = useState<string>(activation.recapPostId ?? "");
  const [cancelReason, setCancelReason] = useState("");

  if (activation.lifecycleStage === "cancelled") {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm">
        <div className="flex items-center gap-2 font-medium text-red-700">
          <X className="w-4 h-4" />
          Cancelled {fmt(activation.timestamps.cancelledAt)}
        </div>
        {activation.cancellationReason && (
          <p className="mt-1 text-xs text-red-700">Reason: {activation.cancellationReason}</p>
        )}
      </div>
    );
  }

  const currentIdx = STAGE_ORDER.indexOf(activation.lifecycleStage);

  async function commitTransition(toStage: ActivationLifecycleStage) {
    try {
      const body: Record<string, unknown> = { id: activation.id, toStage };
      if (toStage === "delivered") {
        const n = parseInt(attendance, 10);
        if (Number.isNaN(n) || n < 0) {
          toast({ variant: "destructive", description: "Actual attendance is required" });
          return;
        }
        body.actualAttendance = n;
        if (enquiries.trim()) {
          const e = parseInt(enquiries, 10);
          if (!Number.isNaN(e) && e >= 0) body.enquiriesGenerated = e;
        }
      }
      if (toStage === "recap_published") {
        if (!recapPostId.trim()) {
          toast({ variant: "destructive", description: "Link the recap MarketingPost id" });
          return;
        }
        body.recapPostId = recapPostId.trim();
      }
      await transition.mutateAsync(body as never);
      toast({ description: `Marked ${STAGE_LABEL[toStage]}` });
      setPendingStage(null);
    } catch {
      // hook toast
    }
  }

  async function commitCancel() {
    if (!cancelReason.trim()) {
      toast({ variant: "destructive", description: "Cancellation requires a reason" });
      return;
    }
    try {
      await transition.mutateAsync({ id: activation.id, toStage: "cancelled", cancellationReason: cancelReason.trim() });
      toast({ description: "Activation cancelled" });
      setPendingStage(null);
      setCancelReason("");
    } catch {
      // hook toast
    }
  }

  return (
    <div className="space-y-3">
      <ol className="grid grid-cols-6 gap-1" aria-label="Activation lifecycle">
        {STAGE_ORDER.map((stage, i) => {
          const completed = i <= currentIdx;
          const active = i === currentIdx;
          const ts = stage === "concept" ? null : activation.timestamps[TIMESTAMP_FIELD[stage as keyof typeof TIMESTAMP_FIELD]];
          return (
            <li
              key={stage}
              className={`rounded-md border p-2 text-center text-[11px] ${
                completed
                  ? "border-green-200 bg-green-50 text-green-900"
                  : active
                    ? "border-brand bg-card text-foreground font-semibold"
                    : "border-border bg-surface text-muted"
              }`}
            >
              <div className="flex items-center justify-center mb-1">
                {completed ? (
                  <Check className="w-3.5 h-3.5" aria-hidden />
                ) : (
                  <Circle className="w-3.5 h-3.5" aria-hidden />
                )}
              </div>
              <div className="leading-tight">{STAGE_LABEL[stage]}</div>
              {ts && <div className="text-[10px] text-muted mt-0.5">{fmt(ts)}</div>}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap gap-2">
        {STAGE_ORDER.slice(currentIdx + 1).map((stage) => (
          <Button
            key={stage}
            size="sm"
            variant={pendingStage === stage ? "primary" : "secondary"}
            onClick={() => setPendingStage(pendingStage === stage ? null : stage)}
            disabled={transition.isPending}
          >
            Mark {STAGE_LABEL[stage]}
          </Button>
        ))}
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setPendingStage("cancelled")}
          disabled={transition.isPending}
          iconLeft={<X className="w-3.5 h-3.5" />}
        >
          Cancel activation
        </Button>
      </div>

      {pendingStage && pendingStage !== "cancelled" && pendingStage !== "delivered" && pendingStage !== "recap_published" && (
        <div className="rounded-md border border-brand/30 bg-brand/5 p-3 text-sm flex items-center justify-between gap-3">
          <span>Confirm transition to <strong>{STAGE_LABEL[pendingStage]}</strong>?</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setPendingStage(null)}>Cancel</Button>
            <Button size="sm" variant="primary" onClick={() => commitTransition(pendingStage)} loading={transition.isPending}>
              Confirm
            </Button>
          </div>
        </div>
      )}

      {pendingStage === "delivered" && (
        <div className="rounded-md border border-brand/30 bg-brand/5 p-3 text-sm space-y-2">
          <div>
            <label className="block text-xs text-muted mb-1">Actual attendance *</label>
            <input
              type="number"
              min={0}
              value={attendance}
              onChange={(e) => setAttendance(e.target.value)}
              className="w-32 rounded-md border border-border bg-card p-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Enquiries generated (optional)</label>
            <input
              type="number"
              min={0}
              value={enquiries}
              onChange={(e) => setEnquiries(e.target.value)}
              className="w-32 rounded-md border border-border bg-card p-1.5 text-sm"
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setPendingStage(null)}>Cancel</Button>
            <Button size="sm" variant="primary" onClick={() => commitTransition("delivered")} loading={transition.isPending}>
              Mark delivered
            </Button>
          </div>
        </div>
      )}

      {pendingStage === "recap_published" && (
        <div className="rounded-md border border-brand/30 bg-brand/5 p-3 text-sm space-y-2">
          <div>
            <label className="block text-xs text-muted mb-1">Recap MarketingPost ID *</label>
            <input
              type="text"
              value={recapPostId}
              onChange={(e) => setRecapPostId(e.target.value)}
              placeholder="cmnk..."
              className="w-full rounded-md border border-border bg-card p-1.5 text-sm font-mono"
            />
            <p className="text-[10px] text-muted mt-1">
              The post must already exist in MarketingPost. Sprint 6&apos;s recap cron drafts one automatically 48h after delivery.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setPendingStage(null)}>Cancel</Button>
            <Button size="sm" variant="primary" onClick={() => commitTransition("recap_published")} loading={transition.isPending}>
              Mark recap published
            </Button>
          </div>
        </div>
      )}

      {pendingStage === "cancelled" && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm space-y-2">
          <label className="block text-xs text-red-900">Cancellation reason *</label>
          <textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-red-200 bg-card p-1.5 text-sm"
          />
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => { setPendingStage(null); setCancelReason(""); }}>Back</Button>
            <Button size="sm" variant="destructive" onClick={commitCancel} loading={transition.isPending}>
              Cancel activation
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
