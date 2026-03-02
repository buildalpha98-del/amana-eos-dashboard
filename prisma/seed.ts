import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Create admin/owner user
  const adminEmail = process.env.ADMIN_EMAIL || "admin@amanaoshc.com.au";
  const adminPassword = process.env.ADMIN_PASSWORD || "ChangeMe123!";
  const passwordHash = await hash(adminPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: "Amana Admin",
      email: adminEmail,
      passwordHash,
      role: "owner",
    },
  });
  console.log(`Owner ready: ${admin.email}`);

  // Only seed V/TO if none exists
  const existingVTO = await prisma.visionTractionOrganiser.findFirst();
  if (!existingVTO) {
    const vto = await prisma.visionTractionOrganiser.create({
      data: {
        coreValues: [
          "Safety & Wellbeing First",
          "Inclusive Community",
          "Growth Through Play",
          "Family Partnership",
          "Excellence & Continuous Improvement",
        ],
        corePurpose:
          "Nurturing confident, capable children through quality out of school hours care",
        coreNiche:
          "Faith-aligned, inclusive OSHC services for school communities across Australia",
        tenYearTarget:
          "Be the most trusted OSHC provider in Australia with 200+ centres, known for child-led, culturally safe programs.",
        threeYearPicture:
          "50 centres nationally across NSW and VIC, $30M valuation, strong brand recognition, integrated Build Alpha Kids sports programs and Amana Education tutoring in every centre.",
        marketingStrategy:
          "School community partnerships, word-of-mouth referrals, digital marketing, community events, and strategic alliances with faith-based schools.",
        updatedById: admin.id,
      },
    });

    await prisma.oneYearGoal.create({
      data: {
        title: "Expand to 20 centres across NSW and VIC",
        description:
          "Secure partnerships with new schools and launch operations at 5 new sites by end of year.",
        targetDate: new Date("2026-12-31"),
        status: "on_track",
        vtoId: vto.id,
      },
    });

    await prisma.oneYearGoal.create({
      data: {
        title: "Achieve 95% parent satisfaction rating",
        description:
          "Implement quality improvement programs and regular parent feedback mechanisms.",
        targetDate: new Date("2026-12-31"),
        status: "on_track",
        vtoId: vto.id,
      },
    });

    console.log("Created V/TO with goals");
  } else {
    console.log("V/TO already exists, skipping");
  }

  // Only seed scorecard if none exists
  const existingScorecard = await prisma.scorecard.findFirst();
  if (!existingScorecard) {
    const scorecard = await prisma.scorecard.create({
      data: { title: "Weekly Leadership Scorecard" },
    });

    const measurables = [
      { title: "Total ASC enrolments (all centres)", goalValue: 800, goalDirection: "above" as const, unit: "count" },
      { title: "BSC attendance rate", goalValue: 70, goalDirection: "above" as const, unit: "%" },
      { title: "Weekly revenue", goalValue: 45000, goalDirection: "above" as const, unit: "$" },
      { title: "Staff-to-child ratio compliance", goalValue: 100, goalDirection: "exact" as const, unit: "%" },
      { title: "Parent NPS score", goalValue: 60, goalDirection: "above" as const, unit: "score" },
      { title: "New centre pipeline (LOIs signed)", goalValue: 2, goalDirection: "above" as const, unit: "count" },
      { title: "Educator retention rate", goalValue: 90, goalDirection: "above" as const, unit: "%" },
    ];

    for (const m of measurables) {
      await prisma.measurable.create({
        data: {
          ...m,
          ownerId: admin.id,
          scorecardId: scorecard.id,
          frequency: "weekly",
        },
      });
    }
    console.log("Created Scorecard with measurables");
  } else {
    console.log("Scorecard already exists, skipping");
  }

  console.log("\nSeed complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
