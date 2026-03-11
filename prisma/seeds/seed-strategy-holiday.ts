import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Strategy + Holiday Quest data...");

  // ── Get admin user and services ─────────────────────────────────────────
  const admin = await prisma.user.findFirst({ where: { role: "owner" } });
  if (!admin) throw new Error("No owner user found — run main seed first");

  const services = await prisma.service.findMany({
    where: { status: "active" },
    select: { id: true, name: true, code: true, capacity: true },
  });
  if (services.length === 0) throw new Error("No active services found — run main seed first");

  console.log(`Found ${services.length} active services`);

  // ══════════════════════════════════════════════════════════════════════════
  // 1. SCENARIOS — What-if financial projections
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n── Seeding Scenarios ──");

  const scenarios = [
    {
      name: "Base Case — 11 Centres FY26",
      description: "Current trajectory with existing centres and moderate growth assumptions",
      inputs: {
        centres: 11,
        avgEnrolledASC: 38,
        avgEnrolledBSC: 8,
        ascFeeRegular: 36,
        bscFeeRegular: 26,
        avgDaysPerWeek: 3.5,
        operatingWeeks: 40,
        staffCostPercent: 55,
        overheadPercent: 18,
        ccsRate: 0.75,
      },
      outputs: {
        annualRevenue: 4_752_000,
        staffCosts: 2_613_600,
        overhead: 855_360,
        netProfit: 1_283_040,
        margin: 27,
        revenuePerCentre: 432_000,
        ebidta: 1_425_600,
        valuation: 7_128_000,
      },
    },
    {
      name: "Growth Case — 15 Centres FY27",
      description: "Expansion to 15 centres with Melbourne launch fully operational",
      inputs: {
        centres: 15,
        avgEnrolledASC: 42,
        avgEnrolledBSC: 12,
        ascFeeRegular: 38,
        bscFeeRegular: 28,
        avgDaysPerWeek: 3.8,
        operatingWeeks: 40,
        staffCostPercent: 52,
        overheadPercent: 16,
        ccsRate: 0.78,
      },
      outputs: {
        annualRevenue: 7_920_000,
        staffCosts: 4_118_400,
        overhead: 1_267_200,
        netProfit: 2_534_400,
        margin: 32,
        revenuePerCentre: 528_000,
        ebidta: 2_851_200,
        valuation: 14_256_000,
      },
    },
    {
      name: "Bull Case — 20 Centres + BSC Push",
      description: "Aggressive expansion with strong BSC growth driving revenue per centre up",
      inputs: {
        centres: 20,
        avgEnrolledASC: 45,
        avgEnrolledBSC: 18,
        ascFeeRegular: 40,
        bscFeeRegular: 30,
        avgDaysPerWeek: 4.0,
        operatingWeeks: 40,
        staffCostPercent: 50,
        overheadPercent: 15,
        ccsRate: 0.80,
      },
      outputs: {
        annualRevenue: 12_480_000,
        staffCosts: 6_240_000,
        overhead: 1_872_000,
        netProfit: 4_368_000,
        margin: 35,
        revenuePerCentre: 624_000,
        ebidta: 4_992_000,
        valuation: 24_960_000,
      },
    },
    {
      name: "Downside — Regulatory Fee Cap",
      description: "Government fee cap scenario limiting hourly rate increases",
      inputs: {
        centres: 11,
        avgEnrolledASC: 35,
        avgEnrolledBSC: 6,
        ascFeeRegular: 32,
        bscFeeRegular: 22,
        avgDaysPerWeek: 3.2,
        operatingWeeks: 40,
        staffCostPercent: 58,
        overheadPercent: 20,
        ccsRate: 0.70,
      },
      outputs: {
        annualRevenue: 3_484_800,
        staffCosts: 2_021_184,
        overhead: 696_960,
        netProfit: 766_656,
        margin: 22,
        revenuePerCentre: 316_800,
        ebidta: 940_800,
        valuation: 4_704_000,
      },
    },
  ];

  for (const s of scenarios) {
    const existing = await prisma.scenario.findFirst({
      where: { name: s.name, createdById: admin.id },
    });
    if (existing) {
      await prisma.scenario.update({
        where: { id: existing.id },
        data: { description: s.description, inputs: s.inputs, outputs: s.outputs },
      });
      console.log(`  Updated: ${s.name}`);
    } else {
      await prisma.scenario.create({
        data: {
          name: s.name,
          description: s.description,
          inputs: s.inputs,
          outputs: s.outputs,
          createdById: admin.id,
        },
      });
      console.log(`  Created: ${s.name}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 2. BOARD REPORTS — Monthly reports
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n── Seeding Board Reports ──");

  const boardReports = [
    {
      month: 1,
      year: 2026,
      status: "final" as const,
      executiveSummary:
        "Strong start to the year. Network-wide ASC enrolments reached 210 (target: 220). Melbourne centres progressing well through launch phase. Revenue tracking 5% above budget.",
      financialNarrative:
        "January revenue of $412K against budget of $392K (+5.1%). Staff costs at 54% of revenue, below 55% target. EBITDA margin of 28%. Cash reserves healthy at $320K.",
      operationsNarrative:
        "All centres operational with full staff complement. Two minor incidents reported — both resolved same day. Menu compliance at 100%. Attendance data syncing reliably from OWNA.",
      complianceNarrative:
        "All WWCC and First Aid certifications current. Two staff members completing Certificate III upgrades. QIP reviews scheduled for Q2.",
      growthNarrative:
        "BSC pilot showing promise — 12 enrolments across 3 centres (from 0 in Dec). Melbourne VIC centres at 65% of launch targets. Enquiry pipeline strong with 45 active leads.",
      peopleNarrative:
        "Staff retention at 92%. One new coordinator hired for Minaret Springvale. Training completion rate at 88% across the network.",
      rocksNarrative:
        "Q1 rocks on track: Melbourne launch (green), BSC growth initiative (yellow — needs push), compliance audit framework (green), parent NPS survey (green).",
      data: {
        totalRevenue: 412000,
        budgetRevenue: 392000,
        totalCentres: 11,
        activeCentres: 11,
        totalEnrolments: 210,
        staffCount: 48,
        parentNps: 62,
      },
    },
    {
      month: 2,
      year: 2026,
      status: "final" as const,
      executiveSummary:
        "February delivered record weekly attendances. BSC enrolments doubled to 24. Parent NPS improved to 65. On track for strongest Q1 in company history.",
      financialNarrative:
        "Revenue $428K vs budget $405K (+5.7%). Cumulative YTD revenue $840K. Staff costs steady at 53.5%. Cash position improved to $345K.",
      operationsNarrative:
        "Average weekly attendance hit 1,850 (target: 2,000). All centres maintaining NQS compliance. Holiday Quest planning underway for April school holidays.",
      complianceNarrative:
        "Audit template system deployed. First round of self-assessments completed at 4 centres. No compliance gaps identified.",
      growthNarrative:
        "BSC enrolments doubled from 12 to 24. VIC launch centres now at 78% of targets. 52 active enquiries in pipeline. Referral program generating 15% of new leads.",
      peopleNarrative:
        "Full staffing maintained. LMS rollout progressing — 65% of staff have completed onboarding modules. Two educators promoted to senior roles.",
      rocksNarrative:
        "All Q1 rocks on track. BSC growth rock upgraded to green after February push.",
      data: {
        totalRevenue: 428000,
        budgetRevenue: 405000,
        totalCentres: 11,
        activeCentres: 11,
        totalEnrolments: 224,
        staffCount: 48,
        parentNps: 65,
      },
    },
    {
      month: 3,
      year: 2026,
      status: "draft" as const,
      executiveSummary:
        "March wrapping up Q1 strongly. Network on pace for $1.26M quarter. Board review and exit readiness assessment recommended for Q2.",
      financialNarrative:
        "March forecast revenue $435K. Q1 total projected at $1.275M vs budget $1.2M (+6.3%). Strong margin improvement driven by operating leverage.",
      operationsNarrative:
        "All centres fully operational. Holiday Quest vacation care programmes published for April. Booking forecasts showing strong demand for holiday programme.",
      complianceNarrative:
        "Q1 compliance audit round complete. 100% pass rate. Two minor recommendations being actioned.",
      growthNarrative:
        "BSC at 30 enrolments. Q2 target set at 50. Two new school partnership discussions in progress (potential centres 12 and 13).",
      peopleNarrative:
        "Staff satisfaction survey completed. 87% positive response rate. Three new hires onboarding for Q2 expansion preparation.",
      rocksNarrative:
        "Q1 rocks review scheduled for L10. All rocks tracking green. Q2 rock setting in progress.",
      data: {
        totalRevenue: 435000,
        budgetRevenue: 418000,
        totalCentres: 11,
        activeCentres: 11,
        totalEnrolments: 232,
        staffCount: 51,
        parentNps: 66,
      },
    },
  ];

  for (const r of boardReports) {
    const existing = await prisma.boardReport.findFirst({
      where: { month: r.month, year: r.year },
    });
    if (existing) {
      await prisma.boardReport.update({
        where: { id: existing.id },
        data: {
          status: r.status,
          executiveSummary: r.executiveSummary,
          financialNarrative: r.financialNarrative,
          operationsNarrative: r.operationsNarrative,
          complianceNarrative: r.complianceNarrative,
          growthNarrative: r.growthNarrative,
          peopleNarrative: r.peopleNarrative,
          rocksNarrative: r.rocksNarrative,
          data: r.data,
        },
      });
      console.log(`  Updated: ${r.year}-${String(r.month).padStart(2, "0")}`);
    } else {
      await prisma.boardReport.create({
        data: {
          month: r.month,
          year: r.year,
          status: r.status,
          executiveSummary: r.executiveSummary,
          financialNarrative: r.financialNarrative,
          operationsNarrative: r.operationsNarrative,
          complianceNarrative: r.complianceNarrative,
          growthNarrative: r.growthNarrative,
          peopleNarrative: r.peopleNarrative,
          rocksNarrative: r.rocksNarrative,
          data: r.data,
        },
      });
      console.log(`  Created: ${r.year}-${String(r.month).padStart(2, "0")}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 3. HOLIDAY QUEST DAYS — Vacation care programmes
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n── Seeding Holiday Quest Days ──");

  // Use first 4 active services for holiday quest seed
  const hqServices = services.slice(0, 4);
  const aprilHolidayStart = new Date("2026-04-13"); // School holiday start

  const holidayThemes = [
    {
      theme: "Space Explorers",
      morningActivity: "Build and launch model rockets, create planet dioramas, and design astronaut helmets from recycled materials.",
      afternoonActivity: "Space movie afternoon with DIY freeze-dried snack station and galaxy slime making.",
      isExcursion: false,
      materialsNeeded: "Cardboard tubes, paint, foam balls, PVA glue, glitter, slime ingredients",
      dietaryNotes: "Allergen-free snacks provided. Parents to advise of specific dietary requirements.",
    },
    {
      theme: "Master Chef Junior",
      morningActivity: "Cooking workshop: make pizzas from scratch, decorate cupcakes, learn knife safety and food hygiene basics.",
      afternoonActivity: "MasterChef elimination challenge — teams compete to create the best healthy snack plate. Judging and prizes.",
      isExcursion: false,
      materialsNeeded: "Pizza dough, toppings, cupcake mix, icing, fresh vegetables, fruit",
      dietaryNotes: "Halal-only ingredients. Nut-free facility. Gluten-free options available on request.",
    },
    {
      theme: "Adventure Park Excursion",
      morningActivity: "Bus trip to TreeTop Adventure Park. Guided high ropes course and nature trail walk.",
      afternoonActivity: "Picnic lunch at the park followed by team building games and scavenger hunt.",
      isExcursion: true,
      excursionVenue: "TreeTop Adventure Park",
      excursionCost: 25.0,
      materialsNeeded: "Permission slips, first aid kits, sunscreen, water bottles, packed lunches",
      dietaryNotes: "BYO lunch. Centre provides halal snacks and water.",
    },
    {
      theme: "Art Attack",
      morningActivity: "Canvas painting workshop with local artist. Learn techniques like splatter art, watercolour, and stencilling.",
      afternoonActivity: "Collaborative mural painting for the centre. Tie-dye t-shirt workshop.",
      isExcursion: false,
      materialsNeeded: "Canvas boards, acrylic paint, brushes, plain white t-shirts, tie-dye kits, drop sheets",
      dietaryNotes: "Standard halal afternoon tea provided.",
    },
    {
      theme: "Sports Carnival",
      morningActivity: "Build Alpha Kids sports program — soccer, basketball, and athletics skill stations with qualified coaches.",
      afternoonActivity: "Inter-team relay races, tug of war, and medal ceremony. Cool-down yoga session.",
      isExcursion: false,
      materialsNeeded: "Sports equipment, medals, certificates, cones, team bibs",
      dietaryNotes: "Extra water and electrolyte drinks. Fruit platters for afternoon tea.",
    },
    {
      theme: "Science Lab",
      morningActivity: "Hands-on experiments: volcano eruptions, slime chemistry, crystal growing, and static electricity demos.",
      afternoonActivity: "Build bridges from popsicle sticks (engineering challenge). Paper airplane distance competition.",
      isExcursion: false,
      materialsNeeded: "Baking soda, vinegar, food colouring, popsicle sticks, PVA glue, borax, paper",
      dietaryNotes: "Standard halal afternoon tea. No food experiments today due to lab materials.",
    },
    {
      theme: "Movie & Chill Day",
      morningActivity: "Board games tournament, card games, and indoor fort building. Colouring competition.",
      afternoonActivity: "Movie screening with popcorn and cushion cinema setup. Quiet craft table available.",
      isExcursion: false,
      materialsNeeded: "Board games, playing cards, blankets, cushions, popcorn, projector",
      dietaryNotes: "Halal popcorn and drinks provided. Allergen-free snack alternatives available.",
    },
    {
      theme: "Outdoor Adventures",
      morningActivity: "Nature walk and bush tucker identification. Leaf rubbing art and nature journaling.",
      afternoonActivity: "Orienteering challenge around the school grounds. Team campfire songs (no actual fire — LED candles).",
      isExcursion: false,
      materialsNeeded: "Clipboards, pencils, magnifying glasses, nature guides, LED candles",
      dietaryNotes: "Trail mix and fruit for morning tea. Standard halal afternoon tea.",
    },
    {
      theme: "STEM Robotics",
      morningActivity: "Intro to coding with Scratch Jr on tablets. Build simple robots from LEGO Technic kits.",
      afternoonActivity: "Robot obstacle course race. Coding challenge — make your character dance!",
      isExcursion: false,
      materialsNeeded: "Tablets (10x), LEGO Technic kits, obstacle course materials",
      dietaryNotes: "Standard halal afternoon tea provided.",
    },
    {
      theme: "Water Fun Day",
      morningActivity: "Water balloon relay races, sponge toss, and slip-and-slide on the oval.",
      afternoonActivity: "Bubble station mega bubbles, water painting on concrete, and ice block making.",
      isExcursion: false,
      materialsNeeded: "Water balloons, sponges, slip-and-slide, bubble wands, ice block moulds, towels",
      dietaryNotes: "Extra water provided. Parents to pack spare clothes and towel. Sunscreen mandatory.",
    },
  ];

  for (const svc of hqServices) {
    for (let dayOffset = 0; dayOffset < 10; dayOffset++) {
      const date = new Date(aprilHolidayStart);
      date.setDate(date.getDate() + dayOffset);

      // Skip weekends
      if (date.getDay() === 0 || date.getDay() === 6) continue;

      const theme = holidayThemes[dayOffset % holidayThemes.length];
      const capacity = svc.capacity || 40;
      const bookings = Math.floor(Math.random() * (capacity * 0.7)) + Math.floor(capacity * 0.2);

      const existing = await prisma.holidayQuestDay.findFirst({
        where: { serviceId: svc.id, date },
      });

      const data = {
        serviceId: svc.id,
        date,
        theme: theme.theme,
        morningActivity: theme.morningActivity,
        afternoonActivity: theme.afternoonActivity,
        isExcursion: theme.isExcursion,
        excursionVenue: theme.isExcursion ? (theme as any).excursionVenue : null,
        excursionCost: theme.isExcursion ? (theme as any).excursionCost : null,
        materialsNeeded: theme.materialsNeeded,
        dietaryNotes: theme.dietaryNotes,
        maxCapacity: capacity,
        currentBookings: bookings,
        status: dayOffset < 5 ? "published" : "draft",
      };

      if (existing) {
        await prisma.holidayQuestDay.update({ where: { id: existing.id }, data });
      } else {
        await prisma.holidayQuestDay.create({ data });
      }
    }
    console.log(`  Seeded Holiday Quest for: ${svc.name}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 4. CENTRE METRICS — for Data Room completeness scoring
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n── Seeding Centre Metrics (for Data Room) ──");

  const nqsRatings = ["Exceeding", "Meeting", "Meeting", "Working Towards", "Meeting"];

  for (let i = 0; i < services.length; i++) {
    const svc = services[i];
    const existing = await prisma.centreMetrics.findFirst({
      where: { serviceId: svc.id },
      orderBy: { recordedAt: "desc" },
    });

    if (existing) {
      console.log(`  Skipped (exists): ${svc.name}`);
      continue;
    }

    await prisma.centreMetrics.create({
      data: {
        serviceId: svc.id,
        bscCapacity: 20,
        ascCapacity: svc.capacity || 45,
        bscOccupancy: 15 + Math.random() * 50,
        ascOccupancy: 60 + Math.random() * 35,
        totalEducators: 3 + Math.floor(Math.random() * 3),
        educatorsTurnover: Math.random() * 15,
        ratioCompliance: 95 + Math.random() * 5,
        parentNps: 55 + Math.random() * 25,
        incidentCount: Math.floor(Math.random() * 3),
        complaintCount: Math.floor(Math.random() * 2),
        wwccCompliance: 100,
        firstAidCompliance: 90 + Math.random() * 10,
        overallCompliance: 88 + Math.random() * 12,
        nqsRating: nqsRatings[i % nqsRatings.length],
      },
    });
    console.log(`  Created metrics: ${svc.name}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 5. DOCUMENTS — Seed some documents for Data Room
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n── Seeding Documents (for Data Room) ──");

  const docs = [
    { title: "Amana OSHC Business Plan 2026", category: "other" as const, description: "3-year strategic plan including growth targets and financial projections" },
    { title: "OSHC Service Agreement Template", category: "template" as const, description: "Standard LOI and service agreement for school partnerships" },
    { title: "Staff Handbook v4.2", category: "hr" as const, description: "Employee policies, code of conduct, and operational procedures" },
    { title: "Quality Improvement Plan (QIP) — Network", category: "compliance" as const, description: "Network-wide quality improvement plan aligned to NQF standards" },
    { title: "Risk Management Framework", category: "compliance" as const, description: "Enterprise risk register and mitigation strategies" },
    { title: "Marketing Strategy FY26", category: "marketing" as const, description: "Digital marketing, school partnerships, and referral program strategy" },
    { title: "Financial Model — 5 Year Forecast", category: "financial" as const, description: "DCF model with revenue, cost, and valuation projections" },
    { title: "Insurance Certificate of Currency", category: "compliance" as const, description: "Public liability, professional indemnity, and workers compensation certificates" },
    { title: "Centre Setup Checklist", category: "procedure" as const, description: "Standard checklist for new centre launches" },
    { title: "Parent Information Pack", category: "marketing" as const, description: "Welcome pack for new families including fees, policies, and FAQs" },
  ];

  for (const doc of docs) {
    const existing = await prisma.document.findFirst({
      where: { title: doc.title, deleted: false },
    });
    if (existing) {
      console.log(`  Skipped (exists): ${doc.title}`);
      continue;
    }
    const fileName = `${doc.title.replace(/\s+/g, "-").toLowerCase()}.pdf`;
    await prisma.document.create({
      data: {
        title: doc.title,
        category: doc.category,
        description: doc.description,
        uploadedById: admin.id,
        fileName,
        fileUrl: `https://placeholder.amanaoshc.com.au/documents/${doc.category}/${fileName}`,
        mimeType: "application/pdf",
        fileSize: 100000 + Math.floor(Math.random() * 500000),
      },
    });
    console.log(`  Created: ${doc.title}`);
  }

  console.log("\nDone — Strategy + Holiday Quest data seeded.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
