/**
 * Program materials orders (Daniel, 21 Oct 2026) — the dashboard version of
 * the Cowork "Term materials: order tracker" spreadsheet.
 *
 * The rules are the spreadsheet's:
 *   - each centre answers "Centre has it?" for every item: Yes / No / Check;
 *   - Yes → in stock; Check → follow up (chase it);
 *   - No → the item's `ifMissing` route: Week 1 is a LOCAL BUY by the centre
 *     (within the local-buy limit, receipt to head office); later weeks an
 *     HQ ORDER (one cart per centre); some items are always a follow-up
 *     (borrow from the school library, ask families for recycling…);
 *   - unanswered → awaiting reply.
 * HQ checks out one cart per centre; checking out records the cart total
 * as program_materials spend against that centre (a BudgetItem), so it
 * comes out of the month's budget and the bank.
 */
import { prisma } from "@/lib/prisma";
import { recalcFinancialsForWeek } from "@/lib/budget-helpers";

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

/** The Centres sheet: one row per centre with the counts. */
export async function roundSummary(roundId: string, serviceIds: string[] | null): Promise<CentreSummary[]> {
  const scope = serviceIds === null ? {} : { serviceId: { in: serviceIds } };
  const [centres, lines, carts] = await Promise.all([
    prisma.materialsOrderCentre.findMany({
      where: { roundId, ...scope },
      select: { serviceId: true, replyStatus: true, replyAt: true, notes: true, service: { select: { name: true, state: true } } },
    }),
    prisma.materialsOrderLine.findMany({
      where: { roundId, ...scope },
      select: { serviceId: true, action: true, orderedAt: true, receivedAt: true },
    }),
    prisma.materialsCart.findMany({
      where: { roundId, ...scope },
      select: { id: true, serviceId: true, retailer: true, status: true, lineCount: true, total: true, checkedOutAt: true },
    }),
  ]);
  return centres
    .map((c) => {
      const mine = lines.filter((l) => l.serviceId === c.serviceId);
      const hq = mine.filter((l) => l.action === "hq_order");
      return {
        serviceId: c.serviceId,
        serviceName: c.service.name.replace(/^Amana OSHC\s+/i, ""),
        state: c.service.state,
        replyStatus: c.replyStatus,
        replyAt: c.replyAt?.toISOString() ?? null,
        notes: c.notes,
        lines: mine.length,
        hqLines: hq.length,
        hqOrdered: hq.filter((l) => l.orderedAt).length,
        hqReceived: hq.filter((l) => l.receivedAt).length,
        localBuys: mine.filter((l) => l.action === "local_buy").length,
        followUps: mine.filter((l) => l.action === "follow_up").length,
        notChecked: mine.filter((l) => l.action === "awaiting_reply").length,
        carts: carts
          .filter((k) => k.serviceId === c.serviceId)
          .map((k) => ({ ...k, checkedOutAt: k.checkedOutAt?.toISOString() ?? null })),
      };
    })
    .sort((a, b) => (a.state ?? "").localeCompare(b.state ?? "") || a.serviceName.localeCompare(b.serviceName));
}

/**
 * A cart was checked out: record its total as program_materials spend for
 * the centre (once — budgetItemId makes it idempotent), and refresh that
 * week's financials.
 */
export async function recordCartSpend(cartId: string, byId: string | null, now = new Date()): Promise<void> {
  const cart = await prisma.materialsCart.findUnique({
    where: { id: cartId },
    select: { id: true, serviceId: true, retailer: true, total: true, budgetItemId: true, checkedOutAt: true, round: { select: { title: true } } },
  });
  if (!cart || cart.budgetItemId || cart.total <= 0) return;
  const day = cart.checkedOutAt ?? now;
  const item = await prisma.budgetItem.create({
    data: {
      serviceId: cart.serviceId,
      name: `${cart.retailer} materials — ${cart.round.title}`,
      amount: Math.round(cart.total * 100) / 100,
      category: "program_materials",
      date: new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate())),
      notes: "Recorded automatically when the materials cart was checked out.",
      createdById: byId,
    },
  });
  // Claim: only the first writer links it; a racing second one undoes its row.
  const claim = await prisma.materialsCart.updateMany({ where: { id: cart.id, budgetItemId: null }, data: { budgetItemId: item.id } });
  if (claim.count === 0) {
    await prisma.budgetItem.delete({ where: { id: item.id } });
    return;
  }
  await recalcFinancialsForWeek(cart.serviceId, item.date).catch(() => undefined);
}
