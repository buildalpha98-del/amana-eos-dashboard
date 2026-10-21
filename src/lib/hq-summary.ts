/**
 * Amana HQ — the Network Summary of the master accounts tracker (Daniel,
 * 21 Oct 2026), computed live from what Cowork posts:
 *
 *   Selected week   bookings (Rise and Shine Club / Amana Afternoons),
 *                   change vs previous week, revenue, staff cost incl. super,
 *                   staff cost %, margin after staff, grocery budget,
 *                   Woolies food spend, grocery over/(under)
 *   Term to date    weeks logged, average weekly bookings, Rise and Shine
 *                   share, revenue, staff, staff %, margin, Woolies budget vs
 *                   spend, orders over budget
 *   Resources month average weekly bookings, resource budget ($150, or $300
 *                   above the high-attendance threshold — the org's purchase
 *                   tiers), spend, remaining, feedback received, reflections,
 *                   stock items to reorder
 *   + the budget bank and how fresh the OWNA data is.
 *
 * Settings from the tracker's Lists tab: grocery rates come from org
 * settings (Rise and Shine $0.80, Amana Afternoons $1.20); staff cost % is
 * amber from 50% and red from 70%.
 */
import { prisma } from "@/lib/prisma";
import { getOrgSettings } from "@/lib/org-settings";
import { getCurrentTerm } from "@/lib/school-terms";
import { addDaysUTC, serviceWeekStart } from "@/lib/timezone";

export const STAFF_PCT_AMBER = 0.5;
export const STAFF_PCT_RED = 0.7;
const DEFAULT_TIERS = [
  { minWeeklyChildren: 100, monthlyBudget: 300 },
  { minWeeklyChildren: 0, monthlyBudget: 150 },
];

const r2 = (n: number) => Math.round(n * 100) / 100;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

export interface HqWeekRow {
  serviceId: string;
  name: string;
  code: string;
  state: string | null;
  logged: boolean;
  termWeek: string | null;
  bscBookings: number;
  ascBookings: number;
  totalBookings: number;
  changeVsPrev: number | null;
  bscRevenue: number;
  ascRevenue: number;
  otherRevenue: number;
  revenue: number;
  staffCost: number | null;
  staffPct: number | null;
  margin: number | null;
  groceryBudget: number;
  foodSpend: number;
  groceryOverUnder: number | null;
  notes: string | null;
}

export interface HqTermRow {
  serviceId: string;
  weeksLogged: number;
  avgWeeklyBookings: number;
  bscShare: number | null;
  revenue: number;
  staffCost: number;
  staffPct: number | null;
  margin: number;
  wooliesBudget: number;
  wooliesSpend: number;
  wooliesOverUnder: number;
  ordersOverBudget: number;
}

export interface HqMonthRow {
  serviceId: string;
  avgWeeklyBookings: number;
  resourceBudget: number;
  resourceSpend: number;
  remaining: number;
  feedbackReceived: boolean | null;
  reflections: string | null;
  stockToReorder: number;
  bank: number;
  dataAsOf: string | null;
}

export async function hqSummary(opts: { week?: string; month?: string; termStart?: string; serviceIds?: string[] | null } = {}) {
  const services = await prisma.service.findMany({
    where: { status: "active", ...(opts.serviceIds ? { id: { in: opts.serviceIds } } : {}) },
    select: { id: true, name: true, code: true, state: true, coworkFeedAt: true, ownaSyncedAt: true, ownaServiceId: true },
  });
  const ids = services.map((s) => s.id);

  // The week: asked for, else the latest one Cowork logged, else this week.
  const latest = await prisma.serviceWeeklyAccounts.findFirst({ where: { serviceId: { in: ids } }, orderBy: { weekStart: "desc" }, select: { weekStart: true } });
  const week = opts.week ? new Date(`${opts.week}T00:00:00Z`) : latest?.weekStart ?? serviceWeekStart(new Date(), 1);
  const prevWeek = addDaysUTC(week, -7);
  const termStart = opts.termStart
    ? new Date(`${opts.termStart}T00:00:00Z`)
    : addDaysUTC(new Date(Date.UTC(getCurrentTerm(week).startsOn.getUTCFullYear(), getCurrentTerm(week).startsOn.getUTCMonth(), getCurrentTerm(week).startsOn.getUTCDate())), -7);
  const month = opts.month ? new Date(`${opts.month}-01T00:00:00Z`) : new Date(Date.UTC(week.getUTCFullYear(), week.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));

  const [{ groceryRates }, org, weeks, orders, resources, feedback, stock, bank] = await Promise.all([
    getOrgSettings(),
    prisma.orgSettings.findUnique({ where: { id: "singleton" }, select: { purchaseBudgetTiers: true } }),
    prisma.serviceWeeklyAccounts.findMany({
      where: { serviceId: { in: ids }, weekStart: { gte: addDaysUTC(termStart < month ? termStart : month, -7), lte: week > monthEnd ? week : addDaysUTC(monthEnd, 7) } },
    }),
    prisma.groceryOrder.findMany({ where: { serviceId: { in: ids }, weekStart: { gte: termStart < month ? termStart : month } } }),
    prisma.budgetItem.findMany({
      where: { serviceId: { in: ids }, date: { gte: month, lt: monthEnd }, category: { not: "groceries" }, fundedFromBank: false },
      select: { serviceId: true, amount: true },
    }),
    prisma.programFeedbackWeek.findMany({ where: { serviceId: { in: ids }, weekStart: week } }),
    prisma.stockItem.findMany({ where: { serviceId: { in: ids }, reorderAt: { not: null } }, select: { serviceId: true, qtyOnHand: true, reorderAt: true } }),
    prisma.budgetBankEntry.groupBy({ by: ["serviceId"], where: { serviceId: { in: ids } }, _sum: { amount: true } }),
  ]);
  const tiers = ((org?.purchaseBudgetTiers as typeof DEFAULT_TIERS | null) ?? DEFAULT_TIERS).slice().sort((a, b) => b.minWeeklyChildren - a.minWeeklyChildren);
  const resourceBudgetFor = (avg: number) => tiers.find((t) => avg >= t.minWeeklyChildren)?.monthlyBudget ?? 0;
  const groceryBudget = (bsc: number, asc: number) => r2(bsc * groceryRates.bsc + asc * groceryRates.asc);
  const same = (a: Date, b: Date) => iso(a) === iso(b);

  const weekRows: HqWeekRow[] = [];
  const termRows: HqTermRow[] = [];
  const monthRows: HqMonthRow[] = [];
  for (const s of services) {
    const mine = weeks.filter((w) => w.serviceId === s.id);
    const w = mine.find((x) => same(x.weekStart, week));
    const p = mine.find((x) => same(x.weekStart, prevWeek));
    const wOrders = orders.filter((o) => o.serviceId === s.id && same(o.weekStart, week));
    const foodSpend = r2(wOrders.reduce((t, o) => t + o.foodSpend, 0));
    const orderBudget = wOrders.reduce((t, o) => t + (o.budget ?? 0), 0);
    const bsc = w?.bscBookings ?? 0;
    const asc = w?.ascBookings ?? 0;
    const revenue = w?.totalRevenue ?? 0;
    const staff = w?.staffCost ?? null;
    weekRows.push({
      serviceId: s.id,
      name: s.name.replace(/^Amana OSHC\s+/i, ""),
      code: s.code,
      state: s.state,
      logged: !!w,
      termWeek: w?.termWeek ?? null,
      bscBookings: bsc,
      ascBookings: asc,
      totalBookings: bsc + asc,
      changeVsPrev: w && p ? bsc + asc - (p.bscBookings + p.ascBookings) : null,
      bscRevenue: w?.bscRevenue ?? 0,
      ascRevenue: w?.ascRevenue ?? 0,
      otherRevenue: w?.otherRevenue ?? 0,
      revenue: r2(revenue),
      staffCost: staff,
      staffPct: staff != null ? ratio(staff, revenue) : null,
      margin: staff != null ? r2(revenue - staff) : null,
      groceryBudget: groceryBudget(bsc, asc),
      foodSpend,
      groceryOverUnder: wOrders.length ? r2(foodSpend - orderBudget) : null,
      notes: w?.notes ?? null,
    });

    const term = mine.filter((x) => x.weekStart >= termStart && x.weekStart <= week);
    const tRev = term.reduce((t, x) => t + x.totalRevenue, 0);
    const tStaff = term.reduce((t, x) => t + (x.staffCost ?? 0), 0);
    const tBookings = term.reduce((t, x) => t + x.bscBookings + x.ascBookings, 0);
    const tBsc = term.reduce((t, x) => t + x.bscBookings, 0);
    const tOrders = orders.filter((o) => o.serviceId === s.id && o.weekStart >= termStart && o.weekStart <= week);
    const wb = tOrders.reduce((t, o) => t + (o.budget ?? 0), 0);
    const ws = tOrders.reduce((t, o) => t + o.foodSpend, 0);
    termRows.push({
      serviceId: s.id,
      weeksLogged: term.length,
      avgWeeklyBookings: term.length ? Math.round((tBookings / term.length) * 10) / 10 : 0,
      bscShare: ratio(tBsc, tBookings),
      revenue: r2(tRev),
      staffCost: r2(tStaff),
      staffPct: ratio(tStaff, tRev),
      margin: r2(tRev - tStaff),
      wooliesBudget: r2(wb),
      wooliesSpend: r2(ws),
      wooliesOverUnder: r2(ws - wb),
      ordersOverBudget: tOrders.filter((o) => o.budget != null && o.foodSpend > o.budget).length,
    });

    const inMonth = mine.filter((x) => x.weekStart >= month && x.weekStart < monthEnd);
    const avg = inMonth.length ? inMonth.reduce((t, x) => t + x.bscBookings + x.ascBookings, 0) / inMonth.length : 0;
    const budget = resourceBudgetFor(avg);
    const spend = r2(resources.filter((x) => x.serviceId === s.id).reduce((t, x) => t + x.amount, 0));
    const fb = feedback.find((f) => f.serviceId === s.id);
    const fresh = [s.coworkFeedAt, s.ownaServiceId ? s.ownaSyncedAt : null].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0];
    monthRows.push({
      serviceId: s.id,
      avgWeeklyBookings: Math.round(avg * 10) / 10,
      resourceBudget: budget,
      resourceSpend: spend,
      remaining: r2(budget - spend),
      feedbackReceived: fb ? fb.feedbackReceived : null,
      reflections: fb?.reflections ?? null,
      stockToReorder: stock.filter((x) => x.serviceId === s.id && x.qtyOnHand != null && x.reorderAt != null && x.qtyOnHand <= x.reorderAt).length,
      bank: r2(bank.find((b) => b.serviceId === s.id)?._sum.amount ?? 0),
      dataAsOf: fresh?.toISOString() ?? null,
    });
  }

  // NSW then VIC, like the tracker.
  const order = (a: { state: string | null; name: string }, b: { state: string | null; name: string }) =>
    (a.state ?? "").localeCompare(b.state ?? "") || a.name.localeCompare(b.name);
  weekRows.sort(order);
  const pos = new Map(weekRows.map((r, i) => [r.serviceId, i]));
  termRows.sort((a, b) => pos.get(a.serviceId)! - pos.get(b.serviceId)!);
  monthRows.sort((a, b) => pos.get(a.serviceId)! - pos.get(b.serviceId)!);

  return {
    week: iso(week),
    termStart: iso(termStart),
    month: iso(month).slice(0, 7),
    weeksAvailable: [...new Set(weeks.map((w) => iso(w.weekStart)))].sort().reverse(),
    thresholds: { amber: STAFF_PCT_AMBER, red: STAFF_PCT_RED },
    weekRows,
    termRows,
    monthRows,
  };
}

/** One centre's tab of the tracker. */
export async function hqCentre(serviceId: string, termStart?: string) {
  const start = termStart ? new Date(`${termStart}T00:00:00Z`) : addDaysUTC(getCurrentTerm(new Date()).startsOn, -7);
  const [service, weeks, orders, resources, feedback, stock] = await Promise.all([
    prisma.service.findUnique({ where: { id: serviceId }, select: { id: true, name: true, code: true, state: true } }),
    prisma.serviceWeeklyAccounts.findMany({ where: { serviceId, weekStart: { gte: start } }, orderBy: { weekStart: "asc" } }),
    prisma.groceryOrder.findMany({ where: { serviceId, weekStart: { gte: start } }, orderBy: { deliveryDate: "asc" } }),
    prisma.budgetItem.findMany({
      where: { serviceId, date: { gte: start }, category: { not: "groceries" } },
      orderBy: { date: "desc" },
      select: { id: true, name: true, amount: true, category: true, date: true, notes: true, fundedFromBank: true },
    }),
    prisma.programFeedbackWeek.findMany({ where: { serviceId, weekStart: { gte: start } }, orderBy: { weekStart: "desc" } }),
    prisma.stockItem.findMany({ where: { serviceId }, orderBy: [{ category: "asc" }, { item: "asc" }] }),
  ]);
  return { service, termStart: start.toISOString().slice(0, 10), weeks, orders, resources, feedback, stock };
}
