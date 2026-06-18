import { prisma } from "@/lib/prisma";
import { getWeekStart } from "@/lib/utils";

/**
 * Recalculate FinancialPeriod.suppliesCosts for a given service + week.
 * Called after any BudgetItem create/update/delete.
 * All BudgetItem purchases (including groceries category) go to suppliesCosts.
 * foodCosts remains owned by the attendance-to-financials weekly cron.
 */
export async function recalcFinancialsForWeek(serviceId: string, weekStartDate: Date) {
  // Normalise to Monday 00:00
  const weekStart = getWeekStart(weekStartDate);
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);

  // Aggregate all BudgetItems for this service in this week
  const result = await prisma.budgetItem.aggregate({
    where: {
      serviceId,
      date: { gte: weekStart, lt: weekEnd },
    },
    _sum: { amount: true },
  });

  const totalSpend = result._sum.amount || 0;

  // Upsert the FinancialPeriod for this week
  await prisma.financialPeriod.upsert({
    where: {
      serviceId_periodType_periodStart: {
        serviceId,
        periodType: "weekly",
        periodStart: weekStart,
      },
    },
    update: {
      suppliesCosts: totalSpend,
    },
    create: {
      serviceId,
      periodType: "weekly",
      periodStart: weekStart,
      periodEnd: weekEnd,
      suppliesCosts: totalSpend,
    },
  });
}

interface BudgetTier {
  minWeeklyChildren: number;
  monthlyBudget: number;
}

/**
 * Resolve the monthly centre purchase budget for a service.
 *
 * 2026-06-15: Per-service overrides removed. The director's rule is
 * firm — under 100 combined weekly attendances → $150/month;
 * 100+ → $300/month. Allowing manual overrides drifted in practice
 * (one centre had $300 locked in despite 43 weekly attendances).
 * Tier-only keeps the rule self-correcting as attendance moves.
 */
export async function getMonthlyBudget(serviceId: string): Promise<{
  amount: number;
  source: "override" | "tier";
  tierLabel?: string;
}> {
  // Load org-wide tiers
  const orgSettings = await prisma.orgSettings.findUnique({
    where: { id: "singleton" },
    select: { purchaseBudgetTiers: true },
  });

  const tiers = (orgSettings?.purchaseBudgetTiers as BudgetTier[] | null) || [
    { minWeeklyChildren: 100, monthlyBudget: 300 },
    { minWeeklyChildren: 0, monthlyBudget: 150 },
  ];

  // 2026-06-17: tier is now driven by the CURRENT WEEK's combined
  // bookings, not a 4-week average. Daniel saw AIA Coburg sitting at
  // the $300 tier despite only 57 weekly attendances because the
  // average had history from busier weeks. Current-week is also what
  // staff naturally compare against ("we have 57 kids this week →
  // shouldn't that be the $150 tier?").
  //
  // Recomputes automatically each Monday — the date window slides
  // forward when the calendar week rolls over, so the next query
  // after midnight Monday picks up the new week's data.
  const now = new Date();
  const dow = now.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + mondayOffset);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const attendanceResult = await prisma.dailyAttendance.aggregate({
    where: {
      serviceId,
      date: { gte: weekStart, lt: weekEnd },
    },
    _sum: { enrolled: true, attended: true },
  });

  // enrolled = permanent bookings, attended = casual bookings — sum
  // both because the tier rule is "combined weekly attendances".
  const avgWeeklyAttendance =
    (attendanceResult._sum.enrolled || 0) +
    (attendanceResult._sum.attended || 0);

  // Match tier (sorted descending by minWeeklyChildren)
  const sortedTiers = [...tiers].sort((a, b) => b.minWeeklyChildren - a.minWeeklyChildren);
  for (const tier of sortedTiers) {
    if (avgWeeklyAttendance >= tier.minWeeklyChildren) {
      return {
        amount: tier.monthlyBudget,
        source: "tier",
        tierLabel: `${tier.minWeeklyChildren}+ children — $${tier.monthlyBudget}/mo`,
      };
    }
  }

  // Fallback — use the lowest tier (last in sorted array)
  const fallback = sortedTiers[sortedTiers.length - 1];
  const fallbackAmount = fallback?.monthlyBudget ?? 150;
  return {
    amount: fallbackAmount,
    source: "tier" as const,
    tierLabel: `$${fallbackAmount}/mo (base tier)`,
  };
}

