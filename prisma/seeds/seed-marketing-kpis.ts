import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const KPIS = [
  // ── GROWTH ─────────────────────────────────────────────
  { name: "Weekly Attendances", target: 2000, current: 1000, unit: "number", period: "weekly" as const, category: "growth" as const },
  { name: "ASC Total Enrolled", target: 500, current: 210, unit: "number", period: "weekly" as const, category: "growth" as const },
  { name: "BSC Total Enrolled", target: 120, current: 10, unit: "number", period: "weekly" as const, category: "growth" as const },
  { name: "Network Penetration Rate", target: 10, current: 3.2, unit: "percentage", period: "monthly" as const, category: "growth" as const },

  // ── CONVERSION ─────────────────────────────────────────
  { name: "Enquiry-to-Enrolment Rate", target: 65, current: 0, unit: "percentage", period: "monthly" as const, category: "conversion" as const },
  { name: "Average Days to Enrol", target: 14, current: 0, unit: "days", period: "monthly" as const, category: "conversion" as const },
  { name: "CCS Education Rate", target: 90, current: 0, unit: "percentage", period: "monthly" as const, category: "conversion" as const },
  { name: "Form Completion Rate", target: 80, current: 0, unit: "percentage", period: "monthly" as const, category: "conversion" as const },

  // ── ENGAGEMENT ─────────────────────────────────────────
  { name: "Social Engagement Rate", target: 5, current: 0, unit: "percentage", period: "weekly" as const, category: "engagement" as const },
  { name: "Content Posts Published", target: 50, current: 0, unit: "number", period: "weekly" as const, category: "engagement" as const },
  { name: "Centre Coverage Score", target: 100, current: 0, unit: "percentage", period: "weekly" as const, category: "engagement" as const },
  { name: "Parent NPS", target: 70, current: 0, unit: "number", period: "quarterly" as const, category: "engagement" as const },

  // ── RETENTION ──────────────────────────────────────────
  { name: "Casual-to-Regular Conversion", target: 30, current: 0, unit: "percentage", period: "monthly" as const, category: "retention" as const },
  { name: "90-Day Retention Rate", target: 85, current: 0, unit: "percentage", period: "quarterly" as const, category: "retention" as const },
  { name: "Referral Rate", target: 15, current: 0, unit: "percentage", period: "monthly" as const, category: "retention" as const },
];

async function main() {
  console.log("Seeding marketing KPIs...");

  for (const kpi of KPIS) {
    const existing = await prisma.marketingKPI.findFirst({
      where: { name: kpi.name },
    });

    if (existing) {
      await prisma.marketingKPI.update({
        where: { id: existing.id },
        data: {
          target: kpi.target,
          current: kpi.current,
          unit: kpi.unit,
          period: kpi.period,
          category: kpi.category,
        },
      });
      console.log(`  Updated: ${kpi.name}`);
    } else {
      await prisma.marketingKPI.create({ data: kpi });
      console.log(`  Created: ${kpi.name}`);
    }
  }

  console.log(`Done — ${KPIS.length} KPIs seeded.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
