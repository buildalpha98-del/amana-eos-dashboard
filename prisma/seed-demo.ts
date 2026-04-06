/**
 * Demo data seed — populates realistic operational data for the Amana OSHC dashboard.
 * Run with: npx tsx prisma/seed-demo.ts
 *
 * Prerequisites: Run the main seed first (npx prisma db seed).
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function main() {
  console.log("🌱 Seeding demo data...\n");

  // ── Fetch existing users and services ──────────────────────
  const jayden = await prisma.user.findUnique({ where: { email: "jayden@amanaoshc.com.au" } });
  const daniel = await prisma.user.findUnique({ where: { email: "daniel@amanaoshc.com.au" } });
  const mirna = await prisma.user.findUnique({ where: { email: "mirna@amanaoshc.com.au" } });
  const tracie = await prisma.user.findUnique({ where: { email: "tracie@amanaoshc.com.au" } });
  const akram = await prisma.user.findUnique({ where: { email: "akram@amanaoshc.com.au" } });

  if (!jayden || !daniel || !mirna || !tracie || !akram) {
    throw new Error("Run the main seed first (npx prisma db seed)");
  }

  const services = await prisma.service.findMany({ where: { status: "active" } });
  if (services.length === 0) throw new Error("No active services found");

  const nswServices = services.filter((s) => s.state === "NSW");
  const vicServices = services.filter((s) => s.state === "VIC");
  const mfisBH = services.find((s) => s.code === "MFIS-BH")!;
  const mfisGA = services.find((s) => s.code === "MFIS-GA")!;
  const ug = services.find((s) => s.code === "UG")!;
  const atc = services.find((s) => s.code === "ATC")!;

  const thisMonday = getMonday(new Date());
  const lastMonday = getMonday(daysAgo(7));
  const twoWeeksAgo = getMonday(daysAgo(14));

  // ── 1. ROCKS (Q2 2026) ────────────────────────────────────
  console.log("Creating rocks...");

  const rocks = await Promise.all([
    prisma.rock.create({
      data: {
        title: "Launch BSC program at 3 new NSW schools",
        description: "Secure LOIs, hire coordinators, and launch BSC at Arkana, Unity Grammar extension, and MFIS Hoxton Park expansion.",
        ownerId: jayden.id,
        quarter: "2026-Q2",
        status: "on_track",
        percentComplete: 35,
        priority: "critical",
        rockType: "company",
      },
    }),
    prisma.rock.create({
      data: {
        title: "Implement parent satisfaction survey system",
        description: "Deploy NPS surveys at all centres via the parent portal. Target: 200+ responses by end of quarter.",
        ownerId: daniel.id,
        quarter: "2026-Q2",
        status: "on_track",
        percentComplete: 60,
        priority: "high",
        rockType: "company",
      },
    }),
    prisma.rock.create({
      data: {
        title: "Achieve 85% ASC occupancy across NSW centres",
        description: "Focus on MFIS Beaumont Hills and Unity Grammar where ASC utilisation is below 70%.",
        ownerId: mirna.id,
        quarter: "2026-Q2",
        status: "off_track",
        percentComplete: 45,
        priority: "critical",
        rockType: "company",
        serviceId: mfisBH.id,
      },
    }),
    prisma.rock.create({
      data: {
        title: "Roll out Holiday Quest vacation care branding",
        description: "Rebrand all vacation care programs under Holiday Quest. Update signage, marketing materials, and parent portal.",
        ownerId: akram.id,
        quarter: "2026-Q2",
        status: "on_track",
        percentComplete: 75,
        priority: "high",
        rockType: "company",
      },
    }),
    prisma.rock.create({
      data: {
        title: "Complete WWCC and First Aid compliance for all VIC staff",
        description: "Audit all VIC centre staff credentials and schedule renewals. Zero compliance gaps by end of quarter.",
        ownerId: tracie.id,
        quarter: "2026-Q2",
        status: "on_track",
        percentComplete: 80,
        priority: "high",
        rockType: "company",
      },
    }),
    prisma.rock.create({
      data: {
        title: "Develop Amana OSHC educator handbook v2",
        description: "Updated policies, daily routines, behaviour management framework, and cultural sensitivity guidelines.",
        ownerId: daniel.id,
        quarter: "2026-Q2",
        status: "complete",
        percentComplete: 100,
        priority: "medium",
        rockType: "company",
      },
    }),
  ]);

  console.log(`  ✓ ${rocks.length} rocks created`);

  // ── 2. TODOS ──────────────────────────────────────────────
  console.log("Creating todos...");

  const todos = await Promise.all([
    // Active todos
    prisma.todo.create({
      data: {
        title: "Follow up with Arkana College principal re: LOI signing",
        assigneeId: jayden.id,
        createdById: jayden.id,
        serviceId: nswServices[0]?.id,
        rockId: rocks[0].id,
        dueDate: daysFromNow(3),
        weekOf: thisMonday,
        status: "pending",
      },
    }),
    prisma.todo.create({
      data: {
        title: "Review MFIS Beaumont Hills enrolment numbers for ASC",
        assigneeId: mirna.id,
        createdById: jayden.id,
        serviceId: mfisBH.id,
        dueDate: daysFromNow(2),
        weekOf: thisMonday,
        status: "in_progress",
      },
    }),
    prisma.todo.create({
      data: {
        title: "Design parent NPS survey email template",
        assigneeId: akram.id,
        createdById: daniel.id,
        rockId: rocks[1].id,
        dueDate: daysFromNow(5),
        weekOf: thisMonday,
        status: "pending",
      },
    }),
    prisma.todo.create({
      data: {
        title: "Prepare Holiday Quest flyers for Term 2 vacation care",
        assigneeId: akram.id,
        createdById: akram.id,
        rockId: rocks[3].id,
        dueDate: daysFromNow(7),
        weekOf: thisMonday,
        status: "in_progress",
      },
    }),
    prisma.todo.create({
      data: {
        title: "Audit VIC staff WWCC expiry dates",
        assigneeId: tracie.id,
        createdById: daniel.id,
        rockId: rocks[4].id,
        dueDate: daysFromNow(1),
        weekOf: thisMonday,
        status: "pending",
      },
    }),
    prisma.todo.create({
      data: {
        title: "Call Unity Grammar parents who haven't responded to enrolment offers",
        assigneeId: mirna.id,
        createdById: mirna.id,
        serviceId: ug.id,
        dueDate: daysFromNow(1),
        weekOf: thisMonday,
        status: "pending",
      },
    }),
    prisma.todo.create({
      data: {
        title: "Update Instagram content calendar for April",
        assigneeId: akram.id,
        createdById: akram.id,
        dueDate: daysFromNow(4),
        weekOf: thisMonday,
        status: "pending",
      },
    }),
    prisma.todo.create({
      data: {
        title: "Order new craft supplies for MFIS Greenacre",
        assigneeId: mirna.id,
        createdById: mirna.id,
        serviceId: mfisGA.id,
        dueDate: daysFromNow(3),
        weekOf: thisMonday,
        status: "pending",
      },
    }),
    // Completed last week
    prisma.todo.create({
      data: {
        title: "Submit educator handbook v2 for review",
        assigneeId: daniel.id,
        createdById: daniel.id,
        rockId: rocks[5].id,
        dueDate: daysAgo(2),
        weekOf: lastMonday,
        status: "complete",
        completedAt: daysAgo(1),
      },
    }),
    prisma.todo.create({
      data: {
        title: "Send welcome packs to 5 new MFIS-BH families",
        assigneeId: mirna.id,
        createdById: mirna.id,
        serviceId: mfisBH.id,
        dueDate: daysAgo(3),
        weekOf: lastMonday,
        status: "complete",
        completedAt: daysAgo(3),
      },
    }),
  ]);

  console.log(`  ✓ ${todos.length} todos created`);

  // ── 3. ISSUES ─────────────────────────────────────────────
  console.log("Creating issues...");

  const issues = await Promise.all([
    prisma.issue.create({
      data: {
        title: "BSC attendance dropping at Unity Grammar",
        description: "BSC numbers have fallen from 28 to 19 over the last 3 weeks. Parents report traffic and late pickup as concerns.",
        raisedById: mirna.id,
        ownerId: jayden.id,
        serviceId: ug.id,
        priority: "high",
        status: "in_discussion",
        category: "short_term",
      },
    }),
    prisma.issue.create({
      data: {
        title: "Educator shortage at ATC for Thursday/Friday",
        description: "Two educators on leave. Need casual relief or redistribution. Ratio compliance at risk.",
        raisedById: tracie.id,
        ownerId: tracie.id,
        serviceId: atc.id,
        priority: "critical",
        status: "open",
        category: "short_term",
      },
    }),
    prisma.issue.create({
      data: {
        title: "OWNA app sync delays — attendance not updating in real time",
        description: "Parents report 10-15 minute delay seeing sign-in confirmations. Investigating API polling frequency.",
        raisedById: daniel.id,
        ownerId: daniel.id,
        priority: "medium",
        status: "open",
        category: "long_term",
      },
    }),
    prisma.issue.create({
      data: {
        title: "Halal food supplier pricing increase — need alternative quotes",
        description: "Current supplier raising prices 15% from next term. Need to source 2-3 alternative quotes.",
        raisedById: mirna.id,
        ownerId: mirna.id,
        priority: "medium",
        status: "in_discussion",
        category: "short_term",
      },
    }),
    prisma.issue.create({
      data: {
        title: "Parent complaint about homework club quality at MFIS-GA",
        description: "Received formal complaint. Parent says homework club is unstructured and children aren't getting help. Needs investigation.",
        raisedById: mirna.id,
        ownerId: mirna.id,
        serviceId: mfisGA.id,
        priority: "high",
        status: "open",
        category: "short_term",
      },
    }),
    // Solved
    prisma.issue.create({
      data: {
        title: "Fire evacuation drill not completed at MFIS-BH in Q1",
        description: "Compliance gap identified during internal audit. Drill scheduled and completed.",
        raisedById: daniel.id,
        ownerId: mirna.id,
        serviceId: mfisBH.id,
        priority: "high",
        status: "solved",
        category: "short_term",
        resolution: "Drill completed on March 28. All staff and children participated. Report filed.",
        solvedAt: daysAgo(9),
      },
    }),
  ]);

  console.log(`  ✓ ${issues.length} issues created`);

  // ── 4. PARENT ENQUIRIES ───────────────────────────────────
  console.log("Creating parent enquiries...");

  const enquiries = await Promise.all([
    // Active pipeline
    prisma.parentEnquiry.create({
      data: {
        serviceId: mfisBH.id,
        parentName: "Fatima Al-Rashid",
        parentEmail: "fatima.alrashid@gmail.com",
        parentPhone: "0412 345 678",
        childName: "Yusuf",
        childAge: 7,
        channel: "website",
        parentDriver: "homework",
        stage: "nurturing",
        assigneeId: mirna.id,
        notes: "Interested in ASC homework club. Wants to visit.",
        nextActionDue: daysFromNow(2),
      },
    }),
    prisma.parentEnquiry.create({
      data: {
        serviceId: mfisBH.id,
        parentName: "Sarah Ibrahim",
        parentEmail: "sarah.ibrahim@outlook.com",
        parentPhone: "0423 456 789",
        childName: "Amira",
        childAge: 9,
        channel: "referral",
        parentDriver: "working_parent",
        stage: "form_started",
        formStarted: true,
        assigneeId: mirna.id,
        notes: "Referred by Fatima. Needs BSC and ASC Mon-Fri.",
      },
    }),
    prisma.parentEnquiry.create({
      data: {
        serviceId: ug.id,
        parentName: "Ahmed Hassan",
        parentEmail: "ahmed.hassan@yahoo.com",
        parentPhone: "0434 567 890",
        childrenDetails: [{ name: "Omar", age: 6 }, { name: "Layla", age: 8 }],
        channel: "walkin",
        parentDriver: "enrichment",
        stage: "info_sent",
        assigneeId: mirna.id,
        notes: "Walk-in at school pickup. Interested in Quran and sports programs.",
        nextActionDue: daysFromNow(1),
      },
    }),
    prisma.parentEnquiry.create({
      data: {
        serviceId: mfisGA.id,
        parentName: "Maryam Yilmaz",
        parentEmail: "maryam.y@gmail.com",
        parentPhone: "0445 678 901",
        childName: "Elif",
        childAge: 5,
        channel: "phone",
        parentDriver: "working_parent",
        stage: "new_enquiry",
        assigneeId: mirna.id,
        notes: "Called asking about kindy-age ASC availability.",
      },
    }),
    prisma.parentEnquiry.create({
      data: {
        serviceId: atc.id,
        parentName: "Nadia Chowdhury",
        parentEmail: "nadia.chowdhury@gmail.com",
        parentPhone: "0456 789 012",
        childName: "Zayn",
        childAge: 10,
        channel: "email",
        parentDriver: "quran",
        stage: "nurturing",
        assigneeId: tracie.id,
        notes: "Keen on Quran memorisation program in ASC.",
        nextActionDue: daysFromNow(3),
      },
    }),
    prisma.parentEnquiry.create({
      data: {
        serviceId: mfisBH.id,
        parentName: "Hana Mansour",
        parentEmail: "hana.mansour@hotmail.com",
        parentPhone: "0467 890 123",
        childName: "Adam",
        childAge: 8,
        channel: "website",
        parentDriver: "sports",
        stage: "enrolled",
        formStarted: true,
        formCompleted: true,
        assigneeId: mirna.id,
        notes: "Enrolled! Starting next Monday.",
        firstSessionDate: daysFromNow(1),
      },
    }),
    // Cold / lost
    prisma.parentEnquiry.create({
      data: {
        serviceId: ug.id,
        parentName: "Karim Elmasri",
        parentEmail: "karim.e@gmail.com",
        parentPhone: "0478 901 234",
        childName: "Rania",
        childAge: 7,
        channel: "phone",
        stage: "cold",
        notes: "No response after 3 follow-ups. Marked cold.",
      },
    }),
    prisma.parentEnquiry.create({
      data: {
        serviceId: mfisGA.id,
        parentName: "Aisha Rahman",
        parentEmail: "aisha.r@outlook.com",
        parentPhone: "0489 012 345",
        childName: "Bilal",
        childAge: 6,
        channel: "whatsapp",
        parentDriver: "traffic",
        stage: "nurturing",
        assigneeId: mirna.id,
        notes: "Lives close to school, traffic is main concern. Needs ASC only.",
        nextActionDue: daysFromNow(4),
      },
    }),
  ]);

  console.log(`  ✓ ${enquiries.length} parent enquiries created`);

  // ── 5. SCORECARD ENTRIES (last 4 weeks) ───────────────────
  console.log("Creating scorecard entries...");

  const measurables = await prisma.measurable.findMany();
  let entryCount = 0;

  // Sample data for last 4 weeks
  const weeklyData: Record<string, number[]> = {
    "Total ASC enrolments (all centres)": [512, 520, 528, 535],
    "BSC attendance rate":                [72, 74, 71, 76],
    "Weekly revenue (all centres)":       [31200, 32800, 33100, 34500],
    "Staff-to-child ratio compliance":    [100, 100, 98, 100],
    "Parent NPS score":                   [58, 60, 62, 63],
    "New centre pipeline (LOIs signed)":  [1, 1, 2, 2],
    "Educator retention rate (quarterly)":[92, 92, 91, 91],
  };

  for (const m of measurables) {
    const values = weeklyData[m.title];
    if (!values) continue;

    const weeks = [
      getMonday(daysAgo(21)),
      getMonday(daysAgo(14)),
      getMonday(daysAgo(7)),
      thisMonday,
    ];

    for (let i = 0; i < 4; i++) {
      await prisma.measurableEntry.upsert({
        where: {
          measurableId_weekOf: {
            measurableId: m.id,
            weekOf: weeks[i],
          },
        },
        update: { value: values[i], onTrack: values[i] >= m.goalValue },
        create: {
          measurableId: m.id,
          weekOf: weeks[i],
          value: values[i],
          onTrack: m.goalDirection === "above"
            ? values[i] >= m.goalValue
            : m.goalDirection === "below"
            ? values[i] <= m.goalValue
            : values[i] === m.goalValue,
          enteredById: jayden.id,
        },
      });
      entryCount++;
    }
  }

  console.log(`  ✓ ${entryCount} scorecard entries created`);

  // ── 6. CHILDREN + ENROLMENTS ──────────────────────────────
  console.log("Creating children...");

  const childrenData = [
    {
      firstName: "Yusuf", surname: "Al-Rashid", dob: new Date("2019-03-15"), gender: "Male",
      serviceId: mfisBH.id, schoolName: "MFIS Beaumont Hills", yearLevel: "Year 2",
      medicalConditions: ["Asthma"], dietaryRequirements: ["Halal"],
      medicationDetails: "Ventolin inhaler as needed", anaphylaxisActionPlan: false,
      status: "active",
    },
    {
      firstName: "Amira", surname: "Ibrahim", dob: new Date("2017-08-22"), gender: "Female",
      serviceId: mfisBH.id, schoolName: "MFIS Beaumont Hills", yearLevel: "Year 4",
      medicalConditions: ["Anaphylaxis"], dietaryRequirements: ["Halal", "Nut Free"],
      medicationDetails: "EpiPen Jr in medical bag. Allergic to tree nuts and peanuts.",
      anaphylaxisActionPlan: true, status: "active",
    },
    {
      firstName: "Omar", surname: "Hassan", dob: new Date("2020-01-10"), gender: "Male",
      serviceId: ug.id, schoolName: "Unity Grammar", yearLevel: "Year 1",
      medicalConditions: [], dietaryRequirements: ["Halal"],
      status: "active",
    },
    {
      firstName: "Layla", surname: "Hassan", dob: new Date("2018-06-05"), gender: "Female",
      serviceId: ug.id, schoolName: "Unity Grammar", yearLevel: "Year 3",
      medicalConditions: ["ADHD"], dietaryRequirements: ["Halal"],
      medicationDetails: "No medication currently. Needs structured routine support.",
      status: "active",
    },
    {
      firstName: "Elif", surname: "Yilmaz", dob: new Date("2021-04-18"), gender: "Female",
      serviceId: mfisGA.id, schoolName: "MFIS Greenacre", yearLevel: "Kindy",
      medicalConditions: [], dietaryRequirements: ["Halal", "Egg Free"],
      status: "active",
    },
    {
      firstName: "Zayn", surname: "Chowdhury", dob: new Date("2016-11-30"), gender: "Male",
      serviceId: atc.id, schoolName: "Australian Turkish College", yearLevel: "Year 5",
      medicalConditions: ["Diabetes"], dietaryRequirements: ["Halal"],
      medicationDetails: "Type 1 diabetes. Insulin pump. Blood glucose monitor in bag. Staff trained.",
      status: "active",
    },
    {
      firstName: "Adam", surname: "Mansour", dob: new Date("2018-09-12"), gender: "Male",
      serviceId: mfisBH.id, schoolName: "MFIS Beaumont Hills", yearLevel: "Year 3",
      medicalConditions: [], dietaryRequirements: ["Halal"],
      status: "pending",
    },
    {
      firstName: "Khadija", surname: "Osman", dob: new Date("2019-07-25"), gender: "Female",
      serviceId: mfisBH.id, schoolName: "MFIS Beaumont Hills", yearLevel: "Year 2",
      medicalConditions: ["Epilepsy"], dietaryRequirements: ["Halal", "Gluten Free"],
      medicationDetails: "Midazolam nasal spray in medical bag. Seizure action plan on file.",
      anaphylaxisActionPlan: false, status: "active",
    },
    {
      firstName: "Ibrahim", surname: "Kaya", dob: new Date("2017-12-03"), gender: "Male",
      serviceId: atc.id, schoolName: "Australian Turkish College", yearLevel: "Year 4",
      medicalConditions: [], dietaryRequirements: ["Halal", "Dairy Free"],
      status: "active",
    },
    {
      firstName: "Maryam", surname: "Ali", dob: new Date("2020-02-14"), gender: "Female",
      serviceId: mfisGA.id, schoolName: "MFIS Greenacre", yearLevel: "Year 1",
      medicalConditions: ["Asthma", "Autism"], dietaryRequirements: ["Halal", "Vegetarian"],
      medicationDetails: "Ventolin as needed. Needs quiet space for sensory breaks.",
      additionalNeeds: "Autism spectrum — prefers visual schedule, advance notice of transitions.",
      status: "active",
    },
  ];

  const createdChildren = [];
  for (const c of childrenData) {
    const child = await prisma.child.create({ data: c });
    createdChildren.push(child);
  }

  console.log(`  ✓ ${createdChildren.length} children created`);

  // ── 7. ANNOUNCEMENTS ──────────────────────────────────────
  console.log("Creating announcements...");

  const announcements = await Promise.all([
    prisma.announcement.create({
      data: {
        title: "Term 2 Programming Update",
        body: "Hi team 👋\n\nTerm 2 programming is now live in the dashboard. Each centre has been assigned their weekly activities, menus, and special events.\n\nPlease review your centre's program by Friday and flag any issues.\n\nJazak Allahu Khairan,\nDaniel",
        authorId: daniel.id,
        audience: "all",
        priority: "normal",
        publishedAt: daysAgo(3),
      },
    }),
    prisma.announcement.create({
      data: {
        title: "⚠️ Staff Training Day — April 14th",
        body: "All educators are required to attend the professional development day on Monday April 14th.\n\nTopics:\n- Updated behaviour management framework\n- First Aid refresher\n- Cultural sensitivity workshop\n\nCentres will be closed for the day. Parents have been notified.",
        authorId: jayden.id,
        audience: "all",
        priority: "important",
        publishedAt: daysAgo(1),
        pinned: true,
      },
    }),
    prisma.announcement.create({
      data: {
        title: "Holiday Quest Vacation Care — Bookings Open!",
        body: "Vacation care bookings for the April school holidays are now open! 🎉\n\nPlease share the booking link with parents and encourage early registration.\n\nWe have exciting themes planned: Science Week, Outdoor Adventures, Creative Arts, and Community Service.",
        authorId: akram.id,
        audience: "all",
        priority: "normal",
        publishedAt: daysAgo(5),
      },
    }),
  ]);

  console.log(`  ✓ ${announcements.length} announcements created`);

  // ── Done ──────────────────────────────────────────────────
  console.log("\n✅ Demo seed complete!");
  console.log(`   Rocks: ${rocks.length}`);
  console.log(`   Todos: ${todos.length}`);
  console.log(`   Issues: ${issues.length}`);
  console.log(`   Enquiries: ${enquiries.length}`);
  console.log(`   Scorecard entries: ${entryCount}`);
  console.log(`   Children: ${createdChildren.length}`);
  console.log(`   Announcements: ${announcements.length}`);
}

main()
  .catch((e) => {
    console.error("❌ Demo seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
