/**
 * Client-safe half of materials-orders: statuses, labels, the routing rule
 * and the summary shape. No Prisma here — MaterialsOrdersClient imports this,
 * and pulling the database client into the browser bundle crashes the page
 * on the env check.
 */
export const REPLY_STATUSES = ["awaiting", "reminded", "partial", "replied", "nothing_needed", "hold"] as const;
export const HAS_IT = ["yes", "no", "check"] as const;
export const ROUTES = ["local_buy", "hq_order", "follow_up"] as const;
export const ACTIONS = ["in_stock", "local_buy", "hq_order", "follow_up", "awaiting_reply"] as const;
export const CART_STATUSES = ["draft", "ready", "hold", "checked_out", "received", "nothing_needed"] as const;

export type HasIt = (typeof HAS_IT)[number];
export type Action = (typeof ACTIONS)[number];

export const ACTION_LABELS: Record<Action, string> = {
  in_stock: "In stock",
  local_buy: "Local buy (centre)",
  hq_order: "HQ order",
  follow_up: "Follow up",
  awaiting_reply: "Awaiting reply",
};
export const REPLY_LABELS: Record<(typeof REPLY_STATUSES)[number], string> = {
  awaiting: "Awaiting reply",
  reminded: "Reminded",
  partial: "Partial reply",
  replied: "Replied",
  nothing_needed: "Nothing needed",
  hold: "On hold",
};
export const CART_LABELS: Record<(typeof CART_STATUSES)[number], string> = {
  draft: "Building",
  ready: "Ready to check out",
  hold: "On hold",
  checked_out: "Checked out",
  received: "Received",
  nothing_needed: "Nothing to order",
};

/** What happens to an item, from the centre's answer and the item's route. */
export function routeLine(hasIt: string | null | undefined, ifMissing: string): Action {
  if (hasIt === "yes") return "in_stock";
  if (hasIt === "check") return "follow_up";
  if (hasIt === "no") return (ROUTES as readonly string[]).includes(ifMissing) ? (ifMissing as Action) : "hq_order";
  return "awaiting_reply";
}

export interface CentreSummary {
  serviceId: string;
  serviceName: string;
  state: string | null;
  replyStatus: string;
  replyAt: string | null;
  notes: string | null;
  lines: number;
  hqLines: number;
  hqOrdered: number;
  hqReceived: number;
  localBuys: number;
  followUps: number;
  notChecked: number;
  carts: { id: string; retailer: string; status: string; lineCount: number; total: number; checkedOutAt: string | null }[];
}
