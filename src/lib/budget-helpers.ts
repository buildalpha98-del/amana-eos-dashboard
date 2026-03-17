import { prisma } from "@/lib/prisma";

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
 * Priority: per-service override > org-wide tier matching > fallback $150.
 */
export async function getMonthlyBudget(serviceId: string): Promise<{
  amount: number;
  source: "override" | "tier";
  tierLabel?: string;
}> {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { monthlyPurchaseBudget: true },
  });

  // Per-service override takes precedence
  if (service?.monthlyPurchaseBudget != null) {
    return { amount: service.monthlyPurchaseBudget, source: "override" };
  }

  // Load org-wide tiers
  const orgSettings = await prisma.orgSettings.findUnique({
    where: { id: "singleton" },
    select: { purchaseBudgetTiers: true },
  });

  const tiers = (orgSettings?.purchaseBudgetTiers as BudgetTier[] | null) || [
    { minWeeklyChildren: 100, monthlyBudget: 300 },
    { minWeeklyChildren: 0, monthlyBudget: 150 },
  ];

  // Calculate average weekly attendance over last 4 complete weeks
  const fourWeeksAgo = new Date(Date.now() - 28 * 86400000);
  const attendanceResult = await prisma.dailyAttendance.aggregate({
    where: {
      serviceId,
      date: { gte: fourWeeksAgo },
    },
    _sum: { attended: true },
  });

  const totalAttended = attendanceResult._sum.attended || 0;
  const avgWeeklyAttendance = totalAttended / 4;

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

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
