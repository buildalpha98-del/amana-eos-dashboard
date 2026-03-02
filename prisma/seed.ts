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

    // Staff Training & Induction Template
    await prisma.projectTemplate.create({
      data: {
        name: "Staff Training & Induction Program",
        description: "Onboarding checklist for new educators including WWCC, first aid, safeguarding, and centre-specific training.",
        category: "Staffing",
        tasks: {
          create: [
            { title: "Verify Working With Children Check (WWCC)", category: "Compliance", sortOrder: 1, defaultDays: 3 },
            { title: "Complete First Aid & CPR certification", category: "Training", sortOrder: 2, defaultDays: 7 },
            { title: "Complete Child Protection / Safeguarding module", category: "Training", sortOrder: 3, defaultDays: 7 },
            { title: "Review My Time Our Place (MTOP) framework", category: "Training", sortOrder: 4, defaultDays: 10 },
            { title: "Shadow experienced educator for 3 sessions", category: "Induction", sortOrder: 5, defaultDays: 10 },
            { title: "Complete food safety & allergy management training", category: "Training", sortOrder: 6, defaultDays: 10 },
            { title: "Read and sign centre policies and procedures", category: "Compliance", sortOrder: 7, defaultDays: 5 },
            { title: "Set up staff portal login and timesheet access", category: "Admin", sortOrder: 8, defaultDays: 3 },
            { title: "Complete anaphylaxis and asthma management training", category: "Training", sortOrder: 9, defaultDays: 14 },
            { title: "Conduct orientation walkthrough with Centre Coordinator", category: "Induction", sortOrder: 10, defaultDays: 5 },
            { title: "Complete probation review meeting", category: "HR", sortOrder: 11, defaultDays: 45 },
          ],
        },
      },
    });

    // Vacation Care Program Template
    await prisma.projectTemplate.create({
      data: {
        name: "Vacation Care Program Planning",
        description: "End-to-end planning for school holiday vacation care including program design, excursions, staffing, and enrolments.",
        category: "Programs",
        tasks: {
          create: [
            { title: "Set vacation care dates and operating hours", category: "Planning", sortOrder: 1, defaultDays: 3 },
            { title: "Design weekly activity themes and program schedule", category: "Programming", sortOrder: 2, defaultDays: 10 },
            { title: "Research and book excursion venues", category: "Excursions", sortOrder: 3, defaultDays: 14 },
            { title: "Complete risk assessments for all excursions", category: "Compliance", sortOrder: 4, defaultDays: 18 },
            { title: "Arrange bus/transport for excursion days", category: "Logistics", sortOrder: 5, defaultDays: 18 },
            { title: "Design and send vacation care brochure to families", category: "Marketing", sortOrder: 6, defaultDays: 14 },
            { title: "Open enrolments and manage bookings", category: "Admin", sortOrder: 7, defaultDays: 14 },
            { title: "Confirm additional casual staff for holiday period", category: "Staffing", sortOrder: 8, defaultDays: 21 },
            { title: "Order supplies, craft materials, and catering", category: "Logistics", sortOrder: 9, defaultDays: 21 },
            { title: "Prepare sign-in/sign-out sheets and emergency contacts", category: "Admin", sortOrder: 10, defaultDays: 25 },
            { title: "Final program review and staff briefing", category: "Planning", sortOrder: 11, defaultDays: 28 },
            { title: "Post-vacation care family feedback survey", category: "Quality", sortOrder: 12, defaultDays: 49 },
          ],
        },
      },
    });

    // NQS Assessment & Rating Preparation
    await prisma.projectTemplate.create({
      data: {
        name: "Assessment & Rating Preparation",
        description: "Prepare for ACECQA Assessment & Rating visit. Covers all 7 NQS quality areas with evidence collection and self-assessment.",
        category: "Compliance",
        tasks: {
          create: [
            { title: "Conduct NQS self-assessment across all 7 quality areas", category: "Assessment", sortOrder: 1, defaultDays: 14 },
            { title: "Update Quality Improvement Plan (QIP) with current goals", category: "Documentation", sortOrder: 2, defaultDays: 14 },
            { title: "Gather evidence for QA1 - Educational program and practice", category: "Evidence", sortOrder: 3, defaultDays: 21 },
            { title: "Gather evidence for QA2 - Children's health and safety", category: "Evidence", sortOrder: 4, defaultDays: 21 },
            { title: "Gather evidence for QA3 - Physical environment", category: "Evidence", sortOrder: 5, defaultDays: 21 },
            { title: "Gather evidence for QA4 - Staffing arrangements", category: "Evidence", sortOrder: 6, defaultDays: 21 },
            { title: "Gather evidence for QA5 - Relationships with children", category: "Evidence", sortOrder: 7, defaultDays: 21 },
            { title: "Gather evidence for QA6 - Collaborative partnerships", category: "Evidence", sortOrder: 8, defaultDays: 21 },
            { title: "Gather evidence for QA7 - Governance and leadership", category: "Evidence", sortOrder: 9, defaultDays: 21 },
            { title: "Review and update all required policies", category: "Documentation", sortOrder: 10, defaultDays: 28 },
            { title: "Conduct mock assessment walk-through with team", category: "Preparation", sortOrder: 11, defaultDays: 35 },
            { title: "Staff coaching sessions on speaking to assessors", category: "Preparation", sortOrder: 12, defaultDays: 35 },
            { title: "Ensure all displays, documentation, and signage current", category: "Environment", sortOrder: 13, defaultDays: 40 },
            { title: "Final team briefing before A&R visit", category: "Preparation", sortOrder: 14, defaultDays: 42 },
          ],
        },
      },
    });

    // Parent Engagement Initiative
    await prisma.projectTemplate.create({
      data: {
        name: "Parent & Community Engagement Initiative",
        description: "Build stronger relationships with families through events, surveys, and communication improvements.",
        category: "Community",
        tasks: {
          create: [
            { title: "Design and distribute parent satisfaction survey", category: "Feedback", sortOrder: 1, defaultDays: 7 },
            { title: "Analyse survey results and identify improvement areas", category: "Feedback", sortOrder: 2, defaultDays: 14 },
            { title: "Plan family open day / showcase event", category: "Events", sortOrder: 3, defaultDays: 10 },
            { title: "Set up parent communication channel (app/email)", category: "Communication", sortOrder: 4, defaultDays: 7 },
            { title: "Create monthly parent newsletter template", category: "Communication", sortOrder: 5, defaultDays: 10 },
            { title: "Organise cultural celebration event", category: "Events", sortOrder: 6, defaultDays: 21 },
            { title: "Establish parent advisory group", category: "Governance", sortOrder: 7, defaultDays: 21 },
            { title: "Implement daily photo/activity updates for parents", category: "Communication", sortOrder: 8, defaultDays: 14 },
            { title: "Follow-up survey to measure improvement", category: "Feedback", sortOrder: 9, defaultDays: 60 },
          ],
        },
      },
    });

    // Centre Safety & Emergency Preparedness
    await prisma.projectTemplate.create({
      data: {
        name: "Safety & Emergency Preparedness Review",
        description: "Comprehensive safety audit and emergency preparedness review for OSHC centres.",
        category: "Safety",
        tasks: {
          create: [
            { title: "Review and update emergency management plan", category: "Emergency", sortOrder: 1, defaultDays: 7 },
            { title: "Conduct fire evacuation drill and document", category: "Emergency", sortOrder: 2, defaultDays: 10 },
            { title: "Conduct lockdown drill and document", category: "Emergency", sortOrder: 3, defaultDays: 14 },
            { title: "Inspect all fire extinguishers and safety equipment", category: "Equipment", sortOrder: 4, defaultDays: 7 },
            { title: "Review and restock all first aid kits", category: "First Aid", sortOrder: 5, defaultDays: 7 },
            { title: "Update medical action plans for enrolled children", category: "Medical", sortOrder: 6, defaultDays: 10 },
            { title: "Complete workplace hazard inspection", category: "WHS", sortOrder: 7, defaultDays: 14 },
            { title: "Update emergency contact lists for all families", category: "Admin", sortOrder: 8, defaultDays: 10 },
            { title: "Verify all staff first aid certifications are current", category: "Compliance", sortOrder: 9, defaultDays: 7 },
            { title: "Submit safety audit report to management", category: "Reporting", sortOrder: 10, defaultDays: 21 },
          ],
        },
      },
    });

    console.log("Created 8 project templates");
  } else {
    console.log("Project templates already exist, skipping");
  }

  // ============================================================
  // Seed Financial Periods
  // ============================================================
  const existingFinancials = await prisma.financialPeriod.findFirst();
  if (!existingFinancials) {
    const services = await prisma.service.findMany();

    // Define financial parameters per centre (realistic OSHC data)
    const centreFinancialProfiles: Record<string, {
      bscRevenue: [number, number]; // [min, max] per month
      ascRevenue: [number, number];
      vcRevenueHoliday: number; // Holiday month only
      staffCostsPercent: number;
      foodCostsPercent: number;
      suppliesCostsPercent: number;
      rentCostsPercent: number;
      adminCostsPercent: number;
      otherCostsPercent: number;
      bscEnrolments: [number, number];
      ascEnrolments: [number, number];
      bscAttendanceRate: [number, number];
      ascAttendanceRate: [number, number];
    }> = {
      "LKB": { bscRevenue: [4000, 5000], ascRevenue: [16000, 18000], vcRevenueHoliday: 3500, staffCostsPercent: 65, foodCostsPercent: 6.5, suppliesCostsPercent: 3, rentCostsPercent: 10, adminCostsPercent: 4, otherCostsPercent: 1.5, bscEnrolments: [30, 35], ascEnrolments: [50, 55], bscAttendanceRate: [75, 85], ascAttendanceRate: [80, 90] },
      "GRN": { bscRevenue: [3500, 4500], ascRevenue: [13000, 15000], vcRevenueHoliday: 2800, staffCostsPercent: 63, foodCostsPercent: 6, suppliesCostsPercent: 3, rentCostsPercent: 11, adminCostsPercent: 4, otherCostsPercent: 2, bscEnrolments: [25, 32], ascEnrolments: [40, 48], bscAttendanceRate: [70, 80], ascAttendanceRate: [75, 88] },
      "AUB": { bscRevenue: [3800, 4800], ascRevenue: [14000, 16000], vcRevenueHoliday: 3200, staffCostsPercent: 64, foodCostsPercent: 6.5, suppliesCostsPercent: 3, rentCostsPercent: 10, adminCostsPercent: 4, otherCostsPercent: 1.5, bscEnrolments: [28, 34], ascEnrolments: [45, 52], bscAttendanceRate: [72, 82], ascAttendanceRate: [78, 88] },
      "BNK": { bscRevenue: [3500, 4500], ascRevenue: [13000, 15000], vcRevenueHoliday: 3000, staffCostsPercent: 63, foodCostsPercent: 6, suppliesCostsPercent: 3, rentCostsPercent: 11, adminCostsPercent: 4, otherCostsPercent: 2, bscEnrolments: [24, 30], ascEnrolments: [42, 50], bscAttendanceRate: [68, 78], ascAttendanceRate: [75, 87] },
      "PBL": { bscRevenue: [2500, 3500], ascRevenue: [10000, 12000], vcRevenueHoliday: 2200, staffCostsPercent: 60, foodCostsPercent: 6, suppliesCostsPercent: 3, rentCostsPercent: 12, adminCostsPercent: 5, otherCostsPercent: 2, bscEnrolments: [18, 25], ascEnrolments: [32, 42], bscAttendanceRate: [65, 75], ascAttendanceRate: [72, 85] },
      // VIC centres (onboarding, lower numbers)
      "BMD": { bscRevenue: [2000, 3000], ascRevenue: [8000, 10000], vcRevenueHoliday: 1500, staffCostsPercent: 62, foodCostsPercent: 6, suppliesCostsPercent: 3, rentCostsPercent: 11, adminCostsPercent: 5, otherCostsPercent: 2, bscEnrolments: [15, 22], ascEnrolments: [28, 38], bscAttendanceRate: [60, 75], ascAttendanceRate: [70, 85] },
      "COB": { bscRevenue: [2000, 3000], ascRevenue: [8000, 10000], vcRevenueHoliday: 1500, staffCostsPercent: 62, foodCostsPercent: 6, suppliesCostsPercent: 3, rentCostsPercent: 11, adminCostsPercent: 5, otherCostsPercent: 2, bscEnrolments: [16, 23], ascEnrolments: [28, 38], bscAttendanceRate: [60, 75], ascAttendanceRate: [70, 85] },
    };

    const months = [
      { start: new Date("2025-12-01"), end: new Date("2025-12-31"), isHoliday: true },
      { start: new Date("2026-01-01"), end: new Date("2026-01-31"), isHoliday: false },
      { start: new Date("2026-02-01"), end: new Date("2026-02-28"), isHoliday: false },
    ];

    for (const service of services) {
      const profile = centreFinancialProfiles[service.code];
      if (!profile) continue;

      for (const month of months) {
        // Generate random values within ranges
        const bscRev = Math.random() * (profile.bscRevenue[1] - profile.bscRevenue[0]) + profile.bscRevenue[0];
        const ascRev = Math.random() * (profile.ascRevenue[1] - profile.ascRevenue[0]) + profile.ascRevenue[0];
        const vcRev = month.isHoliday ? profile.vcRevenueHoliday : 0;
        const totalRev = bscRev + ascRev + vcRev;

        const staffCosts = totalRev * (profile.staffCostsPercent / 100);
        const foodCosts = totalRev * (profile.foodCostsPercent / 100);
        const suppliesCosts = totalRev * (profile.suppliesCostsPercent / 100);
        const rentCosts = totalRev * (profile.rentCostsPercent / 100);
        const adminCosts = totalRev * (profile.adminCostsPercent / 100);
        const otherCosts = totalRev * (profile.otherCostsPercent / 100);
        const totalCosts = staffCosts + foodCosts + suppliesCosts + rentCosts + adminCosts + otherCosts;

        const bscEnrol = Math.floor(Math.random() * (profile.bscEnrolments[1] - profile.bscEnrolments[0]) + profile.bscEnrolments[0]);
        const ascEnrol = Math.floor(Math.random() * (profile.ascEnrolments[1] - profile.ascEnrolments[0]) + profile.ascEnrolments[0]);
        const bscAtt = Math.floor(bscEnrol * (Math.random() * (profile.bscAttendanceRate[1] - profile.bscAttendanceRate[0]) + profile.bscAttendanceRate[0]) / 100);
        const ascAtt = Math.floor(ascEnrol * (Math.random() * (profile.ascAttendanceRate[1] - profile.ascAttendanceRate[0]) + profile.ascAttendanceRate[0]) / 100);

        await prisma.financialPeriod.create({
          data: {
            serviceId: service.id,
            periodType: "monthly",
            periodStart: month.start,
            periodEnd: month.end,
            bscRevenue: parseFloat(bscRev.toFixed(2)),
            ascRevenue: parseFloat(ascRev.toFixed(2)),
            vcRevenue: vcRev,
            otherRevenue: 0,
            totalRevenue: parseFloat(totalRev.toFixed(2)),
            staffCosts: parseFloat(staffCosts.toFixed(2)),
            foodCosts: parseFloat(foodCosts.toFixed(2)),
            suppliesCosts: parseFloat(suppliesCosts.toFixed(2)),
            rentCosts: parseFloat(rentCosts.toFixed(2)),
            adminCosts: parseFloat(adminCosts.toFixed(2)),
            otherCosts: parseFloat(otherCosts.toFixed(2)),
            totalCosts: parseFloat(totalCosts.toFixed(2)),
            grossProfit: parseFloat((totalRev - totalCosts).toFixed(2)),
            margin: parseFloat(((totalRev - totalCosts) / totalRev * 100).toFixed(2)),
            bscEnrolments: bscEnrol,
            ascEnrolments: ascEnrol,
            bscAttendance: bscAtt,
            ascAttendance: ascAtt,
            vcAttendance: month.isHoliday ? Math.floor(ascEnrol * 0.3) : 0,
          },
        });
      }
    }

    console.log("Created financial periods for all centres (3 months)");
  } else {
    console.log("Financial periods already exist, skipping");
  }

  // ============================================================
  // Seed Centre Metrics
  // ============================================================
  const existingMetrics = await prisma.centreMetrics.findFirst();
  if (!existingMetrics) {
    const services = await prisma.service.findMany();

    // Define metrics profiles per centre
    const centreMetricsProfiles: Record<string, {
      bscCapacity: number;
      ascCapacity: number;
      bscOccupancy: [number, number];
      ascOccupancy: [number, number];
      totalEducators: number;
      educatorTurnover: [number, number];
      ratioCompliance: [number, number];
      parentNps: [number, number] | null;
      incidentCount: [number, number];
      complaintCount: [number, number];
      wwccCompliance: number;
      firstAidCompliance: [number, number];
      overallCompliance: [number, number];
      nqsRating: string | null;
    }> = {
      "LKB": { bscCapacity: 35, ascCapacity: 55, bscOccupancy: [75, 85], ascOccupancy: [80, 90], totalEducators: 7, educatorTurnover: [5, 12], ratioCompliance: [98, 100], parentNps: [65, 75], incidentCount: [1, 2], complaintCount: [0, 1], wwccCompliance: 100, firstAidCompliance: [95, 100], overallCompliance: [95, 100], nqsRating: "Exceeding" },
      "GRN": { bscCapacity: 30, ascCapacity: 48, bscOccupancy: [72, 82], ascOccupancy: [78, 88], totalEducators: 6, educatorTurnover: [8, 15], ratioCompliance: [97, 100], parentNps: [60, 72], incidentCount: [1, 3], complaintCount: [0, 1], wwccCompliance: 100, firstAidCompliance: [93, 100], overallCompliance: [94, 100], nqsRating: "Meeting" },
      "AUB": { bscCapacity: 34, ascCapacity: 52, bscOccupancy: [74, 84], ascOccupancy: [79, 89], totalEducators: 6, educatorTurnover: [6, 13], ratioCompliance: [97, 100], parentNps: [62, 73], incidentCount: [0, 2], complaintCount: [0, 1], wwccCompliance: 100, firstAidCompliance: [94, 100], overallCompliance: [95, 100], nqsRating: "Exceeding" },
      "BNK": { bscCapacity: 30, ascCapacity: 50, bscOccupancy: [70, 80], ascOccupancy: [75, 87], totalEducators: 6, educatorTurnover: [10, 18], ratioCompliance: [96, 100], parentNps: [55, 68], incidentCount: [1, 3], complaintCount: [0, 2], wwccCompliance: 100, firstAidCompliance: [90, 100], overallCompliance: [93, 100], nqsRating: "Meeting" },
      "PBL": { bscCapacity: 25, ascCapacity: 42, bscOccupancy: [65, 78], ascOccupancy: [70, 85], totalEducators: 5, educatorTurnover: [8, 16], ratioCompliance: [95, 100], parentNps: [50, 65], incidentCount: [0, 2], complaintCount: [0, 1], wwccCompliance: 100, firstAidCompliance: [90, 98], overallCompliance: [92, 99], nqsRating: "Meeting" },
      // VIC centres (onboarding)
      "BMD": { bscCapacity: 30, ascCapacity: 50, bscOccupancy: [45, 65], ascOccupancy: [55, 75], totalEducators: 4, educatorTurnover: [10, 20], ratioCompliance: [95, 100], parentNps: null, incidentCount: [0, 1], complaintCount: [0, 1], wwccCompliance: 100, firstAidCompliance: [90, 100], overallCompliance: [90, 100], nqsRating: null },
      "COB": { bscCapacity: 28, ascCapacity: 45, bscOccupancy: [50, 68], ascOccupancy: [58, 76], totalEducators: 4, educatorTurnover: [12, 20], ratioCompliance: [95, 100], parentNps: null, incidentCount: [0, 1], complaintCount: [0, 1], wwccCompliance: 100, firstAidCompliance: [90, 100], overallCompliance: [90, 100], nqsRating: null },
    };

    for (const service of services) {
      const profile = centreMetricsProfiles[service.code];
      if (!profile) continue;

      const bscOcc = Math.random() * (profile.bscOccupancy[1] - profile.bscOccupancy[0]) + profile.bscOccupancy[0];
      const ascOcc = Math.random() * (profile.ascOccupancy[1] - profile.ascOccupancy[0]) + profile.ascOccupancy[0];
      const turnover = Math.random() * (profile.educatorTurnover[1] - profile.educatorTurnover[0]) + profile.educatorTurnover[0];
      const ratioCom = Math.random() * (profile.ratioCompliance[1] - profile.ratioCompliance[0]) + profile.ratioCompliance[0];
      const firstAidCom = Math.random() * (profile.firstAidCompliance[1] - profile.firstAidCompliance[0]) + profile.firstAidCompliance[0];
      const overallCom = Math.random() * (profile.overallCompliance[1] - profile.overallCompliance[0]) + profile.overallCompliance[0];
      const nps = profile.parentNps ? Math.random() * (profile.parentNps[1] - profile.parentNps[0]) + profile.parentNps[0] : null;
      const incidents = Math.floor(Math.random() * (profile.incidentCount[1] - profile.incidentCount[0] + 1)) + profile.incidentCount[0];
      const complaints = Math.floor(Math.random() * (profile.complaintCount[1] - profile.complaintCount[0] + 1)) + profile.complaintCount[0];

      await prisma.centreMetrics.create({
        data: {
          serviceId: service.id,
          recordedAt: new Date("2026-02-28"),
          bscCapacity: profile.bscCapacity,
          ascCapacity: profile.ascCapacity,
          bscOccupancy: parseFloat(bscOcc.toFixed(2)),
          ascOccupancy: parseFloat(ascOcc.toFixed(2)),
          totalEducators: profile.totalEducators,
          educatorsTurnover: parseFloat(turnover.toFixed(2)),
          ratioCompliance: parseFloat(ratioCom.toFixed(2)),
          parentNps: nps ? parseFloat(nps.toFixed(1)) : null,
          incidentCount: incidents,
          complaintCount: complaints,
          wwccCompliance: profile.wwccCompliance,
          firstAidCompliance: parseFloat(firstAidCom.toFixed(2)),
          overallCompliance: parseFloat(overallCom.toFixed(2)),
          nqsRating: profile.nqsRating,
        },
      });
    }

    console.log("Created centre metrics for all services");
  } else {
    console.log("Centre metrics already exist, skipping");
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
