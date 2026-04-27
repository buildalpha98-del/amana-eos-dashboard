import { ActivationLifecycleStage } from "@prisma/client";

/**
 * Linear stage order. `cancelled` sits outside the line — it can be entered
 * from any stage, and there is no transition out of it.
 */
export const STAGE_ORDER: ActivationLifecycleStage[] = [
  ActivationLifecycleStage.concept,
  ActivationLifecycleStage.approved,
  ActivationLifecycleStage.logistics,
  ActivationLifecycleStage.final_push,
  ActivationLifecycleStage.delivered,
  ActivationLifecycleStage.recap_published,
];

export const STAGE_LABEL: Record<ActivationLifecycleStage, string> = {
  concept: "Concept",
  approved: "Approved",
  logistics: "Logistics",
  final_push: "Final push",
  delivered: "Delivered",
  recap_published: "Recap published",
  cancelled: "Cancelled",
};

interface TransitionInputs {
  occurredAt?: Date;
  actualAttendance?: number;
  enquiriesGenerated?: number;
  recapPostId?: string | null;
  cancellationReason?: string;
}

interface TimestampPatch {
  conceptApprovedAt?: Date;
  logisticsStartedAt?: Date;
  finalPushStartedAt?: Date;
  activationDeliveredAt?: Date;
  recapPublishedAt?: Date;
  cancelledAt?: Date;
}

interface TransitionResult {
  ok: true;
  patch: TimestampPatch & {
    lifecycleStage: ActivationLifecycleStage;
    actualAttendance?: number;
    enquiriesGenerated?: number;
    cancellationReason?: string;
  };
}

interface TransitionError {
  ok: false;
  error: string;
}

const TIMESTAMP_FOR_STAGE: Record<
  Exclude<ActivationLifecycleStage, "concept" | "cancelled">,
  keyof TimestampPatch
> = {
  approved: "conceptApprovedAt",
  logistics: "logisticsStartedAt",
  final_push: "finalPushStartedAt",
  delivered: "activationDeliveredAt",
  recap_published: "recapPublishedAt",
};

function indexOfStage(stage: ActivationLifecycleStage): number {
  return STAGE_ORDER.indexOf(stage);
}

/**
 * Validate a stage transition and produce the field patch (timestamps + extras
 * + new lifecycleStage) to apply.
 *
 * Rules:
 * - Cancelled is reachable from any non-cancelled stage; requires a reason.
 * - Anything-out-of-cancelled is rejected (use a different model action to
 *   uncancel — out of scope for v1).
 * - Backward moves rejected (concept ← approved, etc).
 * - Forward jumps allowed: skipped stages get the same `occurredAt` timestamp
 *   so the lifecycle still reads chronologically.
 * - Marking `delivered` requires `actualAttendance`.
 * - Marking `recap_published` requires either `recapPostId` or `cancellationReason`-style
 *   notes (caller provides notes via separate field; not enforced here).
 */
export function planTransition(
  from: ActivationLifecycleStage,
  to: ActivationLifecycleStage,
  inputs: TransitionInputs = {},
): TransitionResult | TransitionError {
  if (from === to) {
    return { ok: false, error: `Activation is already at stage '${to}'` };
  }
  if (from === "cancelled") {
    return { ok: false, error: "Cancelled activations cannot be re-opened" };
  }

  const occurredAt = inputs.occurredAt ?? new Date();

  if (to === "cancelled") {
    if (!inputs.cancellationReason || !inputs.cancellationReason.trim()) {
      return { ok: false, error: "Cancellation requires a reason" };
    }
    return {
      ok: true,
      patch: {
        lifecycleStage: "cancelled",
        cancelledAt: occurredAt,
        cancellationReason: inputs.cancellationReason.trim(),
      },
    };
  }

  const fromIdx = indexOfStage(from);
  const toIdx = indexOfStage(to);
  if (fromIdx === -1 || toIdx === -1) {
    return { ok: false, error: `Unknown stage transition '${from}' → '${to}'` };
  }
  if (toIdx <= fromIdx) {
    return { ok: false, error: `Cannot transition backwards (${from} → ${to})` };
  }

  if (to === "delivered" && (inputs.actualAttendance === undefined || inputs.actualAttendance === null)) {
    return { ok: false, error: "Marking delivered requires actualAttendance" };
  }
  if (to === "recap_published" && !inputs.recapPostId) {
    return { ok: false, error: "Marking recap_published requires a recapPostId" };
  }

  const patch: TransitionResult["patch"] = { lifecycleStage: to };
  // Fill timestamps for every stage between fromIdx+1 .. toIdx (inclusive).
  for (let i = fromIdx + 1; i <= toIdx; i++) {
    const intermediate = STAGE_ORDER[i];
    if (intermediate === "concept") continue;
    const field = TIMESTAMP_FOR_STAGE[intermediate as keyof typeof TIMESTAMP_FOR_STAGE];
    patch[field] = occurredAt;
  }

  if (to === "delivered" || to === "recap_published") {
    if (inputs.actualAttendance !== undefined) patch.actualAttendance = inputs.actualAttendance;
    if (inputs.enquiriesGenerated !== undefined) patch.enquiriesGenerated = inputs.enquiriesGenerated;
  }

  return { ok: true, patch };
}

/** True when the activation is "in flight" (not delivered/recap/cancelled). */
export function isInFlight(stage: ActivationLifecycleStage): boolean {
  return (
    stage !== "delivered" &&
    stage !== "recap_published" &&
    stage !== "cancelled"
  );
}

export function isArchived(stage: ActivationLifecycleStage): boolean {
  return stage === "delivered" || stage === "recap_published" || stage === "cancelled";
}
