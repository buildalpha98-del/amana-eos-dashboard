/**
 * Financials → Centre breakdown (Daniel, 21 Oct 2026): one row per centre
 * for a week or month — the "OWNA HQ" view, built from what the dashboard
 * holds:
 *
 *   sessions   DailyAttendance (OWNA API, Cowork's twice-weekly run, imports)
 *              — permanent + casual, per BSC/ASC/VC, and absences;
 *   occupancy  sessions ÷ (capacity × days with data);
 *   revenue    the fees OWNA charged (Cowork's run reports them per session);
 *              where none were reported, sessions × the centre's daily rates
 *              (an estimate, labelled as such);
 *   staff      OWNA staff sign-in hours × contract pay rates; where OWNA sent
 *              no hours, rostered hours × pay rates (an estimate). Before
 *              on-costs; hours without a pay rate are flagged;
 *   spend      BudgetItems: purchases, groceries, program materials (bank-
 *              funded purchases separate);
 *   bank       the centre's budget bank balance;
 *   freshness  when attendance last arrived (Cowork run / OWNA sync).
 */
import { prisma } from "@/lib/prisma";
import { payRateForShift, projectCost, type ContractWindow } from "@/lib/roster-cost";
import { serviceMonthStart, serviceWeekStart, addDaysUTC } from "@/lib/timezone";

export type BreakdownPeriod = "this_week" | "last_week" | "this_month" | "last_month";
const round2 = (n: number) => Math.round(n * 100) / 100;

export function periodBounds(period: BreakdownPeriod, now = new Date()): { from: Date; to: Date; label: string } {
  const fmt = (d: Date) => d.toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" });
  if (period === "this_week" || period === "last_week") {
    const from = serviceWeekStart(now, 1);
    const start = period === "last_week" ? addDaysUTC(from, -7) : from;
    const to = addDaysUTC(start, 7);
    return { from: start, to, label: `Week of ${fmt(start)}` };
  }
  const from = serviceMonthStart(now, period === "last_month" ? -1 : 0);
  const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
  return { from, to, label: from.toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" }) };
}

export interface CentreBreakdownRow {
  serviceId: string;
  name: string;
  code: string;
  state: string | null;
  sessions: { bsc: number; asc: number; vc: number; total: number; permanent: number; casual: number; absent: number };
  occupancy: number | null;
  revenue: number;
  /** "owna" = fees OWNA charged; "estimate" = sessions × daily rates. */
  revenueSource: "owna" | "estimate";
  staffCost: number;
  /** "owna" = OWNA staff sign-ins; "roster" = rostered shifts. */
  staffSource: "owna" | "roster";
  staffHours: number;
  unpricedHours: number;
  purchases: number;
  groceries: number;
  materials: number;
  bankFunded: number;
  bank: number;
  margin: number | null;
  costPerSession: number | null;
  dataAsOf: string | null;
  dataSource: "cowork" | "owna" | "none";
}

export async function centreBreakdown(period: BreakdownPeriod, serviceIds: string[] | null, now = new Date()) {
  const { from, to, label } = periodBounds(period, now);
  const services = await prisma.service.findMany({
    where: { status: "active", ...(serviceIds === null ? {} : { id: { in: serviceIds } }) },
    select: {
      id: true,
      name: true,
      code: true,
      state: true,
      capacity: true,
      capacityBsc: true,
      capacityAsc: true,
      capacityVc: true,
      bscDailyRate: true,
      ascDailyRate: true,
      vcDailyRate: true,
      coworkFeedAt: true,
      ownaSyncedAt: true,
      ownaServiceId: true,
    },
    orderBy: { name: "asc" },
  });
  const ids = services.map((s) => s.id);
  const [attendance, items, shifts, bank] = await Promise.all([
    prisma.dailyAttendance.findMany({
      where: { serviceId: { in: ids }, date: { gte: from, lt: to } },
      select: { serviceId: true, date: true, sessionType: true, enrolled: true, attended: true, absent: true, feesCharged: true },
    }),
    prisma.budgetItem.findMany({
      where: { serviceId: { in: ids }, date: { gte: from, lt: to } },
      select: { serviceId: true, amount: true, category: true, fundedFromBank: true },
    }),
    prisma.rosterShift.findMany({
      where: { serviceId: { in: ids }, date: { gte: from, lt: to } },
      select: { serviceId: true, userId: true, date: true, shiftStart: true, shiftEnd: true },
    }),
    prisma.budgetBankEntry.groupBy({ by: ["serviceId"], where: { serviceId: { in: ids } }, _sum: { amount: true } }),
  ]);
  const staffHours = await prisma.ownaStaffHours.findMany({
    where: { serviceId: { in: ids }, date: { gte: from, lt: to } },
    select: { serviceId: true, userId: true, date: true, hours: true },
  });
  const userIds = [
    ...new Set([...shifts.map((s) => s.userId), ...staffHours.map((h) => h.userId)].filter((u): u is string => !!u)),
  ];
  const contracts: ContractWindow[] = userIds.length
    ? (
        await prisma.employmentContract.findMany({
          where: {
            userId: { in: userIds },
            status: { in: ["active", "superseded"] },
            startDate: { lt: to },
            OR: [{ endDate: null }, { endDate: { gte: from } }],
          },
          select: { userId: true, payRate: true, startDate: true, endDate: true },
        })
      ).map((c) => ({ userId: c.userId, payRate: c.payRate, startDate: c.startDate, endDate: c.endDate }))
    : [];

  const rows: CentreBreakdownRow[] = services.map((s) => {
    const att = attendance.filter((a) => a.serviceId === s.id);
    const sess = { bsc: 0, asc: 0, vc: 0, total: 0, permanent: 0, casual: 0, absent: 0 };
    const capByType: Record<string, number> = { bsc: s.capacityBsc ?? s.capacity ?? 0, asc: s.capacityAsc ?? s.capacity ?? 0, vc: s.capacityVc ?? s.capacity ?? 0 };
    let capacity = 0;
    for (const a of att) {
      const n = a.enrolled + a.attended;
      if (a.sessionType === "bsc" || a.sessionType === "asc" || a.sessionType === "vc") sess[a.sessionType] += n;
      sess.total += n;
      sess.permanent += a.enrolled;
      sess.casual += a.attended;
      sess.absent += a.absent;
      capacity += capByType[a.sessionType] ?? 0;
    }
    // Revenue: OWNA's fees where reported, else the rate estimate.
    const reportedFees = att.filter((a) => a.feesCharged != null);
    const revenueSource: "owna" | "estimate" = reportedFees.length ? "owna" : "estimate";
    const revenue = reportedFees.length
      ? reportedFees.reduce((t, a) => t + (a.feesCharged ?? 0), 0)
      : sess.bsc * (s.bscDailyRate ?? 0) + sess.asc * (s.ascDailyRate ?? 0) + sess.vc * (s.vcDailyRate ?? 0);
    // Staff: OWNA sign-in hours × pay rate where reported, else the roster.
    const myHours = staffHours.filter((h) => h.serviceId === s.id);
    const staffSource: "owna" | "roster" = myHours.length ? "owna" : "roster";
    const cost = myHours.length
      ? myHours.reduce(
          (c, h) => {
            const rate = h.userId ? payRateForShift(contracts, h.userId, h.date) : null;
            return {
              totalHours: c.totalHours + h.hours,
              totalCost: c.totalCost + (rate != null ? h.hours * rate : 0),
              unpricedHours: c.unpricedHours + (rate != null ? 0 : h.hours),
            };
          },
          { totalHours: 0, totalCost: 0, unpricedHours: 0 },
        )
      : projectCost(shifts.filter((x) => x.serviceId === s.id), contracts);
    const mine = items.filter((i) => i.serviceId === s.id);
    const sum = (f: (i: (typeof mine)[number]) => boolean) => round2(mine.filter(f).reduce((t, i) => t + i.amount, 0));
    const purchases = sum((i) => !i.fundedFromBank && i.category !== "groceries" && i.category !== "program_materials");
    const groceries = sum((i) => !i.fundedFromBank && i.category === "groceries");
    const materials = sum((i) => !i.fundedFromBank && i.category === "program_materials");
    const bankFunded = sum((i) => i.fundedFromBank);
    const totalCost = cost.totalCost + purchases + groceries + materials;
    const fresh = [s.coworkFeedAt, s.ownaServiceId ? s.ownaSyncedAt : null].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0];
    return {
      serviceId: s.id,
      name: s.name.replace(/^Amana OSHC\s+/i, ""),
      code: s.code,
      state: s.state,
      sessions: sess,
      occupancy: capacity > 0 ? Math.round((sess.total / capacity) * 1000) / 10 : null,
      revenue: round2(revenue),
      revenueSource,
      staffCost: round2(cost.totalCost),
      staffSource,
      staffHours: round2(cost.totalHours),
      unpricedHours: round2(cost.unpricedHours),
      purchases,
      groceries,
      materials,
      bankFunded,
      bank: round2(bank.find((b) => b.serviceId === s.id)?._sum.amount ?? 0),
      margin: revenue > 0 ? Math.round(((revenue - totalCost) / revenue) * 1000) / 10 : null,
      costPerSession: sess.total > 0 ? round2(totalCost / sess.total) : null,
      dataAsOf: fresh?.toISOString() ?? null,
      dataSource: s.coworkFeedAt && (!fresh || fresh === s.coworkFeedAt) ? "cowork" : s.ownaServiceId && s.ownaSyncedAt ? "owna" : "none",
    };
  });
  return { period, label, from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), rows };
}
