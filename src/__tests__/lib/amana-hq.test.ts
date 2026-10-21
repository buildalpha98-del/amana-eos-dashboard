/**
 * Amana HQ (Daniel, 21 Oct 2026): the master accounts tracker in the
 * dashboard — Cowork's rows in, the Network Summary out. Figures are
 * MFIS Greenacre's real Term 4 Week 1 from the tracker.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

vi.mock("@/lib/budget-helpers", () => ({ recalcFinancialsForWeek: vi.fn(async () => undefined) }));
vi.mock("@/lib/org-settings", () => ({ getOrgSettings: vi.fn(async () => ({ groceryRates: { bsc: 0.8, asc: 1.2, vc: 4.5 } })) }));

import { accountsSchema, ingestAccounts } from "@/lib/hq-accounts-ingest";
import { hqSummary } from "@/lib/hq-summary";

const W1 = new Date("2026-10-12T00:00:00Z");

describe("Cowork → Amana HQ", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.service.findMany.mockResolvedValue([{ id: "ga", code: "MFIS-GA" }]);
    for (const m of [prismaMock.serviceWeeklyAccounts, prismaMock.groceryOrder, prismaMock.budgetItem, prismaMock.stockItem, prismaMock.programFeedbackWeek]) m.upsert.mockResolvedValue({});
  });
  it("upserts the week, the Woolies order (as grocery spend), resources, stock and feedback", async () => {
    const p = accountsSchema.parse({
      weekly: [{ serviceCode: "MFIS-GA", weekStart: "2026-10-12", termWeek: "NSW W1", bscBookings: 32, ascBookings: 157, bscRevenue: 885.62, ascRevenue: 6828.84, otherRevenue: 1912.58, staffCost: 4122.58 }],
      groceryOrders: [{ serviceCode: "MFIS-GA", orderNo: "331654698", deliveryDate: "2026-10-19", weekStart: "2026-10-19", budget: 242.8, foodSpend: 231.72, totalPaid: 242.52 }],
      resources: [{ serviceCode: "MFIS-GA", month: "2026-10-01", supplier: "Kmart", orderRef: "715333153", items: "Program resources", spend: 79 }],
      stock: [{ serviceCode: "MFIS-GA", item: "Glue sticks", qtyOnHand: 4, reorderAt: 10 }],
      feedback: [{ serviceCode: "MFIS-GA", weekStart: "2026-10-12", feedbackReceived: false, reflections: "partial", kidsEnjoyed: "Team trivia" }],
      unknownSection: "ignored",
    });
    const r = await ingestAccounts(p);
    expect(r).toMatchObject({ weekly: 1, groceryOrders: 1, resources: 1, stock: 1, feedback: 1, unknownServiceCodes: [] });
    // Total revenue defaults to the three lines added up.
    expect(prismaMock.serviceWeeklyAccounts.upsert.mock.calls[0][0].create.totalRevenue).toBeCloseTo(9627.04, 2);
    const items = prismaMock.budgetItem.upsert.mock.calls.map((c: { create: Record<string, unknown> }[]) => c[0].create);
    expect(items[0]).toMatchObject({ category: "groceries", amount: 231.72, externalRef: "grocery:MFIS-GA:331654698" });
    expect(items[1]).toMatchObject({ category: "program_materials", amount: 79, name: "Kmart — Program resources" });
  });
});

describe("Network Summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.service.findMany.mockResolvedValue([
      { id: "ga", name: "Amana OSHC MFIS Greenacre", code: "MFIS-GA", state: "NSW", coworkFeedAt: null, ownaSyncedAt: null, ownaServiceId: null },
      { id: "sp", name: "Amana OSHC Minaret Springvale", code: "MIN-SPR", state: "VIC", coworkFeedAt: null, ownaSyncedAt: null, ownaServiceId: null },
    ]);
    prismaMock.serviceWeeklyAccounts.findFirst.mockResolvedValue({ weekStart: W1 });
    prismaMock.serviceWeeklyAccounts.findMany.mockResolvedValue([
      { serviceId: "ga", weekStart: W1, termWeek: "NSW W1", bscBookings: 32, ascBookings: 157, bscRevenue: 885.62, ascRevenue: 6828.84, otherRevenue: 1912.58, totalRevenue: 9627.04, staffCost: 4122.58, notes: null },
      { serviceId: "sp", weekStart: new Date("2026-10-05T00:00:00Z"), termWeek: "VIC W1", bscBookings: 0, ascBookings: 30, bscRevenue: 0, ascRevenue: 986.74, otherRevenue: 0, totalRevenue: 986.74, staffCost: 1185.53, notes: null },
      { serviceId: "sp", weekStart: W1, termWeek: "VIC W2", bscBookings: 0, ascBookings: 24, bscRevenue: 0, ascRevenue: 892.85, otherRevenue: 0, totalRevenue: 892.85, staffCost: 1343.52, notes: "Staff cost above revenue." },
    ]);
    prismaMock.orgSettings.findUnique.mockResolvedValue({ purchaseBudgetTiers: null });
    prismaMock.groceryOrder.findMany.mockResolvedValue([]);
    prismaMock.budgetItem.findMany.mockResolvedValue([{ serviceId: "sp", amount: 56.5 }]);
    prismaMock.programFeedbackWeek.findMany.mockResolvedValue([{ serviceId: "ga", feedbackReceived: false, reflections: "partial" }]);
    prismaMock.stockItem.findMany.mockResolvedValue([]);
    prismaMock.budgetBankEntry.groupBy.mockResolvedValue([]);
  });
  it("matches the tracker's selected week, term to date and resources", async () => {
    const d = await hqSummary({ week: "2026-10-12", month: "2026-10", termStart: "2026-10-05" });
    const ga = d.weekRows.find((r) => r.serviceId === "ga")!;
    expect(ga).toMatchObject({ totalBookings: 189, revenue: 9627.04, staffCost: 4122.58, margin: 5504.46, groceryBudget: 214 });
    expect(ga.staffPct).toBeCloseTo(0.4282, 3);
    const sp = d.weekRows.find((r) => r.serviceId === "sp")!;
    expect(sp).toMatchObject({ totalBookings: 24, changeVsPrev: -6, margin: -450.67 });
    const spTerm = d.termRows.find((r) => r.serviceId === "sp")!;
    expect(spTerm).toMatchObject({ weeksLogged: 2, avgWeeklyBookings: 27, revenue: 1879.59, staffCost: 2529.05, margin: -649.46 });
    // Resources: avg 189 → $300 tier; Springvale avg 27 → $150, spent $56.50.
    expect(d.monthRows.find((r) => r.serviceId === "ga")).toMatchObject({ resourceBudget: 300, feedbackReceived: false, reflections: "partial" });
    expect(d.monthRows.find((r) => r.serviceId === "sp")).toMatchObject({ resourceBudget: 150, resourceSpend: 56.5, remaining: 93.5 });
    // NSW before VIC, like the tracker.
    expect(d.weekRows.map((r) => r.state)).toEqual(["NSW", "VIC"]);
  });
});
