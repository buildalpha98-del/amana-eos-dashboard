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

import type { CentreSummary } from "@/lib/materials-orders-shared";

export * from "@/lib/materials-orders-shared";

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
