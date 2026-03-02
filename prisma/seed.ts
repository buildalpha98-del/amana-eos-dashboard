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

  // ============================================================
  // Seed Sample Services (OSHC Centres)
  // ============================================================
  const existingServices = await prisma.service.findFirst();
  if (!existingServices) {
    const centres = [
      {
        name: "Amana OSHC Lakemba",
        code: "LKB",
        address: "63 Wangee Rd",
        suburb: "Lakemba",
        state: "NSW",
        postcode: "2195",
        phone: "02 9740 1234",
        email: "lakemba@amanaoshc.com.au",
        status: "active" as const,
        capacity: 60,
        operatingDays: "Mon-Fri",
      },
      {
        name: "Amana OSHC Greenacre",
        code: "GRN",
        address: "15 Boronia Rd",
        suburb: "Greenacre",
        state: "NSW",
        postcode: "2190",
        phone: "02 9740 5678",
        email: "greenacre@amanaoshc.com.au",
        status: "active" as const,
        capacity: 45,
        operatingDays: "Mon-Fri",
      },
      {
        name: "Amana OSHC Auburn",
        code: "AUB",
        address: "22 Queen St",
        suburb: "Auburn",
        state: "NSW",
        postcode: "2144",
        phone: "02 9740 9012",
        email: "auburn@amanaoshc.com.au",
        status: "active" as const,
        capacity: 55,
        operatingDays: "Mon-Fri",
      },
      {
        name: "Amana OSHC Bankstown",
        code: "BNK",
        address: "10 Chapel Rd",
        suburb: "Bankstown",
        state: "NSW",
        postcode: "2200",
        phone: "02 9740 3456",
        email: "bankstown@amanaoshc.com.au",
        status: "active" as const,
        capacity: 50,
        operatingDays: "Mon-Fri",
      },
      {
        name: "Amana OSHC Punchbowl",
        code: "PBL",
        address: "98 The Boulevarde",
        suburb: "Punchbowl",
        state: "NSW",
        postcode: "2196",
        phone: "02 9740 7890",
        email: "punchbowl@amanaoshc.com.au",
        status: "active" as const,
        capacity: 40,
        operatingDays: "Mon-Fri",
      },
      {
        name: "Amana OSHC Broadmeadows",
        code: "BMD",
        address: "5 Pascoe Vale Rd",
        suburb: "Broadmeadows",
        state: "VIC",
        postcode: "3047",
        email: "broadmeadows@amanaoshc.com.au",
        status: "onboarding" as const,
        capacity: 50,
        operatingDays: "Mon-Fri",
      },
      {
        name: "Amana OSHC Coburg",
        code: "COB",
        address: "12 Sydney Rd",
        suburb: "Coburg",
        state: "VIC",
        postcode: "3058",
        email: "coburg@amanaoshc.com.au",
        status: "onboarding" as const,
        capacity: 45,
        operatingDays: "Mon-Fri",
      },
    ];

    for (const centre of centres) {
      await prisma.service.create({
        data: {
          ...centre,
          managerId: admin.id,
        },
      });
    }
    console.log(`Created ${centres.length} service centres`);
  } else {
    console.log("Services already exist, skipping");
  }

  // ============================================================
  // Seed Project Templates
  // ============================================================
  const existingTemplates = await prisma.projectTemplate.findFirst();
  if (!existingTemplates) {
    // New Centre Opening Template
    await prisma.projectTemplate.create({
      data: {
        name: "New Centre Opening",
        description: "Complete checklist for launching a new OSHC centre at a school site. Covers compliance, staffing, setup, and marketing.",
        category: "Operations",
        tasks: {
          create: [
            { title: "Sign LOI with school principal", category: "Legal", sortOrder: 1, defaultDays: 7 },
            { title: "Complete site risk assessment", category: "Compliance", sortOrder: 2, defaultDays: 14 },
            { title: "Submit service approval application to state authority", category: "Compliance", sortOrder: 3, defaultDays: 14 },
            { title: "Set up centre in CCS (Child Care Subsidy) system", category: "Compliance", sortOrder: 4, defaultDays: 21 },
            { title: "Recruit and hire Centre Coordinator", category: "Staffing", sortOrder: 5, defaultDays: 21 },
            { title: "Recruit and hire 2 Educators", category: "Staffing", sortOrder: 6, defaultDays: 28 },
            { title: "Complete Working With Children checks for all staff", category: "Staffing", sortOrder: 7, defaultDays: 28 },
            { title: "Order furniture, equipment, and resources", category: "Setup", sortOrder: 8, defaultDays: 21 },
            { title: "Set up storage and kitchen area", category: "Setup", sortOrder: 9, defaultDays: 28 },
            { title: "Install signage and branding", category: "Setup", sortOrder: 10, defaultDays: 30 },
            { title: "Create QIP (Quality Improvement Plan)", category: "Compliance", sortOrder: 11, defaultDays: 30 },
            { title: "Set up enrolment system and parent portal", category: "Admin", sortOrder: 12, defaultDays: 14 },
            { title: "Distribute flyers and info packs to school families", category: "Marketing", sortOrder: 13, defaultDays: 14 },
            { title: "Host parent information evening", category: "Marketing", sortOrder: 14, defaultDays: 35 },
            { title: "Process initial enrolments (target: 20+)", category: "Admin", sortOrder: 15, defaultDays: 42 },
            { title: "Finalise rosters and shifts", category: "Staffing", sortOrder: 16, defaultDays: 40 },
            { title: "Conduct trial run / soft opening", category: "Operations", sortOrder: 17, defaultDays: 45 },
            { title: "Official opening day", category: "Operations", sortOrder: 18, defaultDays: 49 },
          ],
        },
      },
    });

    // Compliance Audit Template
    await prisma.projectTemplate.create({
      data: {
        name: "Annual Compliance Audit",
        description: "Annual NQS (National Quality Standard) self-assessment and compliance review for an existing centre.",
        category: "Compliance",
        tasks: {
          create: [
            { title: "Review and update policies and procedures", category: "Documentation", sortOrder: 1, defaultDays: 7 },
            { title: "Conduct staff-to-child ratio audit", category: "Staffing", sortOrder: 2, defaultDays: 7 },
            { title: "Review all staff qualifications and certifications", category: "Staffing", sortOrder: 3, defaultDays: 10 },
            { title: "Update emergency evacuation plan and conduct drill", category: "Safety", sortOrder: 4, defaultDays: 14 },
            { title: "Inspect all first aid kits and medications", category: "Safety", sortOrder: 5, defaultDays: 7 },
            { title: "Review incident/accident register", category: "Documentation", sortOrder: 6, defaultDays: 10 },
            { title: "NQS self-assessment across all 7 quality areas", category: "Quality", sortOrder: 7, defaultDays: 21 },
            { title: "Update Quality Improvement Plan (QIP)", category: "Quality", sortOrder: 8, defaultDays: 28 },
            { title: "Parent survey and feedback review", category: "Quality", sortOrder: 9, defaultDays: 21 },
            { title: "Submit compliance report to management", category: "Documentation", sortOrder: 10, defaultDays: 30 },
          ],
        },
      },
    });

    // Marketing Campaign Template
    await prisma.projectTemplate.create({
      data: {
        name: "Term Marketing Campaign",
        description: "Quarterly marketing campaign to boost enrolments and community engagement.",
        category: "Marketing",
        tasks: {
          create: [
            { title: "Define campaign goals and target numbers", category: "Strategy", sortOrder: 1, defaultDays: 3 },
            { title: "Design social media content calendar", category: "Content", sortOrder: 2, defaultDays: 7 },
            { title: "Create flyers and posters for school distribution", category: "Content", sortOrder: 3, defaultDays: 10 },
            { title: "Update website with current term info", category: "Digital", sortOrder: 4, defaultDays: 7 },
            { title: "Schedule community open day", category: "Events", sortOrder: 5, defaultDays: 14 },
            { title: "Run social media ads campaign", category: "Digital", sortOrder: 6, defaultDays: 14 },
            { title: "Collect and share parent testimonials", category: "Content", sortOrder: 7, defaultDays: 21 },
            { title: "Review campaign results and adjust", category: "Strategy", sortOrder: 8, defaultDays: 28 },
          ],
        },
      },
    });

    console.log("Created 3 project templates");
  } else {
    console.log("Project templates already exist, skipping");
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
