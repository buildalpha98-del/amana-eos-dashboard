import type { VendorBriefStatus } from "@prisma/client";

/**
 * Valid forward transitions for VendorBrief.status.
 *
 * The lifecycle is mostly linear, but we allow skipping forward — Akram
 * may have done parts offline (e.g. brief_sent → quote_received). When a
 * skip happens, the route fills in any missing intermediate timestamps so
 * SLA computations don't break.
 *
 * Backward transitions are disallowed (cancellations are the only way out
 * of a non-terminal state).
 */

const ORDER: VendorBriefStatus[] = [
  "draft",
  "brief_sent",
  "awaiting_ack",
  "awaiting_quote",
  "quote_received",
  "approved",
  "ordered",
  "delivered",
  "installed",
];

const TERMINAL: VendorBriefStatus[] = ["delivered", "installed", "cancelled"];

export function isTerminal(status: VendorBriefStatus): boolean {
  return TERMINAL.includes(status);
}

export function isValidTransition(
  from: VendorBriefStatus,
  to: VendorBriefStatus,
): boolean {
  // Cancellation is allowed from any non-terminal state. Delivered is
  // technically "archived" but signage can still be transitioned to
  // installed afterwards — special-case below.
  if (to === "cancelled") {
    return !["delivered", "installed", "cancelled"].includes(from);
  }

  // 'installed' is only valid from 'delivered' (signage workflow).
  if (to === "installed") return from === "delivered";

  // No other transitions out of installed/cancelled (truly terminal).
  if (from === "installed" || from === "cancelled") return false;
  // Out of 'delivered' the only further step is 'installed' or 'cancelled'.
  if (from === "delivered") return false;

  // Forward moves through the linear lifecycle.
  const fromIdx = ORDER.indexOf(from);
  const toIdx = ORDER.indexOf(to);
  if (fromIdx === -1 || toIdx === -1) return false;
  return toIdx > fromIdx;
}

/**
 * Fields to set when transitioning into a given status.
 *
 * Returns a partial-data object that the caller spreads into a
 * `centreAvatar.update({ data: ... })` call. Each field is set to
 * `occurredAt ?? now`.
 *
 * For skip-forward transitions, the caller should also fill in
 * intermediate timestamps with the same value — see fillIntermediateTimestamps.
 */
export function dataForTransition(
  to: VendorBriefStatus,
  occurredAt: Date,
): Record<string, unknown> {
  const data: Record<string, unknown> = { status: to };
  switch (to) {
    case "brief_sent":
      data.briefSentAt = occurredAt;
      break;
    case "awaiting_ack":
      // Usually skipped — ack stamp lands on awaiting_quote
      break;
    case "awaiting_quote":
      data.acknowledgedAt = occurredAt;
      break;
    case "quote_received":
      data.quoteReceivedAt = occurredAt;
      break;
    case "approved":
      data.quoteApprovedAt = occurredAt;
      data.approvedAt = occurredAt;
      break;
    case "ordered":
      data.orderedAt = occurredAt;
      break;
    case "delivered":
      data.deliveredAt = occurredAt;
      break;
    case "installed":
      data.installedAt = occurredAt;
      break;
    case "cancelled":
      // cancellationReason filled by route
      break;
  }
  return data;
}

/**
 * For skip-forward transitions, set all intermediate timestamps that haven't
 * been set yet on the existing brief, so SLA states downstream (relying on
 * briefSentAt etc.) keep working.
 *
 * Call AFTER dataForTransition. The existing brief's timestamps are passed
 * in via `existing`; we fill any null intermediate fields.
 */
export function fillIntermediateTimestamps(
  to: VendorBriefStatus,
  occurredAt: Date,
  existing: Pick<
    {
      briefSentAt: Date | null;
      acknowledgedAt: Date | null;
      quoteReceivedAt: Date | null;
      quoteApprovedAt: Date | null;
      approvedAt: Date | null;
      orderedAt: Date | null;
      deliveredAt: Date | null;
      installedAt: Date | null;
    },
    | "briefSentAt"
    | "acknowledgedAt"
    | "quoteReceivedAt"
    | "quoteApprovedAt"
    | "approvedAt"
    | "orderedAt"
    | "deliveredAt"
    | "installedAt"
  >,
): Record<string, unknown> {
  const targetIdx = ORDER.indexOf(to);
  if (targetIdx === -1) return {};

  const data: Record<string, unknown> = {};
  // Earlier-stage fields that should be backfilled if currently null.
  // Mapping: status step → field that is "set when entering that step"
  const stepToField: Record<string, keyof typeof existing | null> = {
    draft: null,
    brief_sent: "briefSentAt",
    awaiting_ack: null,
    awaiting_quote: "acknowledgedAt",
    quote_received: "quoteReceivedAt",
    approved: "approvedAt",
    ordered: "orderedAt",
    delivered: "deliveredAt",
    installed: "installedAt",
  };

  for (let i = 0; i <= targetIdx; i++) {
    const field = stepToField[ORDER[i]];
    if (!field) continue;
    if (existing[field] == null) {
      data[field as string] = occurredAt;
    }
  }
  return data;
}
