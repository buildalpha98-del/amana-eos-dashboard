/**
 * The budget bank (Daniel, 21 Oct 2026): unspent monthly budget banked,
 * bank-funded purchases kept out of the month.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

vi.mock("@/lib/budget-helpers", () => ({
  getMonthlyBudget: vi.fn(async () => ({ amount: 300, source: "tier" })),
  recalcFinancialsForWeek: vi.fn(async () => undefined),
}));
vi.mock("@/lib/org-settings", () => ({ getOrgSettings: vi.fn(async () => ({ groceryRates: { bsc: 0.8, asc: 1.2, vc: 4.5 } })) }));

import { closeMonthForService, runBankMonthClose, spendFromBank } from "@/lib/budget-bank";

const OCT = new Date("2026-10-01T00:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.budgetItem.aggregate.mockImplementation(async (a: { where: { category: unknown } }) =>
    a.where.category === "groceries" ? { _sum: { amount: 40 } } : { _sum: { amount: 120 } },
  );
  // 50 permanent + 10 casual ASC sessions → 60 × $1.20 = $72 grocery budget.
  prismaMock.dailyAttendance.findMany.mockResolvedValue([{ sessionType: "asc", enrolled: 50, attended: 10 }]);
  prismaMock.budgetBankEntry.findUnique.mockResolvedValue(null);
  prismaMock.budgetBankEntry.create.mockResolvedValue({});
});

describe("closing a month", () => {
  it("banks what wasn't spent of each budget", async () => {
    expect(await closeMonthForService("svc", OCT)).toEqual({ purchases: 180, groceries: 32 });
    const rows = prismaMock.budgetBankEntry.create.mock.calls.map((c: { data: Record<string, unknown> }[]) => c[0].data);
    expect(rows.map((r: Record<string, unknown>) => [r.kind, r.budget, r.amount])).toEqual([
      ["rollover", "purchases", 180],
      ["rollover", "groceries", 32],
    ]);
    expect(rows[0].description).toContain("October 2026");
    // Spend that month excludes bank-funded purchases.
    expect(prismaMock.budgetItem.aggregate.mock.calls[0][0].where.fundedFromBank).toBe(false);
  });
  it("is idempotent, and an overspend banks nothing", async () => {
    prismaMock.budgetBankEntry.findUnique.mockResolvedValue({ id: "x" });
    expect(await closeMonthForService("svc", OCT)).toEqual({ purchases: 0, groceries: 0 });
    prismaMock.budgetBankEntry.findUnique.mockResolvedValue(null);
    prismaMock.budgetItem.aggregate.mockResolvedValue({ _sum: { amount: 999 } });
    expect(await closeMonthForService("svc", OCT)).toEqual({ purchases: 0, groceries: 0 });
  });
  it("the cron closes LAST month (Sydney) for every active centre", async () => {
    prismaMock.service.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    const r = await runBankMonthClose(new Date("2026-11-01T16:00:00Z")); // 3am 2 Nov Sydney
    expect(r).toMatchObject({ month: "2026-10", centres: 2, banked: 424 });
  });
});

describe("spending from the bank", () => {
  it("records the purchase as bank-funded and the withdrawal", async () => {
    prismaMock.budgetBankEntry.aggregate.mockResolvedValue({ _sum: { amount: 500 } });
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock));
    prismaMock.budgetItem.create.mockResolvedValue({ id: "item1" });
    prismaMock.budgetBankEntry.create.mockResolvedValue({ id: "e1" });
    await spendFromBank({ serviceId: "svc", amount: 189, description: "New microwave", category: "kitchen", byId: "u" });
    expect(prismaMock.budgetItem.create.mock.calls[0][0].data).toMatchObject({ amount: 189, fundedFromBank: true, name: "New microwave" });
    expect(prismaMock.budgetBankEntry.create.mock.calls[0][0].data).toMatchObject({ kind: "withdrawal", amount: -189, budgetItemId: "item1" });
  });
  it("can't spend more than is banked", async () => {
    prismaMock.budgetBankEntry.aggregate.mockResolvedValue({ _sum: { amount: 50 } });
    await expect(spendFromBank({ serviceId: "svc", amount: 189, description: "Microwave", category: "kitchen", byId: "u" })).rejects.toThrow(/Only \$50.00/);
  });
});
