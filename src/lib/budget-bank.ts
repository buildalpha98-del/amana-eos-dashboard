/**
 * The budget bank (Daniel, 21 Oct 2026).
 *
 * "Whatever budget they don't use … a bank system": when a month closes,
 * what each centre didn't spend of that month's
 *   - purchase budget (the org's tier allocation, non-grocery spend), and
 *   - grocery budget (bookings × the org's per-session grocery rates),
 * is banked. The bank then pays for bigger things — a new microwave,
 * something exciting for the kids. Bank-funded purchases are BudgetItems
 * flagged fundedFromBank, so they never count against a month's budget.
 *
 * Overspends aren't taken from the bank: a month that overspent simply
 * banks nothing. Closing is idempotent (one rollover per centre / month /
 * budget) and runs on the 1st via cron budget-bank-close.
 */
import { prisma } from "@/lib/prisma";
import { getMonthlyBudget, recalcFinancialsForWeek } from "@/lib/budget-helpers";
import { getOrgSettings } from "@/lib/org-settings";
import { serviceDateOnly, serviceMonthStart } from "@/lib/timezone";
import { ApiError } from "@/lib/api-error";
import type { BudgetItemCategory } from "@prisma/client";

const round2 = (n: number) => Math.round(n * 100) / 100;
const monthEnd = (m: Date) => new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1));
const monthLabel = (m: Date) => m.toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });

/** What a centre had and spent for one month (first day, UTC midnight). */
export async function monthBudgetResult(serviceId: string, month: Date) {
  const end = monthEnd(month);
  const [allocation, purchases, groceries, attendance, { groceryRates }] = await Promise.all([
    getMonthlyBudget(serviceId),
    prisma.budgetItem.aggregate({
      where: { serviceId, date: { gte: month, lt: end }, category: { not: "groceries" }, fundedFromBank: false },
      _sum: { amount: true },
    }),
    prisma.budgetItem.aggregate({
      where: { serviceId, date: { gte: month, lt: end }, category: "groceries", fundedFromBank: false },
      _sum: { amount: true },
    }),
    prisma.dailyAttendance.findMany({
      where: { serviceId, date: { gte: month, lt: end } },
      select: { sessionType: true, enrolled: true, attended: true },
    }),
    getOrgSettings(),
  ]);
  // Same grocery maths as the Budget tab: (permanent + casual) × rate.
  const groceryBudget = attendance.reduce((s, r) => s + (r.enrolled + r.attended) * ((groceryRates as Record<string, number>)[r.sessionType] ?? 0), 0);
  return {
    purchaseBudget: round2(allocation.amount),
    purchaseSpent: round2(purchases._sum.amount ?? 0),
    groceryBudget: round2(groceryBudget),
    grocerySpent: round2(groceries._sum.amount ?? 0),
  };
}

/** Bank one centre's unspent budgets for a closed month. Idempotent. */
export async function closeMonthForService(serviceId: string, month: Date): Promise<{ purchases: number; groceries: number }> {
  const r = await monthBudgetResult(serviceId, month);
  const out = { purchases: 0, groceries: 0 };
  const rows: { budget: "purchases" | "groceries"; amount: number; label: string }[] = [
    { budget: "purchases", amount: round2(Math.max(0, r.purchaseBudget - r.purchaseSpent)), label: `Unspent purchase budget — ${monthLabel(month)} ($${r.purchaseSpent.toFixed(2)} of $${r.purchaseBudget.toFixed(2)} spent)` },
    { budget: "groceries", amount: round2(Math.max(0, r.groceryBudget - r.grocerySpent)), label: `Unspent grocery budget — ${monthLabel(month)} ($${r.grocerySpent.toFixed(2)} of $${r.groceryBudget.toFixed(2)} spent)` },
  ];
  for (const row of rows) {
    // A grocery budget only exists where attendance was recorded.
    if (row.amount <= 0) continue;
    const existing = await prisma.budgetBankEntry.findUnique({
      where: { serviceId_kind_budget_month: { serviceId, kind: "rollover", budget: row.budget, month } },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.budgetBankEntry.create({
      data: { serviceId, kind: "rollover", budget: row.budget, month, amount: row.amount, description: row.label },
    });
    out[row.budget] = row.amount;
  }
  return out;
}

/** Cron: close LAST month (Sydney) for every active centre. */
export async function runBankMonthClose(now = new Date()): Promise<{ month: string; centres: number; banked: number }> {
  const month = serviceMonthStart(now, -1);
  const services = await prisma.service.findMany({ where: { status: "active" }, select: { id: true } });
  let banked = 0;
  for (const s of services) {
    const r = await closeMonthForService(s.id, month);
    banked += r.purchases + r.groceries;
  }
  return { month: month.toISOString().slice(0, 7), centres: services.length, banked: round2(banked) };
}

export async function bankBalance(serviceId: string): Promise<number> {
  const r = await prisma.budgetBankEntry.aggregate({ where: { serviceId }, _sum: { amount: true } });
  return round2(r._sum.amount ?? 0);
}

/** Spend from the bank: records the purchase (fundedFromBank) and the withdrawal. */
export async function spendFromBank(input: {
  serviceId: string;
  amount: number;
  description: string;
  category: BudgetItemCategory;
  byId: string;
  now?: Date;
}) {
  const amount = round2(input.amount);
  if (amount <= 0) throw ApiError.badRequest("Enter an amount");
  const balance = await bankBalance(input.serviceId);
  if (amount > balance) throw ApiError.badRequest(`Only $${balance.toFixed(2)} is banked for this centre.`);
  const date = serviceDateOnly(input.now ?? new Date());
  const result = await prisma.$transaction(async (tx) => {
    const item = await tx.budgetItem.create({
      data: {
        serviceId: input.serviceId,
        name: input.description,
        amount,
        category: input.category,
        date,
        notes: "Paid from the centre's budget bank.",
        fundedFromBank: true,
        createdById: input.byId,
      },
    });
    const entry = await tx.budgetBankEntry.create({
      data: {
        serviceId: input.serviceId,
        kind: "withdrawal",
        budget: input.category,
        amount: -amount,
        description: input.description,
        budgetItemId: item.id,
        createdById: input.byId,
      },
    });
    return { item, entry };
  });
  await recalcFinancialsForWeek(input.serviceId, date).catch(() => undefined);
  return result;
}

/** Balance, ledger, and this month so far (what would bank if it closed now). */
export async function bankOverview(serviceId: string, now = new Date()) {
  const month = serviceMonthStart(now);
  const [balance, entries, thisMonth] = await Promise.all([
    bankBalance(serviceId),
    prisma.budgetBankEntry.findMany({ where: { serviceId }, orderBy: { createdAt: "desc" }, take: 50 }),
    monthBudgetResult(serviceId, month),
  ]);
  return {
    balance,
    entries,
    thisMonth: {
      month: month.toISOString().slice(0, 7),
      ...thisMonth,
      onTrackToBank: round2(Math.max(0, thisMonth.purchaseBudget - thisMonth.purchaseSpent) + Math.max(0, thisMonth.groceryBudget - thisMonth.grocerySpent)),
    },
  };
}
