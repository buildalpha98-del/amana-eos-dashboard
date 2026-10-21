/**
 * Amana HQ ingest (Daniel, 21 Oct 2026) — Cowork posts the master accounts
 * tracker's rows here instead of into the spreadsheet. Every section is
 * optional and upserts on a stable key, so Cowork can re-send a week.
 *
 *   weekly         → ServiceWeeklyAccounts (OWNA HQ bookings, revenue,
 *                    timesheet staff cost incl. super)
 *   groceryOrders  → GroceryOrder + a groceries BudgetItem (food spend)
 *   resources      → a BudgetItem (program resources) against the month
 *   stock          → StockItem
 *   feedback       → ProgramFeedbackWeek
 */
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { recalcFinancialsForWeek } from "@/lib/budget-helpers";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const money = z.number().min(-1_000_000).max(1_000_000);
const day = (d: string) => new Date(`${d}T00:00:00Z`);

export const accountsSchema = z.object({
  weekly: z
    .array(
      z.object({
        serviceCode: z.string().trim().min(1),
        weekStart: isoDate,
        termWeek: z.string().trim().max(20).optional(),
        bscBookings: z.number().int().nonnegative().default(0),
        ascBookings: z.number().int().nonnegative().default(0),
        bscRevenue: money.default(0),
        ascRevenue: money.default(0),
        otherRevenue: money.default(0),
        /** Defaults to the three revenue lines added up. */
        totalRevenue: money.optional(),
        staffCost: money.nullable().optional(),
        notes: z.string().max(5000).nullable().optional(),
      }),
    )
    .max(500)
    .default([]),
  groceryOrders: z
    .array(
      z.object({
        serviceCode: z.string().trim().min(1),
        retailer: z.string().trim().max(60).default("Woolworths"),
        orderNo: z.string().trim().min(1).max(60),
        deliveryDate: isoDate,
        deliveryWindow: z.string().trim().max(40).optional(),
        weekStart: isoDate,
        weeksCovered: z.number().int().min(1).max(4).default(1),
        budget: money.nullable().optional(),
        foodSpend: money,
        totalPaid: money.nullable().optional(),
        notes: z.string().max(5000).nullable().optional(),
      }),
    )
    .max(500)
    .default([]),
  resources: z
    .array(
      z.object({
        serviceCode: z.string().trim().min(1),
        /** First day of the month the spend counts against. */
        month: isoDate,
        purchaseDate: isoDate.optional(),
        supplier: z.string().trim().max(80).optional(),
        orderRef: z.string().trim().max(80).optional(),
        items: z.string().trim().min(1).max(300),
        spend: money,
        notes: z.string().max(5000).nullable().optional(),
      }),
    )
    .max(500)
    .default([]),
  stock: z
    .array(
      z.object({
        serviceCode: z.string().trim().min(1),
        category: z.string().trim().max(80).optional(),
        item: z.string().trim().min(1).max(200),
        type: z.enum(["consumable", "durable"]).default("consumable"),
        qtyOnHand: z.number().nonnegative().nullable().optional(),
        unit: z.string().trim().max(40).optional(),
        reorderAt: z.number().nonnegative().nullable().optional(),
        lastCounted: isoDate.optional(),
        lastReplaced: isoDate.optional(),
        timesReplacedThisYear: z.number().int().nonnegative().default(0),
        notes: z.string().max(5000).nullable().optional(),
      }),
    )
    .max(3000)
    .default([]),
  feedback: z
    .array(
      z.object({
        serviceCode: z.string().trim().min(1),
        weekStart: isoDate,
        termWeek: z.string().trim().max(20).optional(),
        feedbackReceived: z.boolean().default(false),
        reflections: z.enum(["none", "partial", "complete"]).default("none"),
        kidsEnjoyed: z.string().max(5000).nullable().optional(),
        didntWork: z.string().max(5000).nullable().optional(),
        childrensIdeas: z.string().max(5000).nullable().optional(),
        resourcesRequested: z.string().max(5000).nullable().optional(),
        notes: z.string().max(5000).nullable().optional(),
      }),
    )
    .max(500)
    .default([]),
});
export type AccountsPayload = z.infer<typeof accountsSchema>;

export async function ingestAccounts(p: AccountsPayload) {
  const codes = [
    ...new Set([...p.weekly, ...p.groceryOrders, ...p.resources, ...p.stock, ...p.feedback].map((x) => x.serviceCode)),
  ];
  const services = await prisma.service.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } });
  const id = new Map(services.map((s) => [s.code, s.id]));
  const unknownServiceCodes = codes.filter((c) => !id.has(c));
  const out = { weekly: 0, groceryOrders: 0, resources: 0, stock: 0, feedback: 0, unknownServiceCodes };
  const weeksToRecalc = new Set<string>();

  for (const w of p.weekly) {
    const serviceId = id.get(w.serviceCode);
    if (!serviceId) continue;
    const data = {
      termWeek: w.termWeek ?? null,
      bscBookings: w.bscBookings,
      ascBookings: w.ascBookings,
      bscRevenue: w.bscRevenue,
      ascRevenue: w.ascRevenue,
      otherRevenue: w.otherRevenue,
      totalRevenue: w.totalRevenue ?? w.bscRevenue + w.ascRevenue + w.otherRevenue,
      staffCost: w.staffCost ?? null,
      notes: w.notes ?? null,
    };
    await prisma.serviceWeeklyAccounts.upsert({
      where: { serviceId_weekStart: { serviceId, weekStart: day(w.weekStart) } },
      create: { serviceId, weekStart: day(w.weekStart), ...data },
      update: data,
    });
    out.weekly++;
  }

  for (const g of p.groceryOrders) {
    const serviceId = id.get(g.serviceCode);
    if (!serviceId) continue;
    const data = {
      retailer: g.retailer,
      deliveryDate: day(g.deliveryDate),
      deliveryWindow: g.deliveryWindow ?? null,
      weekStart: day(g.weekStart),
      weeksCovered: g.weeksCovered,
      budget: g.budget ?? null,
      foodSpend: g.foodSpend,
      totalPaid: g.totalPaid ?? null,
      notes: g.notes ?? null,
    };
    await prisma.groceryOrder.upsert({
      where: { serviceId_orderNo: { serviceId, orderNo: g.orderNo } },
      create: { serviceId, orderNo: g.orderNo, ...data },
      update: data,
    });
    // The food spend is the centre's grocery spend (budget + bank).
    const ref = `grocery:${g.serviceCode}:${g.orderNo}`;
    const item = {
      serviceId,
      name: `${g.retailer} order ${g.orderNo}`,
      amount: g.foodSpend,
      category: "groceries" as const,
      date: day(g.deliveryDate),
      notes: g.weeksCovered > 1 ? `Covers ${g.weeksCovered} weeks from ${g.weekStart}.` : `Week of ${g.weekStart}.`,
    };
    await prisma.budgetItem.upsert({ where: { externalRef: ref }, create: { ...item, externalRef: ref }, update: item });
    weeksToRecalc.add(`${serviceId}|${g.deliveryDate}`);
    out.groceryOrders++;
  }

  for (const [i, r] of p.resources.entries()) {
    const serviceId = id.get(r.serviceCode);
    if (!serviceId) continue;
    const ref = `resource:${r.serviceCode}:${r.month}:${r.orderRef ?? `${r.items}:${i}`}`.slice(0, 250);
    const date = r.purchaseDate ?? r.month;
    const item = {
      serviceId,
      name: [r.supplier, r.items].filter(Boolean).join(" — "),
      amount: r.spend,
      category: "program_materials" as const,
      date: day(date),
      notes: [r.orderRef ? `Order ${r.orderRef}` : null, r.notes].filter(Boolean).join(". ") || null,
    };
    await prisma.budgetItem.upsert({ where: { externalRef: ref }, create: { ...item, externalRef: ref }, update: item });
    weeksToRecalc.add(`${serviceId}|${date}`);
    out.resources++;
  }

  for (const s of p.stock) {
    const serviceId = id.get(s.serviceCode);
    if (!serviceId) continue;
    const data = {
      category: s.category ?? null,
      type: s.type,
      qtyOnHand: s.qtyOnHand ?? null,
      unit: s.unit ?? null,
      reorderAt: s.reorderAt ?? null,
      lastCounted: s.lastCounted ? day(s.lastCounted) : null,
      lastReplaced: s.lastReplaced ? day(s.lastReplaced) : null,
      timesReplacedThisYear: s.timesReplacedThisYear,
      notes: s.notes ?? null,
    };
    await prisma.stockItem.upsert({
      where: { serviceId_item: { serviceId, item: s.item } },
      create: { serviceId, item: s.item, ...data },
      update: data,
    });
    out.stock++;
  }

  for (const f of p.feedback) {
    const serviceId = id.get(f.serviceCode);
    if (!serviceId) continue;
    const data = {
      termWeek: f.termWeek ?? null,
      feedbackReceived: f.feedbackReceived,
      reflections: f.reflections,
      kidsEnjoyed: f.kidsEnjoyed ?? null,
      didntWork: f.didntWork ?? null,
      childrensIdeas: f.childrensIdeas ?? null,
      resourcesRequested: f.resourcesRequested ?? null,
      notes: f.notes ?? null,
    };
    await prisma.programFeedbackWeek.upsert({
      where: { serviceId_weekStart: { serviceId, weekStart: day(f.weekStart) } },
      create: { serviceId, weekStart: day(f.weekStart), ...data },
      update: data,
    });
    out.feedback++;
  }

  for (const k of weeksToRecalc) {
    const [serviceId, d] = k.split("|");
    await recalcFinancialsForWeek(serviceId, day(d)).catch(() => undefined);
  }
  return out;
}
