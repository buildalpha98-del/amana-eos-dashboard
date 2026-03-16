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

  // ── Core Staff Users ──────────────────────────────────────────
  const staffUsers = [
    { name: "Jayden Kowaider", email: "jayden@amanaoshc.com.au", role: "owner" as const, state: null },
    { name: "Daniel", email: "daniel@amanaoshc.com.au", role: "admin" as const, state: null },
    { name: "Akram", email: "akram@amanaoshc.com.au", role: "marketing" as const, state: null },
    { name: "Mirna", email: "mirna@amanaoshc.com.au", role: "coordinator" as const, state: "NSW" },
    { name: "Tracie", email: "tracie@amanaoshc.com.au", role: "coordinator" as const, state: "VIC" },
  ];

  for (const staff of staffUsers) {
    const user = await prisma.user.upsert({
      where: { email: staff.email },
      update: { role: staff.role, state: staff.state },
      create: {
        name: staff.name,
        email: staff.email,
        passwordHash,
        role: staff.role,
        state: staff.state,
      },
    });
    console.log(`Staff ready: ${user.email} (${user.role})`);
  }

  // V/TO — delete + replace
  await prisma.oneYearGoal.deleteMany();
  await prisma.visionTractionOrganiser.deleteMany();
  const vto = await prisma.visionTractionOrganiser.create({
      data: {
        coreValues: [
          "Faith & Character",
          "Safety & Care",
          "Growth & Learning",
          "Health & Wellbeing",
          "Community & Belonging",
        ],
        corePurpose:
          "Our mission is to create a safe, nurturing environment where children are actively engaged in quality learning and play.",
        coreNiche:
          "Faith-aligned, inclusive OSHC services for school communities across Australia, rooted in Islamic values",
        tenYearTarget:
          "Be the world's most inspiring afterschool experience — where every child discovers hidden strengths, builds confidence, and grows into who they're meant to be in a safe, creative, and nurturing space.",
        threeYearPicture:
          "50 centres nationally across NSW, VIC, and additional states, $30M valuation, strong brand recognition with Build Alpha Kids sports programs and Amana Education tutoring integrated at every centre, outstanding NQS ratings across the network.",
        marketingStrategy:
          "School community partnerships, word-of-mouth referrals, digital marketing via Instagram and Facebook, community events, strategic alliances with faith-based schools, and the OWNA parent app for engagement.",
        updatedById: admin.id,
      },
    });

    await prisma.oneYearGoal.create({
      data: {
        title: "Expand to 15 centres across NSW and VIC",
        description:
          "Secure partnerships with new schools including Minaret College sites and launch operations.",
        targetDate: new Date("2026-12-31"),
        status: "on_track",
        vtoId: vto.id,
      },
    });

    await prisma.oneYearGoal.create({
      data: {
        title: "Achieve 95% parent satisfaction (NPS > 65)",
        description:
          "Implement quality improvement programs, regular parent surveys, and strengthen communication via the OWNA app.",
        targetDate: new Date("2026-12-31"),
        status: "on_track",
        vtoId: vto.id,
      },
    });

    await prisma.oneYearGoal.create({
      data: {
        title: "Launch Holiday Quest vacation care at all active centres",
        description:
          "Design and roll out branded vacation care program across all active NSW and VIC centres.",
        targetDate: new Date("2026-06-30"),
        status: "on_track",
        vtoId: vto.id,
      },
    });

  console.log("Replaced V/TO with goals");

  // Scorecard — delete + replace
  await prisma.measurableEntry.deleteMany();
  await prisma.measurable.deleteMany();
  await prisma.scorecard.deleteMany();
  const scorecard = await prisma.scorecard.create({
      data: { title: "Weekly Leadership Scorecard" },
    });

    const measurables = [
      { title: "Total ASC enrolments (all centres)", goalValue: 550, goalDirection: "above" as const, unit: "count" },
      { title: "BSC attendance rate", goalValue: 75, goalDirection: "above" as const, unit: "%" },
      { title: "Weekly revenue (all centres)", goalValue: 35000, goalDirection: "above" as const, unit: "$" },
      { title: "Staff-to-child ratio compliance", goalValue: 100, goalDirection: "exact" as const, unit: "%" },
      { title: "Parent NPS score", goalValue: 65, goalDirection: "above" as const, unit: "score" },
      { title: "New centre pipeline (LOIs signed)", goalValue: 2, goalDirection: "above" as const, unit: "count" },
      { title: "Educator retention rate (quarterly)", goalValue: 90, goalDirection: "above" as const, unit: "%" },
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
  console.log("Replaced Scorecard with measurables");

  // ============================================================
  // Seed Sample Services (OSHC Centres)
  // ============================================================
  // Services — upsert by code (preserves IDs + foreign key references)
  const centres = [
      // ── NSW Active Centres ──────────────────────────────────
      {
        name: "Amana OSHC MFIS Beaumont Hills",
        code: "MFIS-BH",
        address: "20 Mungerie Rd",
        suburb: "Beaumont Hills",
        state: "NSW",
        postcode: "2155",
        phone: "1300 200 262",
        email: "beaumonthills@amanaoshc.com.au",
        status: "active" as const,
        capacity: 60,
        operatingDays: "Mon-Fri",
      },
      {
        name: "Amana OSHC MFIS Greenacre",
        code: "MFIS-GA",
        address: "405 Waterloo Rd",
        suburb: "Greenacre",
        state: "NSW",
        postcode: "2190",
        phone: "1300 200 262",
        email: "greenacre@amanaoshc.com.au",
        status: "active" as const,
        capacity: 50,
        operatingDays: "Mon-Fri",
      },
      {
        name: "Amana OSHC MFIS Hoxton Park",
        code: "MFIS-HP",
        address: "210 Pacific Palms Cct",
        suburb: "Hoxton Park",
        state: "NSW",
        postcode: "2171",
        phone: "1300 200 262",
        email: "hoxtonpark@amanaoshc.com.au",
        status: "active" as const,
        capacity: 55,
        operatingDays: "Mon-Fri",
      },
      {
        name: "Amana OSHC Unity Grammar",
        code: "UG",
        address: "70 Fourth Ave",
        suburb: "Austral",
        state: "NSW",
        postcode: "2179",
        phone: "1300 200 262",
        email: "unitygrammar@amanaoshc.com.au",
        status: "active" as const,
        capacity: 45,
        operatingDays: "Mon-Fri",
      },
      {
        name: "Amana OSHC Arkana College",
        code: "ARK",
        address: "346 Stoney Creek Rd",
        suburb: "Kingsgrove",
        state: "NSW",
        postcode: "2208",
        phone: "1300 200 262",
        email: "arkana@amanaoshc.com.au",
        status: "active" as const,
        capacity: 40,
        operatingDays: "Mon-Fri",
      },
      {
        name: "Amana OSHC Minarah College",
        code: "MNC",
        address: "264 Wilson Rd",
        suburb: "Green Valley",
        state: "NSW",
        postcode: "2168",
        phone: "1300 200 262",
        email: "minarah@amanaoshc.com.au",
        status: "active" as const,
        capacity: 50,
        operatingDays: "Mon-Fri",
      },
      // ── VIC Active Centres ──────────────────────────────────
      {
        name: "Amana OSHC Al-Taqwa College",
        code: "ATC",
        address: "201 Sayers Rd",
        suburb: "Truganina",
        state: "VIC",
        postcode: "3029",
        phone: "1300 200 262",
        email: "altaqwa@amanaoshc.com.au",
        status: "active" as const,
        capacity: 60,
        operatingDays: "Mon-Fri",
      },
      {
        name: "Amana OSHC AIA Coburg",
        code: "AIA-COB",
        address: "653 Sydney Rd",
        suburb: "Coburg",
        state: "VIC",
        postcode: "3058",
        phone: "1300 200 262",
        email: "aiacoburg@amanaoshc.com.au",
        status: "active" as const,
        capacity: 50,
        operatingDays: "Mon-Fri",
      },
      {
        name: "Amana OSHC Minaret Doveton",
        code: "MIN-DOV",
        address: "146 Kidds Rd",
        suburb: "Doveton",
        state: "VIC",
        postcode: "3177",
        phone: "1300 200 262",
        email: "minaretdoveton@amanaoshc.com.au",
        status: "active" as const,
        capacity: 40,
        operatingDays: "Mon-Fri",
      },
      {
        name: "Amana OSHC Minaret Officer",
        code: "MIN-OFF",
        address: "67 Tivendale Rd",
        suburb: "Officer",
        state: "VIC",
        postcode: "3809",
        phone: "1300 200 262",
        email: "minaretofficer@amanaoshc.com.au",
        status: "active" as const,
        capacity: 45,
        operatingDays: "Mon-Fri",
      },
      {
        name: "Amana OSHC Minaret Springvale",
        code: "MIN-SPR",
        address: "36-38 Lewis St",
        suburb: "Springvale",
        state: "VIC",
        postcode: "3171",
        phone: "1300 200 262",
        email: "minaretspringvale@amanaoshc.com.au",
        status: "active" as const,
        capacity: 45,
        operatingDays: "Mon-Fri",
      },
    ];

  for (const centre of centres) {
    await prisma.service.upsert({
      where: { code: centre.code },
      update: { ...centre, managerId: admin.id },
      create: { ...centre, managerId: admin.id },
    });
  }
  console.log(`Upserted ${centres.length} service centres`);

  // ============================================================
  // Seed Project Templates
  // ============================================================
  // Project Templates — delete + replace
  await prisma.projectTemplateTask.deleteMany();
  await prisma.projectTemplate.deleteMany();

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

    // School Sales Cycle
    await prisma.projectTemplate.create({
      data: {
        name: "School Sales Cycle",
        description: "End-to-end sales pipeline for pitching OSHC services to a new school partner.",
        category: "Growth",
        tasks: {
          create: [
            { title: "Research school demographics and current OSHC provider", category: "Research", sortOrder: 1, defaultDays: 7 },
            { title: "Prepare tailored pitch deck for the school", category: "Preparation", sortOrder: 2, defaultDays: 10 },
            { title: "Make initial contact with school principal / board", category: "Outreach", sortOrder: 3, defaultDays: 5 },
            { title: "Schedule and conduct site visit at the school", category: "Meeting", sortOrder: 4, defaultDays: 14 },
            { title: "Present OSHC service proposal to school leadership", category: "Meeting", sortOrder: 5, defaultDays: 7 },
            { title: "Address questions and negotiate terms", category: "Negotiation", sortOrder: 6, defaultDays: 14 },
            { title: "Draft and send Letter of Intent (LOI)", category: "Legal", sortOrder: 7, defaultDays: 7 },
            { title: "Finalise licence or lease agreement", category: "Legal", sortOrder: 8, defaultDays: 21 },
            { title: "Plan transition / launch timeline with school", category: "Planning", sortOrder: 9, defaultDays: 14 },
            { title: "Announce new service to school community", category: "Communication", sortOrder: 10, defaultDays: 7 },
          ],
        },
      },
    });

    // Tender Application
    await prisma.projectTemplate.create({
      data: {
        name: "Tender Application",
        description: "Structured workflow for preparing and submitting an OSHC tender once it is released.",
        category: "Growth",
        tasks: {
          create: [
            { title: "Review tender documents and mandatory criteria", category: "Review", sortOrder: 1, defaultDays: 3 },
            { title: "Attend tender briefing session (if available)", category: "Meeting", sortOrder: 2, defaultDays: 7 },
            { title: "Identify and assign response writers per section", category: "Planning", sortOrder: 3, defaultDays: 3 },
            { title: "Draft executive summary and organisational overview", category: "Drafting", sortOrder: 4, defaultDays: 10 },
            { title: "Prepare proposed service model and programming", category: "Drafting", sortOrder: 5, defaultDays: 10 },
            { title: "Compile financial projections and fee schedule", category: "Finance", sortOrder: 6, defaultDays: 10 },
            { title: "Gather compliance evidence (CCS approval, insurance, policies)", category: "Compliance", sortOrder: 7, defaultDays: 7 },
            { title: "Collect referee statements and testimonials", category: "Evidence", sortOrder: 8, defaultDays: 10 },
            { title: "Internal review and quality check of full submission", category: "Review", sortOrder: 9, defaultDays: 5 },
            { title: "Format submission per tender requirements", category: "Formatting", sortOrder: 10, defaultDays: 3 },
            { title: "Submit tender before deadline", category: "Submission", sortOrder: 11, defaultDays: 1 },
          ],
        },
      },
    });

    // Quality Improvement Plan (QIP)
    await prisma.projectTemplate.create({
      data: {
        name: "Quality Improvement Plan (QIP) Development",
        description: "Develop or refresh the service QIP aligned to the National Quality Framework. Covers self-assessment, goal setting, evidence collection, and regulatory submission.",
        category: "Quality",
        tasks: {
          create: [
            { title: "Review current NQS ratings and previous QIP", category: "Assessment", sortOrder: 1, defaultDays: 7 },
            { title: "Distribute staff self-assessment surveys across 7 quality areas", category: "Assessment", sortOrder: 2, defaultDays: 10 },
            { title: "Collect family and community input on service strengths", category: "Consultation", sortOrder: 3, defaultDays: 14 },
            { title: "Analyse assessment data and identify priority improvement areas", category: "Analysis", sortOrder: 4, defaultDays: 18 },
            { title: "Draft QIP goals with SMART targets for each priority area", category: "Planning", sortOrder: 5, defaultDays: 21 },
            { title: "Assign responsible persons and timelines per goal", category: "Planning", sortOrder: 6, defaultDays: 24 },
            { title: "Develop evidence collection plan for each quality area", category: "Evidence", sortOrder: 7, defaultDays: 28 },
            { title: "Create progress tracking system (checklist or digital tool)", category: "Systems", sortOrder: 8, defaultDays: 28 },
            { title: "Conduct team workshop to present and discuss QIP goals", category: "Engagement", sortOrder: 9, defaultDays: 30 },
            { title: "Display QIP summary for families and stakeholders", category: "Communication", sortOrder: 10, defaultDays: 35 },
            { title: "Submit updated QIP to regulatory authority (if required)", category: "Compliance", sortOrder: 11, defaultDays: 40 },
            { title: "Schedule quarterly QIP progress reviews", category: "Governance", sortOrder: 12, defaultDays: 42 },
            { title: "Conduct first quarterly review and update progress notes", category: "Review", sortOrder: 13, defaultDays: 90 },
          ],
        },
      },
    });

    // Educator Professional Development Cycle
    await prisma.projectTemplate.create({
      data: {
        name: "Educator Professional Development Cycle",
        description: "Annual professional development cycle for educators including performance appraisals, goal setting, training plans, mentoring, and certification tracking.",
        category: "Staffing",
        tasks: {
          create: [
            { title: "Schedule annual performance appraisals for all educators", category: "Planning", sortOrder: 1, defaultDays: 7 },
            { title: "Distribute educator self-reflection worksheets", category: "Assessment", sortOrder: 2, defaultDays: 10 },
            { title: "Conduct one-on-one appraisal meetings with each educator", category: "Appraisals", sortOrder: 3, defaultDays: 21 },
            { title: "Collaboratively set individual PD goals aligned to NQS", category: "Goal Setting", sortOrder: 4, defaultDays: 28 },
            { title: "Create annual training calendar (First Aid, WWCC renewals, CPR)", category: "Planning", sortOrder: 5, defaultDays: 14 },
            { title: "Identify and book external PD workshops or conferences", category: "Training", sortOrder: 6, defaultDays: 21 },
            { title: "Set up peer mentoring pairs for new and experienced educators", category: "Mentoring", sortOrder: 7, defaultDays: 14 },
            { title: "Schedule monthly team learning sessions (MTOP, inclusion, behaviour)", category: "Training", sortOrder: 8, defaultDays: 14 },
            { title: "Track and update certification expiry dates for all staff", category: "Compliance", sortOrder: 9, defaultDays: 10 },
            { title: "Compile PD participation records for each educator", category: "Documentation", sortOrder: 10, defaultDays: 30 },
            { title: "Conduct mid-year PD goal check-in meetings", category: "Review", sortOrder: 11, defaultDays: 90 },
            { title: "Evaluate PD program effectiveness and gather educator feedback", category: "Evaluation", sortOrder: 12, defaultDays: 120 },
            { title: "Prepare end-of-year PD summary report for management", category: "Reporting", sortOrder: 13, defaultDays: 150 },
          ],
        },
      },
    });

    // Inclusion Support Program
    await prisma.projectTemplate.create({
      data: {
        name: "Inclusion Support Program Setup",
        description: "Set up individualised support for a child with additional needs. Covers ISP meetings, funding applications, environment modifications, and staff training.",
        category: "Inclusion",
        tasks: {
          create: [
            { title: "Meet with family to understand child's needs and routines", category: "Consultation", sortOrder: 1, defaultDays: 5 },
            { title: "Obtain relevant reports (paediatrician, OT, speech, psychologist)", category: "Documentation", sortOrder: 2, defaultDays: 10 },
            { title: "Contact Inclusion Agency for guidance and support", category: "External", sortOrder: 3, defaultDays: 7 },
            { title: "Develop Individual Support Plan (ISP) with strategies", category: "Planning", sortOrder: 4, defaultDays: 14 },
            { title: "Apply for Inclusion Support Subsidy (ISS) via CCCMS portal", category: "Funding", sortOrder: 5, defaultDays: 14 },
            { title: "Conduct environment review for accessibility and sensory needs", category: "Environment", sortOrder: 6, defaultDays: 10 },
            { title: "Purchase any specialised equipment or resources", category: "Resources", sortOrder: 7, defaultDays: 21 },
            { title: "Provide targeted training for educators (e.g. autism, ADHD, sensory)", category: "Training", sortOrder: 8, defaultDays: 14 },
            { title: "Recruit and onboard additional support worker (if ISS approved)", category: "Staffing", sortOrder: 9, defaultDays: 28 },
            { title: "Implement visual schedules and transition supports", category: "Programming", sortOrder: 10, defaultDays: 14 },
            { title: "Schedule regular ISP review meetings with family and specialists", category: "Review", sortOrder: 11, defaultDays: 21 },
            { title: "Document observations and progress notes for ISP evidence", category: "Documentation", sortOrder: 12, defaultDays: 30 },
            { title: "Conduct formal ISP review and update goals", category: "Review", sortOrder: 13, defaultDays: 60 },
          ],
        },
      },
    });

    // Policy Review Cycle
    await prisma.projectTemplate.create({
      data: {
        name: "Service Policy Review Cycle",
        description: "Systematic review and update of all service policies to ensure NQF compliance, alignment with current legislation, and reflection of best practice in OSHC.",
        category: "Governance",
        tasks: {
          create: [
            { title: "Compile master list of all current service policies with review dates", category: "Audit", sortOrder: 1, defaultDays: 7 },
            { title: "Identify policies due for review and prioritise by urgency", category: "Audit", sortOrder: 2, defaultDays: 10 },
            { title: "Review Child Safe Standards and child protection policies", category: "Critical", sortOrder: 3, defaultDays: 14 },
            { title: "Review behaviour guidance and anti-bullying policies", category: "Wellbeing", sortOrder: 4, defaultDays: 18 },
            { title: "Review nutrition, food safety, and allergy management policies", category: "Health", sortOrder: 5, defaultDays: 21 },
            { title: "Review excursion, transport, and sun safety policies", category: "Safety", sortOrder: 6, defaultDays: 24 },
            { title: "Review privacy, social media, and photography policies", category: "Governance", sortOrder: 7, defaultDays: 28 },
            { title: "Review WHS, emergency management, and incident reporting policies", category: "Safety", sortOrder: 8, defaultDays: 30 },
            { title: "Review enrolment, fee, and CCS administration policies", category: "Admin", sortOrder: 9, defaultDays: 32 },
            { title: "Consult educators on practical application and gaps", category: "Consultation", sortOrder: 10, defaultDays: 35 },
            { title: "Consult families on relevant policies (e.g. complaints, feedback)", category: "Consultation", sortOrder: 11, defaultDays: 38 },
            { title: "Finalise updated policies and obtain management sign-off", category: "Approval", sortOrder: 12, defaultDays: 42 },
            { title: "Distribute updated policies to all staff with acknowledgment", category: "Communication", sortOrder: 13, defaultDays: 45 },
            { title: "Update policy folder, website, and parent handbook", category: "Documentation", sortOrder: 14, defaultDays: 48 },
            { title: "Set next review dates and add to annual calendar", category: "Planning", sortOrder: 15, defaultDays: 50 },
          ],
        },
      },
    });

  console.log("Replaced 14 project templates");

  // ============================================================
  // Seed Financial Periods
  // ============================================================
  // Financial Periods — delete + replace
  await prisma.financialPeriod.deleteMany();
  {
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
      // NSW Active Centres
      "MFIS-BH": { bscRevenue: [3500, 5000], ascRevenue: [14000, 18000], vcRevenueHoliday: 3500, staffCostsPercent: 65, foodCostsPercent: 6.5, suppliesCostsPercent: 3, rentCostsPercent: 10, adminCostsPercent: 4, otherCostsPercent: 1.5, bscEnrolments: [30, 38], ascEnrolments: [48, 58], bscAttendanceRate: [75, 85], ascAttendanceRate: [80, 90] },
      "MFIS-GA": { bscRevenue: [3000, 4200], ascRevenue: [11000, 14000], vcRevenueHoliday: 2800, staffCostsPercent: 63, foodCostsPercent: 6, suppliesCostsPercent: 3, rentCostsPercent: 11, adminCostsPercent: 4, otherCostsPercent: 2, bscEnrolments: [25, 32], ascEnrolments: [40, 48], bscAttendanceRate: [70, 80], ascAttendanceRate: [75, 88] },
      "MFIS-HP": { bscRevenue: [3200, 4200], ascRevenue: [11000, 14000], vcRevenueHoliday: 3000, staffCostsPercent: 64, foodCostsPercent: 6.5, suppliesCostsPercent: 3, rentCostsPercent: 10, adminCostsPercent: 4, otherCostsPercent: 1.5, bscEnrolments: [28, 35], ascEnrolments: [44, 52], bscAttendanceRate: [72, 82], ascAttendanceRate: [78, 88] },
      "UG": { bscRevenue: [3000, 4000], ascRevenue: [11000, 13500], vcRevenueHoliday: 2600, staffCostsPercent: 63, foodCostsPercent: 6, suppliesCostsPercent: 3, rentCostsPercent: 11, adminCostsPercent: 4, otherCostsPercent: 2, bscEnrolments: [23, 30], ascEnrolments: [38, 46], bscAttendanceRate: [68, 78], ascAttendanceRate: [75, 87] },
      "ARK": { bscRevenue: [2500, 3500], ascRevenue: [9000, 12000], vcRevenueHoliday: 2200, staffCostsPercent: 60, foodCostsPercent: 6, suppliesCostsPercent: 3, rentCostsPercent: 12, adminCostsPercent: 5, otherCostsPercent: 2, bscEnrolments: [18, 25], ascEnrolments: [32, 42], bscAttendanceRate: [65, 75], ascAttendanceRate: [72, 85] },
      "MNC": { bscRevenue: [3000, 4200], ascRevenue: [12000, 15000], vcRevenueHoliday: 3000, staffCostsPercent: 63, foodCostsPercent: 6, suppliesCostsPercent: 3, rentCostsPercent: 11, adminCostsPercent: 4, otherCostsPercent: 2, bscEnrolments: [26, 33], ascEnrolments: [42, 50], bscAttendanceRate: [70, 80], ascAttendanceRate: [76, 88] },
      // VIC Active Centres
      "ATC": { bscRevenue: [3500, 5000], ascRevenue: [14000, 18000], vcRevenueHoliday: 3500, staffCostsPercent: 65, foodCostsPercent: 6.5, suppliesCostsPercent: 3, rentCostsPercent: 10, adminCostsPercent: 4, otherCostsPercent: 1.5, bscEnrolments: [32, 40], ascEnrolments: [50, 60], bscAttendanceRate: [75, 85], ascAttendanceRate: [80, 90] },
      "AIA-COB": { bscRevenue: [3500, 5000], ascRevenue: [14000, 18000], vcRevenueHoliday: 3500, staffCostsPercent: 65, foodCostsPercent: 6.5, suppliesCostsPercent: 3, rentCostsPercent: 10, adminCostsPercent: 4, otherCostsPercent: 1.5, bscEnrolments: [30, 38], ascEnrolments: [48, 58], bscAttendanceRate: [75, 85], ascAttendanceRate: [80, 90] },
      "MIN-DOV": { bscRevenue: [2000, 3000], ascRevenue: [8000, 11000], vcRevenueHoliday: 1500, staffCostsPercent: 62, foodCostsPercent: 6, suppliesCostsPercent: 3, rentCostsPercent: 11, adminCostsPercent: 5, otherCostsPercent: 2, bscEnrolments: [15, 22], ascEnrolments: [28, 38], bscAttendanceRate: [62, 76], ascAttendanceRate: [72, 86] },
      "MIN-OFF": { bscRevenue: [1500, 2500], ascRevenue: [6000, 9000], vcRevenueHoliday: 1200, staffCostsPercent: 62, foodCostsPercent: 6, suppliesCostsPercent: 3, rentCostsPercent: 11, adminCostsPercent: 5, otherCostsPercent: 2, bscEnrolments: [12, 20], ascEnrolments: [24, 36], bscAttendanceRate: [60, 75], ascAttendanceRate: [70, 85] },
      "MIN-SPR": { bscRevenue: [1800, 2800], ascRevenue: [7000, 10000], vcRevenueHoliday: 1400, staffCostsPercent: 62, foodCostsPercent: 6, suppliesCostsPercent: 3, rentCostsPercent: 11, adminCostsPercent: 5, otherCostsPercent: 2, bscEnrolments: [14, 21], ascEnrolments: [26, 37], bscAttendanceRate: [62, 76], ascAttendanceRate: [72, 86] },
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

    console.log("Replaced financial periods for all centres (3 months)");
  }

  // ============================================================
  // Seed Centre Metrics
  // ============================================================
  // Centre Metrics — delete + replace
  await prisma.centreMetrics.deleteMany();
  {
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
      "MFIS-BH": { bscCapacity: 40, ascCapacity: 60, bscOccupancy: [75, 85], ascOccupancy: [80, 90], totalEducators: 8, educatorTurnover: [5, 12], ratioCompliance: [98, 100], parentNps: [65, 75], incidentCount: [1, 2], complaintCount: [0, 1], wwccCompliance: 100, firstAidCompliance: [95, 100], overallCompliance: [95, 100], nqsRating: "Exceeding" },
      "MFIS-GA": { bscCapacity: 35, ascCapacity: 50, bscOccupancy: [72, 82], ascOccupancy: [78, 88], totalEducators: 6, educatorTurnover: [8, 15], ratioCompliance: [97, 100], parentNps: [60, 72], incidentCount: [1, 3], complaintCount: [0, 1], wwccCompliance: 100, firstAidCompliance: [93, 100], overallCompliance: [94, 100], nqsRating: "Meeting" },
      "MFIS-HP": { bscCapacity: 38, ascCapacity: 55, bscOccupancy: [74, 84], ascOccupancy: [79, 89], totalEducators: 7, educatorTurnover: [6, 13], ratioCompliance: [97, 100], parentNps: [62, 73], incidentCount: [0, 2], complaintCount: [0, 1], wwccCompliance: 100, firstAidCompliance: [94, 100], overallCompliance: [95, 100], nqsRating: "Exceeding" },
      "UG": { bscCapacity: 32, ascCapacity: 45, bscOccupancy: [70, 80], ascOccupancy: [75, 87], totalEducators: 6, educatorTurnover: [10, 18], ratioCompliance: [96, 100], parentNps: [55, 68], incidentCount: [1, 3], complaintCount: [0, 2], wwccCompliance: 100, firstAidCompliance: [90, 100], overallCompliance: [93, 100], nqsRating: "Meeting" },
      "ARK": { bscCapacity: 28, ascCapacity: 40, bscOccupancy: [65, 78], ascOccupancy: [70, 85], totalEducators: 5, educatorTurnover: [8, 16], ratioCompliance: [95, 100], parentNps: [50, 65], incidentCount: [0, 2], complaintCount: [0, 1], wwccCompliance: 100, firstAidCompliance: [90, 98], overallCompliance: [92, 99], nqsRating: "Meeting" },
      "MNC": { bscCapacity: 35, ascCapacity: 50, bscOccupancy: [70, 82], ascOccupancy: [76, 88], totalEducators: 6, educatorTurnover: [7, 14], ratioCompliance: [97, 100], parentNps: [58, 70], incidentCount: [0, 2], complaintCount: [0, 1], wwccCompliance: 100, firstAidCompliance: [93, 100], overallCompliance: [94, 100], nqsRating: "Meeting" },
      // VIC Active Centres
      "AIA-COB": { bscCapacity: 35, ascCapacity: 50, bscOccupancy: [75, 85], ascOccupancy: [80, 90], totalEducators: 7, educatorTurnover: [5, 12], ratioCompliance: [98, 100], parentNps: [65, 75], incidentCount: [1, 2], complaintCount: [0, 1], wwccCompliance: 100, firstAidCompliance: [95, 100], overallCompliance: [95, 100], nqsRating: "Exceeding" },
      "ATC": { bscCapacity: 40, ascCapacity: 60, bscOccupancy: [75, 85], ascOccupancy: [80, 90], totalEducators: 8, educatorTurnover: [5, 12], ratioCompliance: [98, 100], parentNps: [65, 75], incidentCount: [1, 2], complaintCount: [0, 1], wwccCompliance: 100, firstAidCompliance: [95, 100], overallCompliance: [95, 100], nqsRating: "Exceeding" },
      "MIN-OFF": { bscCapacity: 32, ascCapacity: 45, bscOccupancy: [65, 78], ascOccupancy: [70, 82], totalEducators: 5, educatorTurnover: [8, 16], ratioCompliance: [96, 100], parentNps: [52, 65], incidentCount: [0, 2], complaintCount: [0, 1], wwccCompliance: 100, firstAidCompliance: [92, 100], overallCompliance: [93, 100], nqsRating: "Meeting" },
      "MIN-DOV": { bscCapacity: 28, ascCapacity: 40, bscOccupancy: [62, 76], ascOccupancy: [68, 80], totalEducators: 5, educatorTurnover: [9, 17], ratioCompliance: [96, 100], parentNps: [50, 64], incidentCount: [0, 2], complaintCount: [0, 1], wwccCompliance: 100, firstAidCompliance: [91, 100], overallCompliance: [92, 100], nqsRating: "Meeting" },
      "MIN-SPR": { bscCapacity: 32, ascCapacity: 45, bscOccupancy: [64, 77], ascOccupancy: [70, 82], totalEducators: 5, educatorTurnover: [9, 17], ratioCompliance: [96, 100], parentNps: [52, 66], incidentCount: [0, 2], complaintCount: [0, 1], wwccCompliance: 100, firstAidCompliance: [92, 100], overallCompliance: [93, 100], nqsRating: "Meeting" },
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

    console.log("Replaced centre metrics for all services");
  }

  // ============================================================
  // Support Tickets: Contacts, Tickets, Messages, Templates
  // ============================================================

  // Support Tickets — delete + replace
  await prisma.ticketMessage.deleteMany();
  await prisma.supportTicket.deleteMany();
  await prisma.whatsAppContact.deleteMany();
  await prisma.responseTemplate.deleteMany();
  {
    // Get first few services for linking
    const allServices = await prisma.service.findMany({ take: 5 });

    // Create WhatsApp contacts (sample parents)
    const contacts = await Promise.all([
      prisma.whatsAppContact.create({
        data: {
          waId: "61412345678",
          phoneNumber: "+61 412 345 678",
          name: "Fatima Ahmed",
          parentName: "Fatima Ahmed",
          childName: "Yusuf Ahmed",
          serviceId: allServices[0]?.id,
        },
      }),
      prisma.whatsAppContact.create({
        data: {
          waId: "61423456789",
          phoneNumber: "+61 423 456 789",
          name: "Sarah Hassan",
          parentName: "Sarah Hassan",
          childName: "Amira Hassan",
          serviceId: allServices[1]?.id,
        },
      }),
      prisma.whatsAppContact.create({
        data: {
          waId: "61434567890",
          phoneNumber: "+61 434 567 890",
          name: "Omar Ibrahim",
          parentName: "Omar Ibrahim",
          childName: "Zahra Ibrahim",
          serviceId: allServices[2]?.id,
        },
      }),
      prisma.whatsAppContact.create({
        data: {
          waId: "61445678901",
          phoneNumber: "+61 445 678 901",
          name: "Aisha Khan",
          parentName: "Aisha Khan",
          childName: "Adam Khan",
          serviceId: allServices[0]?.id,
        },
      }),
      prisma.whatsAppContact.create({
        data: {
          waId: "61456789012",
          phoneNumber: "+61 456 789 012",
          name: "Mohammed Ali",
          parentName: "Mohammed Ali",
          childName: "Lina Ali",
        },
      }),
    ]);

    // Create support tickets
    const now = new Date();
    const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);
    const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

    const tickets = await Promise.all([
      prisma.supportTicket.create({
        data: {
          contactId: contacts[0].id,
          subject: "Pickup time change request",
          status: "open",
          priority: "normal",
          assignedToId: admin.id,
          serviceId: allServices[0]?.id,
          lastInboundAt: hoursAgo(2),
        },
      }),
      prisma.supportTicket.create({
        data: {
          contactId: contacts[1].id,
          subject: "Allergy information update",
          status: "new",
          priority: "high",
          serviceId: allServices[1]?.id,
          lastInboundAt: hoursAgo(1),
        },
      }),
      prisma.supportTicket.create({
        data: {
          contactId: contacts[2].id,
          subject: "Vacation care enrolment enquiry",
          status: "pending_parent",
          priority: "normal",
          assignedToId: admin.id,
          serviceId: allServices[2]?.id,
          firstResponseAt: daysAgo(1),
          lastInboundAt: daysAgo(1),
        },
      }),
      prisma.supportTicket.create({
        data: {
          contactId: contacts[3].id,
          subject: "Invoice query for Term 1",
          status: "resolved",
          priority: "low",
          assignedToId: admin.id,
          serviceId: allServices[0]?.id,
          firstResponseAt: daysAgo(3),
          resolvedAt: daysAgo(1),
          lastInboundAt: daysAgo(2),
        },
      }),
      prisma.supportTicket.create({
        data: {
          contactId: contacts[4].id,
          subject: "New enrolment for next term",
          status: "open",
          priority: "normal",
          lastInboundAt: hoursAgo(5),
        },
      }),
      prisma.supportTicket.create({
        data: {
          contactId: contacts[0].id,
          subject: "Child feeling unwell yesterday",
          status: "closed",
          priority: "urgent",
          assignedToId: admin.id,
          serviceId: allServices[0]?.id,
          firstResponseAt: daysAgo(5),
          resolvedAt: daysAgo(4),
          closedAt: daysAgo(3),
          lastInboundAt: daysAgo(5),
        },
      }),
    ]);

    // Create messages for the first few tickets
    await Promise.all([
      // Ticket 1: Pickup time change
      prisma.ticketMessage.create({
        data: {
          ticketId: tickets[0].id,
          direction: "inbound",
          senderName: "Fatima Ahmed",
          body: "Assalamu alaikum, I need to change Yusuf's pickup time from 5:30 to 4:00 starting next week. Is that possible?",
          deliveryStatus: "read",
          createdAt: hoursAgo(3),
        },
      }),
      prisma.ticketMessage.create({
        data: {
          ticketId: tickets[0].id,
          direction: "outbound",
          senderName: "Amana Admin",
          agentId: admin.id,
          body: "Wa alaikum assalam Fatima! Yes, we can absolutely change Yusuf's pickup time. I'll update the system for next week. Just to confirm - this is for every day?",
          deliveryStatus: "read",
          createdAt: hoursAgo(2.5),
        },
      }),
      prisma.ticketMessage.create({
        data: {
          ticketId: tickets[0].id,
          direction: "inbound",
          senderName: "Fatima Ahmed",
          body: "Yes please, Monday to Friday. JazakAllah khair!",
          deliveryStatus: "read",
          createdAt: hoursAgo(2),
        },
      }),

      // Ticket 2: Allergy update
      prisma.ticketMessage.create({
        data: {
          ticketId: tickets[1].id,
          direction: "inbound",
          senderName: "Sarah Hassan",
          body: "Hi, Amira has been diagnosed with a tree nut allergy. Can you please update her records? The doctor's letter is attached.",
          deliveryStatus: "delivered",
          createdAt: hoursAgo(1),
        },
      }),

      // Ticket 3: Vacation care
      prisma.ticketMessage.create({
        data: {
          ticketId: tickets[2].id,
          direction: "inbound",
          senderName: "Omar Ibrahim",
          body: "Salam, I'd like to enrol Zahra in the April vacation care program. What activities are planned?",
          deliveryStatus: "read",
          createdAt: daysAgo(2),
        },
      }),
      prisma.ticketMessage.create({
        data: {
          ticketId: tickets[2].id,
          direction: "outbound",
          senderName: "Amana Admin",
          agentId: admin.id,
          body: "Wa alaikum assalam Omar! Great to hear you're interested in vacation care. We have excursions, sports, arts & crafts, and cooking workshops planned. I'll send through the full program schedule. Could you confirm which weeks you need?",
          deliveryStatus: "read",
          createdAt: daysAgo(1),
        },
      }),

      // Ticket 4: Invoice query (resolved)
      prisma.ticketMessage.create({
        data: {
          ticketId: tickets[3].id,
          direction: "inbound",
          senderName: "Aisha Khan",
          body: "Hi, I noticed my Term 1 invoice shows 5 days per week but Adam only attends 3 days. Can you check?",
          deliveryStatus: "read",
          createdAt: daysAgo(4),
        },
      }),
      prisma.ticketMessage.create({
        data: {
          ticketId: tickets[3].id,
          direction: "outbound",
          senderName: "Amana Admin",
          agentId: admin.id,
          body: "Hi Aisha, thank you for flagging this. I've checked and you're right - there was an error. I've corrected the invoice and a revised copy has been sent to your email. The difference will be credited to next term.",
          deliveryStatus: "read",
          createdAt: daysAgo(3),
        },
      }),
      prisma.ticketMessage.create({
        data: {
          ticketId: tickets[3].id,
          direction: "inbound",
          senderName: "Aisha Khan",
          body: "Thank you so much for sorting that out quickly!",
          deliveryStatus: "read",
          createdAt: daysAgo(2),
        },
      }),

      // Ticket 5: New enrolment
      prisma.ticketMessage.create({
        data: {
          ticketId: tickets[4].id,
          direction: "inbound",
          senderName: "Mohammed Ali",
          body: "Hi, we're new to the area. I'd like to enrol my daughter Lina in the after-school care program for Term 2. She'll be starting Year 3 at the local school. What's the process?",
          deliveryStatus: "delivered",
          createdAt: hoursAgo(5),
        },
      }),
    ]);

    console.log(`Created ${contacts.length} WhatsApp contacts, ${tickets.length} support tickets with messages`);

    // Create response templates
    await Promise.all([
      prisma.responseTemplate.create({
        data: {
          title: "Welcome Greeting",
          body: "Assalamu alaikum! Thank you for contacting Amana OSHC. How can we help you today?",
          category: "greeting",
          shortcut: "/hello",
        },
      }),
      prisma.responseTemplate.create({
        data: {
          title: "Absence Report Acknowledged",
          body: "Thank you for letting us know. We've noted the absence in our records. We hope they feel better soon!",
          category: "absence",
          shortcut: "/absent",
        },
      }),
      prisma.responseTemplate.create({
        data: {
          title: "Billing Enquiry",
          body: "Thank you for your billing enquiry. I'll look into this and get back to you within 24 hours with the details.",
          category: "billing",
          shortcut: "/billing",
        },
      }),
      prisma.responseTemplate.create({
        data: {
          title: "Pickup Change Confirmed",
          body: "The pickup time change has been updated in our system. Please let us know if you need any further changes.",
          category: "general",
          shortcut: "/pickup",
        },
      }),
      prisma.responseTemplate.create({
        data: {
          title: "Enrolment Info",
          body: "Thank you for your interest in Amana OSHC! To enrol your child, please visit our website or I can send you the enrolment form directly. The key details we'll need are: child's full name, date of birth, school, emergency contacts, and any medical/dietary requirements.",
          category: "enrolment",
          shortcut: "/enrol",
        },
      }),
      prisma.responseTemplate.create({
        data: {
          title: "Vacation Care Info",
          body: "Our vacation care program runs during school holidays with exciting activities including excursions, sports, arts & crafts, and cooking. I'll send through the full schedule and booking form.",
          category: "vacation",
          shortcut: "/vaccare",
        },
      }),
      prisma.responseTemplate.create({
        data: {
          title: "Closing Message",
          body: "Is there anything else I can help you with? If not, I'll close this ticket. JazakAllah khair for contacting Amana OSHC!",
          category: "closing",
          shortcut: "/close",
        },
      }),
    ]);

    console.log("Replaced 7 response templates");
  }

  // ── Accountability Chart (EOS) ────────────────────────────
  await prisma.accountabilitySeatAssignment.deleteMany();
  await prisma.accountabilitySeat.deleteMany();

  // Helper to create a seat with optional assignee by email
  const createSeat = async (
    title: string,
    responsibilities: string[],
    parentId: string | null,
    order: number,
    assigneeEmails: string[] = []
  ) => {
    const seat = await prisma.accountabilitySeat.create({
      data: { title, responsibilities, parentId, order },
    });
    for (const email of assigneeEmails) {
      const user = await prisma.user.findUnique({ where: { email } });
      if (user) {
        await prisma.accountabilitySeatAssignment.create({
          data: { seatId: seat.id, userId: user.id },
        });
      }
    }
    return seat;
  };

  // Level 0: Visionary
  const visionary = await createSeat(
    "Visionary",
    ["20 Ideas", "Big Relationships", "Culture", "Research & Development"],
    null, 0,
    [adminEmail]
  );

  // Level 1: Integrator
  const integrator = await createSeat(
    "Integrator",
    ["LMA", "P&L / Business Plan", "Remove Obstacles & Barriers", "Special Projects", "Business Processes"],
    visionary.id, 0
  );

  // Level 2: Department Heads (report to Integrator)
  const marketing = await createSeat(
    "Marketing",
    ["Brand", "Parent Leads", "Digital", "Program Marketing", "CRM"],
    integrator.id, 0
  );

  const operations = await createSeat(
    "Operations",
    ["LMA", "Revenue & GP", "Process Management", "Parent Escalations"],
    integrator.id, 1
  );

  const compliance = await createSeat(
    "Compliance",
    ["LMA", "Management Training", "Legislation", "Gov Policy and Procedures"],
    integrator.id, 2
  );

  const financeAdmin = await createSeat(
    "Finance & Admin",
    ["LMA", "IT Systems", "Invoicing", "Office Management"],
    integrator.id, 3
  );

  // Level 3: Under Marketing
  await createSeat("Marketing Assistant", [], marketing.id, 0);

  // Level 3: Under Operations
  await createSeat(
    "Program Coordinator",
    ["Program Development", "Program Costings", "Program Sales"],
    operations.id, 0
  );

  await createSeat(
    "Customer Service",
    ["Parent Accounts", "Assisting Parents", "Lead Conversion (Sales)"],
    operations.id, 1
  );

  const stateManager = await createSeat(
    "State Manager",
    ["LMA", "Budgeting", "School Relationships", "Compliance", "Induction"],
    operations.id, 2
  );

  // Level 3: Under Compliance
  await createSeat("HR", ["Hiring"], compliance.id, 0);

  // Level 3: Under Finance & Admin
  await createSeat("Accounts", ["AP/AR", "Payroll"], financeAdmin.id, 0);

  // Level 4: Under State Manager
  const bakTeamLeader = await createSeat(
    "BAK Team Leader",
    ["LMA", "Rostering", "Equipment Management", "Audits"],
    stateManager.id, 0
  );

  const centreManagers = await createSeat(
    "Centre Managers",
    ["LMA", "Rostering", "Equipment Management", "Audits", "Parent Relationships"],
    stateManager.id, 1
  );

  // Level 5: Under BAK Team Leader
  await createSeat(
    "BAK Coach",
    ["Program Delivery", "Child Safety", "FUN"],
    bakTeamLeader.id, 0
  );

  // Level 5: Under Centre Managers
  await createSeat(
    "OSHC Educators",
    ["Program Delivery", "Child Safety", "FUN"],
    centreManagers.id, 0
  );

  console.log("Replaced accountability chart (17 seats)");

  // ── Marketing Content Templates ─────────────────────────────
  console.log("Seeding marketing templates...");

  const marketingTemplates = [
    // ── Enrolment & Open Days ──
    {
      name: "Enrolment Open — Term Announcement",
      platform: "facebook" as const,
      pillar: "Enrolment",
      content: `Enrolments are now OPEN for Term [X], [Year]! 🎉

Give your child the best after-school experience at Amana OSHC — where learning meets play in a safe, nurturing environment.

✅ Homework support & tutoring
✅ Creative arts & STEM activities
✅ Outdoor sports & active play
✅ Healthy halal afternoon tea
✅ Before & after school care

📍 Available at [Centre Name]
📞 Book a tour or enrol today — link in bio!

Limited spots available. Don't miss out!`,
      notes: "Update term number, year, and centre name. Add centre-specific photo. Best posted 4-6 weeks before term starts.",
      hashtags: "#AmanaOSHC #Enrolments #OSHC #AfterSchoolCare #BeforeSchoolCare #ChildCare #SchoolHolidays",
    },
    {
      name: "Open Day Invitation",
      platform: "facebook" as const,
      pillar: "Enrolment",
      content: `You're Invited! 🌟 Amana OSHC Open Day

Come and see what makes Amana OSHC special! Meet our team, explore our facilities, and learn about our programs.

📅 Date: [Date]
🕐 Time: [Time]
📍 Location: [Centre Name & Address]

What to expect:
🎨 Live activity demonstrations
👋 Meet our qualified educators
📋 On-the-spot enrolment assistance
🍪 Light refreshments provided

Bring the kids — we'll have fun activities running!

RSVP: [Link/Phone]`,
      notes: "Customise date, time, location. Include a warm, welcoming photo of the centre. Post 2 weeks before the event with a reminder 3 days prior.",
      hashtags: "#AmanaOSHC #OpenDay #OSHC #ChildCare #CommunityEvent #SchoolCommunity",
    },
    {
      name: "Enrolment Reminder — Spots Filling",
      platform: "instagram" as const,
      pillar: "Enrolment",
      content: `⏰ Last chance! Spots are filling fast for Term [X] at [Centre Name].

Don't wait — secure your child's place at Amana OSHC today.

We offer:
🌟 A safe, faith-aligned environment
📚 Homework help & learning support
🏃 Active play & outdoor adventures
🎭 Creative arts & cultural programs

Enrol now 👉 Link in bio

#AmanaOSHC #OSHC #EnrolNow #LastChance #AfterSchoolCare`,
      notes: "Use urgency-driven language. Best as a carousel with 3-4 activity photos. Post when 70%+ capacity reached.",
      hashtags: "#AmanaOSHC #OSHC #EnrolNow #LastChance #AfterSchoolCare #ChildCare",
    },

    // ── Holiday Programs ──
    {
      name: "Holiday Program Launch",
      platform: "facebook" as const,
      pillar: "Holiday Program",
      content: `🎉 School Holiday Program is HERE!

Amana OSHC has an incredible lineup of activities planned for the [Season] school holidays!

Week 1: [Theme — e.g. "Science Explorers"]
Week 2: [Theme — e.g. "Creative Arts Festival"]

Daily highlights include:
🔬 STEM experiments & workshops
🎨 Arts, crafts & cooking
🏊 Excursions & incursions
🤸 Sports, games & outdoor fun
🍽️ Healthy halal meals & snacks included

📅 [Start Date] — [End Date]
📍 [Centre Name]
💰 CCS approved — affordable care for families

Book now before spots fill up!
👉 [Booking Link]`,
      notes: "Customise themes per holiday period. Include a fun, colourful graphic or video montage of past holidays. Post 3-4 weeks before holidays begin.",
      hashtags: "#AmanaOSHC #SchoolHolidays #HolidayProgram #KidsActivities #OSHC #FunForKids #HalalChildCare",
    },
    {
      name: "Holiday Program Daily Recap",
      platform: "instagram" as const,
      pillar: "Holiday Program",
      content: `What a day at Amana OSHC! 🌟

Today our kids enjoyed [activity description — e.g. "building volcanoes in our Science Lab day!"] 🌋

The smiles say it all! 😊

Still spots available for the rest of the holidays — DM us or visit the link in bio to book.

#AmanaOSHC #HolidayFun #KidsActivities #OSHC #HolidayProgram`,
      notes: "Post daily during holiday program with real photos (ensure photo consent). Keep it authentic and fun. Use Stories for behind-the-scenes.",
      hashtags: "#AmanaOSHC #HolidayFun #KidsActivities #OSHC #HolidayProgram #SchoolHolidays",
    },

    // ── Community Engagement ──
    {
      name: "Community Event Announcement",
      platform: "facebook" as const,
      pillar: "Community",
      content: `🤝 Community Event at Amana OSHC!

We're hosting a [Event Name — e.g. "Family Fun Day / Cultural Celebration / Charity Drive"] and we'd love you to join us!

📅 [Date]
🕐 [Time]
📍 [Location]

There will be:
🎪 [Activity 1]
🎭 [Activity 2]
🍽️ [Activity 3 — e.g. food, stalls]
🎁 [Activity 4 — e.g. prizes, giveaways]

This event is open to all families — current and new! Bring your friends and neighbours. 💛

Free entry. See you there!`,
      notes: "Great for building local school community connections. Include event flyer as image. Share in local community groups where appropriate.",
      hashtags: "#AmanaOSHC #CommunityEvent #FamilyFun #OSHC #LocalCommunity #SchoolCommunity",
    },
    {
      name: "Thank You — Community Support",
      platform: "facebook" as const,
      pillar: "Community",
      content: `A huge THANK YOU to everyone who came to our [Event Name]! 🙏💛

We had an incredible turnout and it was wonderful seeing our Amana community come together.

Special thanks to:
⭐ [Sponsor/Partner 1]
⭐ [Sponsor/Partner 2]
⭐ Our amazing team of educators and volunteers

[X] families joined us and we raised $[Amount] for [Cause] — you're all incredible!

Stay tuned for more community events coming soon. 🌟`,
      notes: "Post within 24-48 hours of event. Include a photo collage or short video. Tag sponsors/partners.",
      hashtags: "#AmanaOSHC #ThankYou #Community #OSHC #Grateful #SchoolCommunity",
    },

    // ── Parent Engagement ──
    {
      name: "Parent Testimonial Feature",
      platform: "instagram" as const,
      pillar: "Social Proof",
      content: `"[Parent quote — e.g. 'My kids love going to Amana! The educators are amazing and I know they're in safe hands every day.']"

— [Parent First Name], [Centre Name] Parent ⭐

We love hearing from our Amana families! Your trust means the world to us. 💛

If you'd like to share your experience, send us a DM — we'd love to feature you!

#AmanaOSHC #ParentReview #Testimonial #OSHC #HappyFamilies #ChildCare`,
      notes: "Must have written parent consent before posting. Use a warm photo (with consent) or branded quote card. Rotate centres for representation.",
      hashtags: "#AmanaOSHC #ParentReview #Testimonial #OSHC #HappyFamilies #ChildCare #TrustedCare",
    },
    {
      name: "Tips for Parents — Homework Help",
      platform: "facebook" as const,
      pillar: "Education",
      content: `📚 5 Tips to Make Homework Less Stressful

Struggling with the after-school homework battle? Here are our educator-approved tips:

1️⃣ Create a dedicated homework space — quiet, well-lit, and distraction-free
2️⃣ Set a consistent routine — same time each day builds habit
3️⃣ Break it into chunks — 20 minutes on, 5 minutes break
4️⃣ Celebrate effort, not just results — praise the process
5️⃣ Ask about their day first — connection before correction ❤️

At Amana OSHC, homework support is built into our daily program. Our educators help children develop good study habits in a supportive environment.

👉 Learn more about our programs: [Link]`,
      notes: "Position Amana as an educational partner. Shareable content that builds trust. Can be adapted into a carousel for Instagram.",
      hashtags: "#AmanaOSHC #HomeworkHelp #ParentingTips #OSHC #Education #StudyTips #AfterSchoolCare",
    },

    // ── Staff & Culture ──
    {
      name: "Educator Spotlight",
      platform: "instagram" as const,
      pillar: "Team",
      content: `Meet [Name], one of our amazing educators at [Centre Name]! 🌟

[Name] has been with Amana OSHC for [X] years and is passionate about [interest — e.g. "creative arts and helping kids build confidence through drama"].

🎓 Qualifications: [e.g. Diploma of School Age Education and Care]
💛 Favourite activity to run: [e.g. "Our Friday cooking club!"]
✨ Fun fact: [e.g. "She can solve a Rubik's cube in under 2 minutes!"]

We're so lucky to have you on the team, [Name]! 👏

#AmanaOSHC #MeetTheTeam #OSHC #Educators #ChildCare`,
      notes: "Get educator's written consent and approval on the post. Use a professional but warm photo. Rotate across centres monthly.",
      hashtags: "#AmanaOSHC #MeetTheTeam #OSHC #Educators #ChildCare #TeamSpotlight #WeAreAmana",
    },
    {
      name: "We're Hiring",
      platform: "linkedin" as const,
      pillar: "Recruitment",
      content: `We're Growing! 🚀 Join the Amana OSHC Team

Amana OSHC is looking for passionate [Role — e.g. "OSHC Educators / Coordinators"] to join our team in [State/Location].

What we offer:
✅ Competitive pay + above-award conditions
✅ Professional development & training
✅ A supportive, values-driven workplace
✅ Career progression opportunities
✅ Making a real difference in children's lives

Requirements:
📋 Working with Children Check
📋 First Aid & CPR (or willingness to obtain)
📋 [Qualification — e.g. "Cert III / Diploma in relevant field"]
📋 Passion for working with school-age children

Apply now: [Link]
Or email your CV to [Email]

#Hiring #AmanaOSHC #OSHC #ChildCareJobs #EducatorJobs`,
      notes: "LinkedIn is best for recruitment. Cross-post to Facebook/Instagram with adjusted tone. Update role, location, and requirements per vacancy.",
      hashtags: "#Hiring #AmanaOSHC #OSHC #ChildCareJobs #EducatorJobs #JoinOurTeam #CareersinChildCare",
    },

    // ── Awareness Days & Cultural ──
    {
      name: "Harmony Day Celebration",
      platform: "facebook" as const,
      pillar: "Cultural",
      content: `🧡 Happy Harmony Day!

Today we celebrate the wonderful diversity of our Amana community! At Amana OSHC, we believe every child belongs, no matter their background, culture, or faith.

Our kids celebrated with:
🌍 Cultural dress-up day
🎨 Art from around the world
🍲 Sharing cultural foods
📖 Stories and songs from different cultures

"Everyone belongs" — and that's what makes Amana OSHC special. 💛

#HarmonyDay #EveryoneBelongs #AmanaOSHC #OSHC #Diversity #Inclusion`,
      notes: "Post on March 21st (Harmony Day). Prepare content in advance. Ensure photos represent the diversity of your centre. Works for NAIDOC Week and other awareness days with adapted messaging.",
      hashtags: "#HarmonyDay #EveryoneBelongs #AmanaOSHC #OSHC #Diversity #Inclusion #CulturalDiversity",
    },
    {
      name: "Ramadan & Eid Greetings",
      platform: "facebook" as const,
      pillar: "Cultural",
      content: `🌙 [Ramadan Mubarak / Eid Mubarak] from the Amana OSHC family!

Wishing all our families a blessed [Ramadan / Eid]. May this special time bring peace, joy, and togetherness to your homes. 💛

At Amana OSHC, we embrace and celebrate the values of compassion, generosity, and community — not just during [Ramadan/Eid], but every day.

[For Ramadan: "Our programs during Ramadan are thoughtfully designed to be inclusive and supportive of fasting families."]
[For Eid: "We hope you enjoy this celebration with family and loved ones!"]

🤲 [Ramadan Kareem / Eid Mubarak]`,
      notes: "Use a beautifully designed branded graphic. Post at the start of Ramadan and on Eid day. Reflects Amana's faith-aligned values — key differentiator.",
      hashtags: "#AmanaOSHC #RamadanMubarak #EidMubarak #OSHC #IslamicValues #Community #Blessed",
    },

    // ── Educational & Activities ──
    {
      name: "Activity Highlight — STEM",
      platform: "instagram" as const,
      pillar: "Education",
      content: `🔬 STEM in action at Amana OSHC!

Today our young scientists explored [activity — e.g. "the magic of chemical reactions by building baking soda volcanoes!"] 🌋

At Amana, we believe learning should be hands-on, exciting, and FUN! Our STEM program encourages curiosity, problem-solving, and teamwork.

Want your child to be part of the action? Enrol today — link in bio! 👆

#AmanaOSHC #STEM #Science #KidsActivities #OSHC #LearningThroughPlay`,
      notes: "Use real activity photos with parent consent. Works as Reels/short video format. Post weekly to showcase different program elements.",
      hashtags: "#AmanaOSHC #STEM #Science #KidsActivities #OSHC #LearningThroughPlay #Education",
    },
    {
      name: "Weekly Program Teaser",
      platform: "facebook" as const,
      pillar: "Education",
      content: `📋 What's happening this week at [Centre Name]?

Here's a sneak peek at our program for [Date Range]:

🎨 Monday: [Activity — e.g. "Watercolour painting"]
🏃 Tuesday: [Activity — e.g. "Obstacle course challenge"]
🔬 Wednesday: [Activity — e.g. "Science experiments"]
🎭 Thursday: [Activity — e.g. "Drama & role play"]
🎶 Friday: [Activity — e.g. "Music & movement + cooking club"]

Plus daily homework support, outdoor play, and healthy halal afternoon tea! 🍎

See the full program: [Link]`,
      notes: "Post every Sunday or Monday morning. Include the actual program image/PDF. Helps parents feel informed and builds engagement.",
      hashtags: "#AmanaOSHC #WeeklyProgram #OSHC #KidsActivities #AfterSchoolCare #ChildCare",
    },

    // ── Email Templates ──
    {
      name: "Welcome Email — New Enrolment",
      platform: "email" as const,
      pillar: "Enrolment",
      content: `Dear [Parent Name],

Welcome to the Amana OSHC family! We're thrilled that [Child Name] will be joining us at [Centre Name].

Here's what you need to know:

GETTING STARTED
• First day: [Date]
• Drop-off/Pick-up times: [Times]
• What to bring: Hat, water bottle, change of clothes, and any medication with an action plan

OUR PROGRAM
Your child will enjoy a range of activities including homework support, creative arts, sports, STEM, and more — all in a safe, faith-aligned environment.

IMPORTANT CONTACTS
• Centre Coordinator: [Name] — [Phone]
• Emergency: [Number]
• Email: [Centre Email]

We can't wait to meet [Child Name] and make their time at Amana OSHC an incredible experience!

Warm regards,
The Amana OSHC Team`,
      notes: "Send within 24 hours of enrolment confirmation. Personalise all bracketed fields. Attach parent handbook PDF if available.",
      hashtags: "",
    },
    {
      name: "Newsletter — Monthly Update",
      platform: "newsletter" as const,
      pillar: "Community",
      content: `AMANA OSHC — [Month] [Year] Newsletter

Dear Families,

What a wonderful month it's been at Amana OSHC! Here's everything you need to know:

📸 HIGHLIGHTS
[2-3 sentences about key activities or achievements this month]

📅 UPCOMING DATES
• [Date]: [Event/Activity]
• [Date]: [Event/Activity]
• [Date]: [Event/Activity]

🌟 EDUCATOR SPOTLIGHT
[Short 2-3 sentence feature on an educator]

📋 REMINDERS
• [Reminder 1 — e.g. "Please label all belongings"]
• [Reminder 2 — e.g. "Holiday program bookings open next week"]
• [Reminder 3 — e.g. "Updated medical forms due by [Date]"]

💬 PARENT FEEDBACK
We love hearing from you! If you have any suggestions or feedback, please speak with our coordinator or email us at [Email].

Thank you for being part of the Amana community! 💛

Warm regards,
[Coordinator Name]
[Centre Name]`,
      notes: "Send first week of each month. Include 2-3 photos from the month. Can be sent via Mailchimp/email platform or printed for noticeboards.",
      hashtags: "",
    },

    // ── Flyer Templates ──
    {
      name: "Enrolment Flyer — School Letterbox Drop",
      platform: "flyer" as const,
      pillar: "Enrolment",
      content: `AMANA OSHC — NOW ENROLLING!

Before & After School Care | School Holiday Programs

✅ Qualified & caring educators
✅ Homework support & tutoring
✅ Creative arts, STEM & sports
✅ Healthy halal meals included
✅ CCS approved — affordable care

ABOUT US
Amana OSHC provides high-quality Out of School Hours Care in a safe, nurturing, and faith-aligned environment. We're committed to helping every child learn, grow, and thrive.

OUR PROGRAMS
• Before School Care: [Time]
• After School Care: [Time]
• School Holiday Program: Full day care during all school holidays

📍 [Centre Name & Address]
📞 [Phone Number]
📧 [Email]
🌐 [Website]

BOOK A TOUR TODAY!

"Where every child belongs" 💛`,
      notes: "Design as A5 double-sided flyer. Include Amana branding, photos of happy kids, and a QR code linking to enrolment page. Distribute at school pick-up and local community centres.",
      hashtags: "",
    },

    // ── Website Content ──
    {
      name: "Website — Centre Page Description",
      platform: "website" as const,
      pillar: "Enrolment",
      content: `[Centre Name] — Amana OSHC

Welcome to [Centre Name], part of the Amana OSHC family. Located at [Address], we provide before school care, after school care, and school holiday programs for children in [School Name] and surrounding schools.

OUR APPROACH
At [Centre Name], we create a safe, inclusive, and stimulating environment where children can learn, play, and grow. Our programs are guided by the My Time, Our Place framework and enriched with Amana's core values of faith, safety, growth, health, and community.

WHAT WE OFFER
• Before School Care ([Time] — [Time])
• After School Care ([Time] — [Time])
• School Holiday Programs
• Homework support & tutoring
• STEM, arts, cooking & cultural activities
• Outdoor sports & active play
• Healthy halal afternoon tea daily

OUR TEAM
Our qualified educators are passionate about children's wellbeing and development. All staff hold current Working with Children Checks, First Aid, and relevant qualifications.

ENROL TODAY
Spaces are limited. Contact us to book a tour or enrol your child.

Phone: [Number]
Email: [Email]`,
      notes: "Customise for each centre. Include professional photos of the centre, activities, and team. SEO keywords: OSHC, before school care, after school care, [suburb name].",
      hashtags: "",
    },

    // ── Social Proof & Reviews ──
    {
      name: "Google Review Request",
      platform: "email" as const,
      pillar: "Social Proof",
      content: `Dear [Parent Name],

We hope [Child Name] is loving their time at Amana OSHC! 🌟

Your feedback means the world to us. If you've had a positive experience, we'd be so grateful if you could take a moment to leave us a Google review.

It only takes 30 seconds and helps other families discover Amana OSHC:
👉 [Google Review Link]

Thank you for being part of our community! 💛

Warm regards,
The [Centre Name] Team`,
      notes: "Send to families after 4-6 weeks of enrolment. Include direct Google review link. Track review count monthly as a KPI.",
      hashtags: "",
    },

    // ── Seasonal / Recurring ──
    {
      name: "Back to School — Term Start",
      platform: "facebook" as const,
      pillar: "Education",
      content: `📚 Welcome back! Term [X] starts [Date]!

We're so excited to see everyone back at Amana OSHC! Our team has been busy planning an amazing term filled with new activities, learning adventures, and lots of fun.

What's new this term:
🆕 [New program/activity 1]
🆕 [New program/activity 2]
🆕 [New program/activity 3]

Important reminders:
📋 Updated medical/emergency forms needed
🎒 Please label all belongings
☀️ Sun-safe hats required for outdoor play

Let's make Term [X] the best one yet! 🎉

See you tomorrow! 💛`,
      notes: "Post the day before or morning of first day of term. Include a bright, welcoming graphic or team photo. Pin to top of Facebook page for first week.",
      hashtags: "#AmanaOSHC #BackToSchool #Term #OSHC #AfterSchoolCare #NewTerm #WelcomeBack",
    },
    {
      name: "End of Year Thank You",
      platform: "facebook" as const,
      pillar: "Community",
      content: `🎄 What an incredible year at Amana OSHC!

As [Year] comes to a close, we want to say a huge THANK YOU to:

💛 Our amazing families — for trusting us with your children
💛 Our dedicated educators — for their passion and care every single day
💛 Our school partners — for their ongoing collaboration and support
💛 Our children — for filling our centres with laughter, creativity, and joy

[Year] highlights:
🌟 [Achievement 1 — e.g. "Expanded to 3 new centres"]
🌟 [Achievement 2 — e.g. "Launched our STEM program"]
🌟 [Achievement 3 — e.g. "Hosted 12 community events"]

We can't wait for an even bigger [Year+1]! 🚀

Wishing you all a safe and happy holiday season. See you next year!

With gratitude,
The Amana OSHC Team 💛`,
      notes: "Post in the last week of Term 4. Include a year-in-review video or photo collage if possible. Heartfelt and authentic tone.",
      hashtags: "#AmanaOSHC #ThankYou #EndOfYear #OSHC #Grateful #YearInReview #HappyHolidays",
    },
  ];

  // Upsert marketing templates (skip if name already exists)
  for (const tpl of marketingTemplates) {
    await prisma.marketingTemplate.upsert({
      where: {
        id: (
          await prisma.marketingTemplate.findFirst({
            where: { name: tpl.name, deleted: false },
            select: { id: true },
          })
        )?.id ?? "___none___",
      },
      update: {},
      create: {
        name: tpl.name,
        platform: tpl.platform,
        pillar: tpl.pillar || null,
        content: tpl.content,
        notes: tpl.notes || null,
        hashtags: tpl.hashtags || null,
      },
    });
  }
  console.log(`Seeded ${marketingTemplates.length} marketing templates`);

  // ── AI Prompt Templates ──────────────────────────────────────
  const aiTemplates = [
    {
      slug: "enquiries/follow-up-email",
      name: "Enquiry Follow-Up Email",
      model: "claude-sonnet-4-5-20250514",
      maxTokens: 1024,
      variables: JSON.stringify(["parentName", "childName", "sessionInterest", "serviceName", "conversationNotes", "serviceDetails"]),
      promptTemplate: `Write a warm, personalised follow-up email from Amana OSHC to a parent who enquired about our service.

Parent name: {{parentName}}
Child name: {{childName}}
Session interest: {{sessionInterest}}
Service/Centre: {{serviceName}}
Conversation notes: {{conversationNotes}}
Service details: {{serviceDetails}}

The email should:
- Thank them for their enquiry
- Reference specific details from the conversation
- Highlight relevant service features (programs, facilities, staff qualifications)
- Include a clear call-to-action (book a tour, register online, call back)
- Sign off warmly on behalf of the centre team
- Keep it under 200 words
- Use a professional but friendly tone suitable for parents`,
    },
    {
      slug: "marketing/post-writer",
      name: "Social Media Post Writer",
      model: "claude-sonnet-4-5-20250514",
      maxTokens: 512,
      variables: JSON.stringify(["platform", "pillar", "topic", "serviceName", "campaignContext"]),
      promptTemplate: `Write a social media post for Amana OSHC.

Platform: {{platform}}
Content pillar: {{pillar}}
Topic: {{topic}}
Centre: {{serviceName}}
Campaign context: {{campaignContext}}

Guidelines:
- Match the platform's tone and format (Instagram: visual storytelling with emojis, Facebook: community engagement, LinkedIn: professional/educational)
- Include 2-3 relevant hashtags
- Keep within platform character limits
- Highlight what makes Amana OSHC special (quality care, qualified educators, engaging programs)
- Include a call-to-action where appropriate
- Do NOT include image descriptions or placeholder text for images`,
    },
    {
      slug: "services/menu-planner",
      name: "Weekly Menu Planner",
      model: "claude-sonnet-4-5-20250514",
      maxTokens: 1500,
      variables: JSON.stringify(["serviceName", "existingMenus", "dietaryNotes", "budget"]),
      promptTemplate: `Generate a weekly OSHC menu plan (Monday–Friday) for Amana OSHC.

Centre: {{serviceName}}
Recent menus to avoid repeating: {{existingMenus}}
Dietary notes: {{dietaryNotes}}
Budget guidance: {{budget}}

For each day, provide:
- Morning tea (light snack + drink)
- Lunch (main meal)
- Afternoon tea (snack + drink)

Requirements:
- All food must be halal
- Include a mix of cultural cuisines (Middle Eastern, Australian, Asian, Mediterranean)
- Balance nutrition: protein, vegetables, grains, fruit
- Use seasonal Australian produce
- Keep meals practical for OSHC kitchen preparation (no complex cooking)
- Flag common allergens (nuts, dairy, gluten, eggs) next to each item

Format as a markdown table with columns: Day | Morning Tea | Lunch | Afternoon Tea`,
    },
    {
      slug: "services/allergen-check",
      name: "Menu Allergen & Dietary Check",
      model: "claude-haiku-3.5-20241022",
      maxTokens: 800,
      variables: JSON.stringify(["menuItems", "allergenOptions"]),
      promptTemplate: `You are a food safety assistant for Amana OSHC (Out of School Hours Care). Review this week's menu for allergen and dietary compliance.

Menu items (format: day_slot: description [allergens: tagged]):
{{menuItems}}

Available allergen tags: {{allergenOptions}}

Check for:
1. **Missing allergen tags** — items that likely contain allergens but aren't tagged (e.g. pasta without "gluten", cheese without "dairy")
2. **Halal compliance** — flag any items that may not be halal (pork, gelatin, non-halal meat)
3. **Cross-contamination risks** — items cooked together that share allergens
4. **Nutritional balance** — flag if any day is missing protein, vegetables, or fruit
5. **Repetition** — flag if the same meal appears multiple times in the week

Format your response as:
🔴 **Critical** (must fix before serving)
🟡 **Warnings** (should review)
✅ **All Clear** items

Be concise. Only flag genuine issues.`,
    },
    {
      slug: "services/activity-suggester",
      name: "Program Activity Suggester",
      model: "claude-sonnet-4-5-20250514",
      maxTokens: 1024,
      variables: JSON.stringify(["serviceName", "weekTheme", "ageGroup", "category", "existingActivities", "learningOutcomes"]),
      promptTemplate: `Suggest 3 engaging OSHC program activities for Amana OSHC.

Centre: {{serviceName}}
Week theme: {{weekTheme}}
Age group: {{ageGroup}}
Activity category: {{category}}
Already planned this week: {{existingActivities}}
Target learning outcomes (MTOP/NQS): {{learningOutcomes}}

For each activity, provide:
- **Name**: Creative, engaging title
- **Description**: 2-3 sentences explaining the activity
- **Materials needed**: Bullet list
- **Duration**: Estimated time
- **Learning outcomes**: Which MTOP/NQS outcomes it addresses
- **Differentiation**: How to adapt for younger/older children

Activities should be practical for an OSHC setting (limited space, mixed ages, minimal prep).`,
    },
    {
      slug: "todos/from-meeting-notes",
      name: "Extract Todos from Meeting Notes",
      model: "claude-sonnet-4-5-20250514",
      maxTokens: 1024,
      variables: JSON.stringify(["meetingNotes", "attendees"]),
      promptTemplate: `Extract action items from these meeting notes and format them as a structured todo list.

Meeting notes:
{{meetingNotes}}

Attendees: {{attendees}}

For each action item, extract:
- **title**: Clear, actionable description (start with a verb)
- **assignee**: Best-matched attendee name (or "Unassigned" if unclear)
- **priority**: high, medium, or low

Format your response as a JSON array:
[{ "title": "...", "assignee": "...", "priority": "..." }]

Rules:
- Only extract genuine action items (not discussion points or FYIs)
- Make titles specific and actionable
- Default to 7-day due date (don't include dates in output)
- If an item mentions a specific person, assign to them
- Maximum 15 items`,
    },
    {
      slug: "compliance/risk-report",
      name: "Compliance Risk Report",
      model: "claude-sonnet-4-5-20250514",
      maxTokens: 1500,
      variables: JSON.stringify(["expiringCerts", "overdueAudits", "qualificationGaps", "servicesData"]),
      promptTemplate: `Generate a weekly compliance risk report for Amana OSHC management.

Expiring certificates (next 90 days):
{{expiringCerts}}

Overdue audits:
{{overdueAudits}}

Qualification ratio gaps:
{{qualificationGaps}}

Services overview:
{{servicesData}}

Structure the report as:
1. **Risk Summary** — 2-3 sentence executive overview with severity (Critical/High/Medium/Low)
2. **Immediate Actions Required** — items expiring in <14 days
3. **Upcoming Renewals** — 14-90 day window, grouped by certificate type
4. **Audit Status** — overdue and upcoming audits
5. **Qualification Ratios** — any centres below required thresholds
6. **Recommendations** — 3-5 actionable next steps

Use markdown formatting. Flag critical items with bold.`,
    },
    {
      slug: "financials/commentary",
      name: "Financial Commentary Generator",
      model: "claude-sonnet-4-5-20250514",
      maxTokens: 1024,
      variables: JSON.stringify(["period", "totalRevenue", "totalCosts", "margin", "centreBreakdown", "priorPeriod"]),
      promptTemplate: `Write a financial commentary for Amana OSHC.

Period: {{period}}
Total Revenue: {{totalRevenue}}
Total Costs: {{totalCosts}}
Margin: {{margin}}
Centre breakdown: {{centreBreakdown}}
Prior period comparison: {{priorPeriod}}

Write 3-4 paragraphs covering:
1. **Performance overview** — headline revenue/margin figures and trend direction
2. **Centre highlights** — top and bottom performing centres, notable variances
3. **Cost analysis** — any cost categories trending above expectations
4. **Outlook** — forward-looking statement based on current trajectory

Keep it professional, data-driven, and suitable for a leadership team review. Reference specific numbers.`,
    },
    {
      slug: "performance/digest",
      name: "Centre Performance Digest",
      model: "claude-sonnet-4-5-20250514",
      maxTokens: 1024,
      variables: JSON.stringify(["centreScores", "topPerformers", "bottomPerformers", "trends"]),
      promptTemplate: `Generate a performance digest for Amana OSHC centres.

Centre scores: {{centreScores}}
Top performers: {{topPerformers}}
Bottom performers: {{bottomPerformers}}
Trends: {{trends}}

Structure as:
1. **Overall Portfolio Health** — 2-sentence summary
2. **Star Performers** — centres excelling and why
3. **Attention Needed** — underperforming centres with specific pillar weaknesses
4. **Biggest Movers** — centres that improved or declined most
5. **Action Items** — 3-5 specific recommendations for state managers

Keep it concise and actionable. Reference specific centre names and scores.`,
    },
    {
      slug: "board-reports/auto-draft",
      name: "Board Report Auto-Draft",
      model: "claude-sonnet-4-5-20250514",
      maxTokens: 2048,
      variables: JSON.stringify(["month", "year", "financialData", "operationsData", "complianceData", "growthData", "peopleData", "rocksData"]),
      promptTemplate: `Generate a complete monthly board report for Amana OSHC.

Month: {{month}} {{year}}

Financial: {{financialData}}
Operations: {{operationsData}}
Compliance: {{complianceData}}
Growth/Pipeline: {{growthData}}
People: {{peopleData}}
Rocks: {{rocksData}}

Write the complete report with these sections:
1. **Executive Summary** (3-4 sentences)
2. **Financial Performance** (2-3 paragraphs)
3. **Operations & Occupancy** (2-3 paragraphs)
4. **Compliance Status** (1-2 paragraphs)
5. **Growth & Pipeline** (1-2 paragraphs)
6. **People & Culture** (1-2 paragraphs)
7. **Strategic Priorities (Rocks)** (1-2 paragraphs)
8. **Items for Board Attention** (bullet list)

Use flowing prose, not bullet points (except section 8). Vary paragraph openings. Be data-driven and cite specific numbers.`,
    },
    {
      slug: "tickets/response-drafter",
      name: "Ticket Response Drafter",
      model: "claude-sonnet-4-5-20250514",
      maxTokens: 512,
      variables: JSON.stringify(["ticketSubject", "messageHistory", "ticketPriority", "serviceName"]),
      promptTemplate: `Draft a professional support response for this parent/staff ticket at Amana OSHC.

Subject: {{ticketSubject}}
Priority: {{ticketPriority}}
Centre: {{serviceName}}
Conversation history:
{{messageHistory}}

Write a helpful, empathetic response that:
- Acknowledges their concern
- Provides a clear answer or next steps
- Maintains a warm, professional tone appropriate for a childcare service
- Keeps it concise (under 150 words)
- Does not make promises about timelines unless explicitly stated in the history`,
    },
    {
      slug: "recruitment/job-ad",
      name: "Job Ad Generator",
      model: "claude-sonnet-4-5-20250514",
      maxTokens: 1024,
      variables: JSON.stringify(["roleTitle", "serviceLocation", "employmentType", "qualifications", "serviceName"]),
      promptTemplate: `Write a job advertisement for Amana OSHC.

Role: {{roleTitle}}
Centre: {{serviceName}}
Location: {{serviceLocation}}
Employment type: {{employmentType}}
Required qualifications: {{qualifications}}

Structure:
1. **Engaging opening** — why work at Amana OSHC (mission-driven, growth company, supportive team)
2. **About the role** — day-to-day responsibilities (3-5 bullet points)
3. **About you** — qualifications and attributes we're looking for
4. **What we offer** — benefits (above-award rates, professional development, team culture)
5. **How to apply** — simple call-to-action

Tone: Professional but warm, reflecting our values of quality care and community. Suitable for SEEK/Indeed. Include relevant Australian childcare sector terminology.`,
    },
    {
      slug: "hr/leave-impact",
      name: "Leave Impact Analysis",
      model: "claude-haiku-3.5-20241022",
      maxTokens: 600,
      variables: JSON.stringify(["staffName", "leaveType", "startDate", "endDate", "totalDays", "centreName", "reason"]),
      promptTemplate: `You are a staffing operations assistant for Amana OSHC. Analyse the impact of this leave request on centre operations.

Staff member: {{staffName}}
Leave type: {{leaveType}}
Dates: {{startDate}} to {{endDate}} ({{totalDays}} days)
Centre: {{centreName}}
Reason: {{reason}}

Provide a brief impact assessment:

1. **Coverage Risk** — Is this during peak days (Mon-Fri school terms)? How many days need coverage?
2. **Staffing Gap** — Will the centre likely be short-staffed? Consider ratio requirements for OSHC (1:15 for school-age).
3. **Recommendations** — Suggest actions (e.g., arrange relief staff, adjust roster, check with nearby centres for float staff)
4. **Approval Suggestion** — Based on timing and type, recommend approve/review/flag

Keep it concise (under 150 words). Use bullet points.`,
    },
    {
      slug: "holiday-quest/day-planner",
      name: "Vacation Care Day Planner",
      model: "claude-sonnet-4-5-20250514",
      maxTokens: 1024,
      variables: JSON.stringify(["weekTheme", "dayOfWeek", "serviceName", "existingDays", "ageRange", "budget"]),
      promptTemplate: `Plan a vacation care day for Amana OSHC.

Week theme: {{weekTheme}}
Day: {{dayOfWeek}}
Centre: {{serviceName}}
Other days already planned: {{existingDays}}
Age range: {{ageRange}}
Budget per child: {{budget}}

Provide:
- **Day theme**: Specific sub-theme that fits the weekly theme
- **Morning activity** (10am-12pm): Detailed activity with materials
- **Afternoon activity** (1pm-3pm): Detailed activity with materials
- **Excursion suggestion** (optional): If suitable, suggest an excursion with venue, estimated cost, and transport needs
- **Dietary considerations**: Suggested lunch theme to match the day
- **Materials list**: Everything needed for the day
- **Risk considerations**: Any safety notes for the planned activities

Make it exciting and age-appropriate. Avoid repeating activities from other planned days.`,
    },
    {
      slug: "meetings/l10-prep",
      name: "L10 Meeting Prep Agent",
      model: "claude-sonnet-4-5-20250514",
      maxTokens: 1500,
      variables: JSON.stringify(["overdueTodos", "offTrackRocks", "scorecardMisses", "openIssues", "recentUpdates"]),
      promptTemplate: `Generate an L10 meeting pre-read document for Amana OSHC leadership.

Overdue todos:
{{overdueTodos}}

Off-track rocks:
{{offTrackRocks}}

Scorecard misses (below goal):
{{scorecardMisses}}

Top open issues:
{{openIssues}}

Recent updates:
{{recentUpdates}}

Structure the pre-read as:
1. **Scorecard Flash** — quick summary of what's on/off track
2. **Rock Review** — status of each rock with recommended discussion points
3. **To-Do Review** — overdue items that need follow-up
4. **Issues to IDS** — prioritised list of issues for Identify-Discuss-Solve
5. **Wins & Headlines** — any positive news or milestones

Keep it scannable with bullet points. This should take <5 minutes to read.`,
    },
    {
      slug: "scorecard/narrative",
      name: "Scorecard Narrative Generator",
      model: "claude-sonnet-4-5-20250514",
      maxTokens: 512,
      variables: JSON.stringify(["measurables", "weekNumber", "trends"]),
      promptTemplate: `Generate a brief scorecard narrative summary for the Amana OSHC leadership team.

Week: {{weekNumber}}
Measurables and their status:
{{measurables}}

Trends (last 4 weeks):
{{trends}}

Write 2-3 concise paragraphs suitable for reading aloud at the start of an L10 meeting:
- Which measurables hit their goals
- Which missed and by how much
- Any concerning trends (3+ weeks declining)
- One positive callout

Keep it factual and under 150 words.`,
    },
    {
      slug: "queue/report-summary",
      name: "Queue Report Summariser",
      model: "claude-haiku-4-5-20251001",
      maxTokens: 256,
      variables: JSON.stringify(["reportTitle", "reportContent", "reportAlerts", "reportMetrics"]),
      promptTemplate: `Generate a TL;DR summary (2-3 sentences) for this automation report.

Title: {{reportTitle}}
Content: {{reportContent}}
Alerts: {{reportAlerts}}
Metrics: {{reportMetrics}}

Focus on: what happened, what needs attention, and any recommended actions. Be extremely concise.`,
    },
    {
      slug: "assistant/tool-calling",
      name: "AI Assistant System Prompt",
      model: "claude-sonnet-4-5-20250514",
      maxTokens: 2048,
      variables: JSON.stringify(["dashboardContext"]),
      promptTemplate: `You have access to live Amana OSHC dashboard data. Use it to answer questions accurately.

Current dashboard state:
{{dashboardContext}}

Answer the user's question using this data. If the data doesn't contain what they need, say so clearly.`,
    },
  ];

  for (const tpl of aiTemplates) {
    await prisma.aiPromptTemplate.upsert({
      where: { slug: tpl.slug },
      update: {
        name: tpl.name,
        model: tpl.model,
        maxTokens: tpl.maxTokens,
        promptTemplate: tpl.promptTemplate,
        variables: JSON.parse(tpl.variables),
      },
      create: {
        slug: tpl.slug,
        name: tpl.name,
        model: tpl.model,
        maxTokens: tpl.maxTokens,
        promptTemplate: tpl.promptTemplate,
        variables: JSON.parse(tpl.variables),
      },
    });
  }
  console.log(`Seeded ${aiTemplates.length} AI prompt templates`);

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
