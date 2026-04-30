import { addBusinessDays } from "./business-days";

/**
 * SLA states for a VendorBrief, ordered from least to most severe.
 *
 * - on_track     : within all SLAs (or no SLA applies yet — e.g. still draft)
 * - ack_overdue  : >48h since briefSentAt, no acknowledgedAt
 * - quote_overdue: >5 business days since briefSentAt, no quoteReceivedAt
 * - delivery_overdue: past deliveryDeadline, not delivered
 * - breached     : multiple SLAs breached at once (worst case)
 */
export type SlaState =
  | "on_track"
  | "ack_overdue"
  | "quote_overdue"
  | "delivery_overdue"
  | "breached";

const HOURS_48_MS = 48 * 60 * 60 * 1000;

export interface SlaInputs {
  status: string;
  briefSentAt: Date | null;
  acknowledgedAt: Date | null;
  quoteReceivedAt: Date | null;
  deliveryDeadline: Date | null;
  deliveredAt: Date | null;
}

/**
 * Compute the most-severe applicable SLA state for a brief.
 *
 * @param now - current timestamp (defaults to new Date()) — accept it as
 *   a parameter so tests can pin the clock.
 */
export function computeSlaState(input: SlaInputs, now: Date = new Date()): SlaState {
  // Terminal statuses don't accrue SLA breaches.
  if (
    input.status === "delivered" ||
    input.status === "installed" ||
    input.status === "cancelled"
  ) {
    return "on_track";
  }

  const breaches: SlaState[] = [];

  // Acknowledgement SLA: 48h from briefSentAt
  if (input.briefSentAt && !input.acknowledgedAt) {
    const ackDeadline = new Date(input.briefSentAt.getTime() + HOURS_48_MS);
    if (now.getTime() > ackDeadline.getTime()) {
      breaches.push("ack_overdue");
    }
  }

  // Quote SLA: 5 business days from briefSentAt
  if (input.briefSentAt && !input.quoteReceivedAt) {
    const quoteDeadline = addBusinessDays(input.briefSentAt, 5);
    if (now.getTime() > quoteDeadline.getTime()) {
      breaches.push("quote_overdue");
    }
  }

  // Delivery SLA: deliveryDeadline
  if (input.deliveryDeadline && !input.deliveredAt) {
    if (now.getTime() > input.deliveryDeadline.getTime()) {
      breaches.push("delivery_overdue");
    }
  }

  if (breaches.length === 0) return "on_track";
  if (breaches.length > 1) return "breached";
  return breaches[0];
}

export const SLA_LABELS: Record<SlaState, string> = {
  on_track: "On track",
  ack_overdue: "Ack overdue",
  quote_overdue: "Quote overdue",
  delivery_overdue: "Delivery overdue",
  breached: "SLA breached",
};
