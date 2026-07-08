import { PrismaClient, Prisma } from "@prisma/client";

/**
 * Seeds the staff-induction curriculum as DRAFTS with minimal placeholder
 * content. Real content will be authored later through the dashboard, so each
 * module body is only 2-4 sentences of sensible placeholder.
 *
 * FULLY IDEMPOTENT — safe to run repeatedly. Everything is guarded with
 * existence checks (findFirst by a stable natural key, then create if missing),
 * because LMSCourse has no unique title and this seeder runs as part of every
 * Vercel build. Re-running must never duplicate rows.
 *
 * Target counts after a run (and after any re-run):
 *   - 7 essential courses (each: 2 document + 1 quiz module, 2 quiz questions)
 *   - 12 monthly courses (each: 1 document + 1 quiz module, 2 quiz questions)
 *   - 12 TrainingCalendarSlot rows (one per month, linked to its monthly course)
 *   - 6 PracticalChecklistItem rows
 */

// ── Types ──────────────────────────────────────────────────────

type QuizQuestionSeed = {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

type ModuleSeed = {
  title: string;
  description: string;
  type: "document" | "quiz";
  content?: string;
  questions?: QuizQuestionSeed[];
};

type CourseSeed = {
  title: string;
  description: string;
  category: string;
  modules: ModuleSeed[];
};

// ── Data: 7 essential courses ──────────────────────────────────

const ESSENTIAL_COURSES: CourseSeed[] = [
  {
    title: "The Amana Way",
    description: "Our values, mission and what it means to work at Amana OSHC.",
    category: "Culture",
    modules: [
      {
        title: "Who we are",
        description: "Introduction to Amana OSHC.",
        type: "document",
        content:
          "Amana OSHC provides faith-aligned, inclusive out-of-school-hours care to school communities across Australia. Our purpose is to create safe, nurturing spaces where children are actively engaged in quality learning and play. This module introduces who we are and why the work matters.",
      },
      {
        title: "Our values in practice",
        description: "How our core values show up day to day.",
        type: "document",
        content:
          "Our core values are Faith & Character, Safety & Care, Growth & Learning, Health & Wellbeing, and Community & Belonging. Every decision an educator makes should trace back to at least one of these. This module gives everyday examples of living the Amana Way.",
      },
      {
        title: "Quick check",
        description: "Confirm you understand the Amana Way.",
        type: "quiz",
        questions: [
          {
            question: "What is the primary purpose of Amana OSHC?",
            options: [
              "To maximise enrolment numbers above all else",
              "To create safe, nurturing spaces for quality learning and play",
              "To replace the school curriculum",
              "To provide tutoring only",
            ],
            correctIndex: 1,
            explanation:
              "Our purpose centres on safe, nurturing environments where children are engaged in quality learning and play.",
          },
          {
            question: "Which of these is one of Amana's core values?",
            options: ["Profit First", "Safety & Care", "Speed Over Quality", "Competition"],
            correctIndex: 1,
            explanation: "Safety & Care is one of our five core values.",
          },
        ],
      },
    ],
  },
  {
    title: "Child Safety & You",
    description: "Your responsibilities under the Child Safe Standards.",
    category: "Child Safety",
    modules: [
      {
        title: "Child Safe Standards overview",
        description: "The standards that keep children safe.",
        type: "document",
        content:
          "Every educator is responsible for upholding the Child Safe Standards. This means maintaining professional boundaries, supervising actively, and putting the safety and wellbeing of children first at all times. This module summarises the standards you must know.",
      },
      {
        title: "Recognising and reporting concerns",
        description: "Your duty to report.",
        type: "document",
        content:
          "If you see or suspect harm to a child, you have a legal and moral duty to report it. Know who your child protection contact is and never keep concerns to yourself. This module explains how to recognise and escalate concerns promptly.",
      },
      {
        title: "Quick check",
        description: "Confirm you understand child safety basics.",
        type: "quiz",
        questions: [
          {
            question: "What should you do if you suspect a child is being harmed?",
            options: [
              "Wait to see if it happens again",
              "Report it promptly to your child protection contact",
              "Keep it to yourself to avoid conflict",
              "Ask the child not to tell anyone",
            ],
            correctIndex: 1,
            explanation:
              "You have a duty to report any concern about harm to a child promptly and never keep it to yourself.",
          },
          {
            question: "Who is responsible for child safety at Amana OSHC?",
            options: [
              "Only the coordinator",
              "Only management",
              "Every educator and staff member",
              "Only the child protection officer",
            ],
            correctIndex: 2,
            explanation: "Child safety is everyone's responsibility.",
          },
        ],
      },
    ],
  },
  {
    title: "Your First Day",
    description: "What to expect and do on day one.",
    category: "Onboarding",
    modules: [
      {
        title: "Arriving and setting up",
        description: "Starting your first shift.",
        type: "document",
        content:
          "On your first day, arrive early, sign in, and meet your coordinator and team. Familiarise yourself with the sign-in area, the program space, and where key resources live. This module walks through a smooth first shift.",
      },
      {
        title: "Your role during a session",
        description: "What educators do across a session.",
        type: "document",
        content:
          "During a session you supervise children, support the planned program, and help with routines like snack and pack-up. Active engagement and positive interactions are the core of the role. This module outlines what a typical session looks like.",
      },
      {
        title: "Quick check",
        description: "Confirm you're ready for day one.",
        type: "quiz",
        questions: [
          {
            question: "What is one of the first things you should do on your first day?",
            options: [
              "Start cooking meals unsupervised",
              "Sign in and meet your coordinator and team",
              "Take the children on an unplanned excursion",
              "Leave early to settle in",
            ],
            correctIndex: 1,
            explanation: "Signing in and meeting your coordinator and team sets you up for a smooth first shift.",
          },
          {
            question: "What is a core part of an educator's role during a session?",
            options: [
              "Sitting apart from the children",
              "Active supervision and positive engagement",
              "Using your phone",
              "Leaving children unsupervised during snack",
            ],
            correctIndex: 1,
            explanation: "Active supervision and positive engagement are central to the educator role.",
          },
        ],
      },
    ],
  },
  {
    title: "OWNA Essentials",
    description: "Using the OWNA app for sign-in, attendance and communication.",
    category: "Systems",
    modules: [
      {
        title: "Signing children in and out",
        description: "Attendance basics in OWNA.",
        type: "document",
        content:
          "OWNA is the app we use to record attendance and communicate with families. Accurate, timely sign-in and sign-out is critical for ratios and safety. This module covers the everyday attendance workflow in OWNA.",
      },
      {
        title: "Communicating with families",
        description: "Using OWNA to keep parents informed.",
        type: "document",
        content:
          "OWNA lets you share updates, photos and messages with families in a compliant way. Always follow our privacy and photography guidelines when posting. This module explains how to use OWNA to keep parents informed.",
      },
      {
        title: "Quick check",
        description: "Confirm your OWNA basics.",
        type: "quiz",
        questions: [
          {
            question: "Why is accurate sign-in and sign-out in OWNA important?",
            options: [
              "It is optional and only for billing",
              "It keeps ratios and child safety records correct",
              "It replaces supervision",
              "It is only needed at month end",
            ],
            correctIndex: 1,
            explanation: "Accurate attendance records are critical for maintaining correct ratios and child safety.",
          },
          {
            question: "What must you follow when posting photos of children in OWNA?",
            options: [
              "Nothing, post anything",
              "Our privacy and photography guidelines",
              "Only your personal preference",
              "The child's request only",
            ],
            correctIndex: 1,
            explanation: "Always follow our privacy and photography guidelines when sharing content with families.",
          },
        ],
      },
    ],
  },
  {
    title: "Finding What You Need",
    description: "Navigating the dashboard, policies and resources.",
    category: "Systems",
    modules: [
      {
        title: "Getting around the dashboard",
        description: "Where things live.",
        type: "document",
        content:
          "The Amana dashboard is where you find policies, rosters, resources and reporting tools. Knowing where things live saves time and keeps you compliant. This module gives you a tour of the key sections.",
      },
      {
        title: "Locating policies and resources",
        description: "Finding the right document quickly.",
        type: "document",
        content:
          "When you need a policy or a form, you can search or browse the dashboard's knowledge area. Always use the current version rather than a saved copy. This module shows how to find the right document quickly.",
      },
      {
        title: "Quick check",
        description: "Confirm you can find what you need.",
        type: "quiz",
        questions: [
          {
            question: "Where do you find current policies and resources?",
            options: [
              "In an old email",
              "On the Amana dashboard knowledge area",
              "You should memorise everything",
              "Only by asking a colleague",
            ],
            correctIndex: 1,
            explanation: "The dashboard knowledge area holds the current, authoritative versions of policies and resources.",
          },
          {
            question: "Which version of a policy should you rely on?",
            options: [
              "A saved copy from last year",
              "The current version on the dashboard",
              "Whatever a colleague remembers",
              "The first result in any search engine",
            ],
            correctIndex: 1,
            explanation: "Always use the current version on the dashboard, not an old saved copy.",
          },
        ],
      },
    ],
  },
  {
    title: "Policies That Matter Most",
    description: "The everyday policies you must know from day one.",
    category: "Compliance",
    modules: [
      {
        title: "Core policies overview",
        description: "The policies you use most.",
        type: "document",
        content:
          "Some policies you will use every single day — supervision, behaviour guidance, and emergency procedures among them. This module introduces the core policies every educator must know from day one. Read them in full on the dashboard.",
      },
      {
        title: "Acknowledging and applying policies",
        description: "Putting policy into practice.",
        type: "document",
        content:
          "Knowing a policy exists is not enough; you must apply it in practice and acknowledge that you have read it. If you are unsure how a policy applies, ask your coordinator. This module explains how to put policies into practice.",
      },
      {
        title: "Quick check",
        description: "Confirm you know the core policies.",
        type: "quiz",
        questions: [
          {
            question: "Which of these is a policy you will likely use every day?",
            options: [
              "Annual budget policy",
              "Supervision policy",
              "Board governance policy",
              "Tender submission policy",
            ],
            correctIndex: 1,
            explanation: "Supervision is an everyday policy that directly affects child safety.",
          },
          {
            question: "What should you do if you are unsure how a policy applies?",
            options: [
              "Guess and hope for the best",
              "Ask your coordinator",
              "Ignore the policy",
              "Wait until an incident happens",
            ],
            correctIndex: 1,
            explanation: "If you are unsure how a policy applies, ask your coordinator before acting.",
          },
        ],
      },
    ],
  },
  {
    title: "Health & Safety Basics",
    description: "Keeping children and yourself safe every session.",
    category: "Health & Safety",
    modules: [
      {
        title: "Everyday safety",
        description: "Hazards, hygiene and supervision.",
        type: "document",
        content:
          "Health and safety starts with active supervision, good hygiene, and spotting hazards before they cause harm. Always know where the first aid kit and evacuation plan are located. This module covers everyday safety habits.",
      },
      {
        title: "Emergencies and first aid",
        description: "Responding when something goes wrong.",
        type: "document",
        content:
          "In an emergency, follow the centre's emergency procedures and alert your coordinator immediately. Know the location of first aid kits, medical action plans, and evacuation routes. This module outlines how to respond when something goes wrong.",
      },
      {
        title: "Quick check",
        description: "Confirm your health and safety basics.",
        type: "quiz",
        questions: [
          {
            question: "What should you always know the location of at your centre?",
            options: [
              "The nearest cafe",
              "The first aid kit, evacuation plan and medical action plans",
              "The staff car park only",
              "The principal's office",
            ],
            correctIndex: 1,
            explanation:
              "You must always know where the first aid kit, evacuation plan and medical action plans are located.",
          },
          {
            question: "What is the foundation of everyday health and safety?",
            options: [
              "Leaving children to play unsupervised",
              "Active supervision, good hygiene, and spotting hazards early",
              "Only reacting after an incident",
              "Relying solely on the coordinator",
            ],
            correctIndex: 1,
            explanation: "Active supervision, hygiene, and early hazard spotting are the foundation of safety.",
          },
        ],
      },
    ],
  },
];

// ── Data: practical checklist items ────────────────────────────

const PRACTICAL_ITEMS: { title: string; description: string }[] = [
  {
    title: "Sign a child in and out on OWNA",
    description: "Demonstrate a correct, timely attendance record in OWNA.",
  },
  {
    title: "Introduce yourself to a parent at pickup",
    description: "Greet a family professionally and warmly at collection.",
  },
  {
    title: "Locate the first aid kit, evacuation plan and medical action plans",
    description: "Physically point out each item's location at the centre.",
  },
  {
    title: "Find a policy on the dashboard",
    description: "Navigate to and open a current policy on the dashboard.",
  },
  {
    title: "Walk through completing an incident report",
    description: "Show how you would record and escalate an incident.",
  },
  {
    title: "Demonstrate correct supervision positioning",
    description: "Position yourself to actively supervise the whole space.",
  },
];

// ── Data: 12 monthly courses + calendar mapping ────────────────

type MonthlySeed = {
  month: number; // 1-12
  title: string;
  description: string;
  document: { title: string; content: string };
  quiz: { title: string; questions: QuizQuestionSeed[] };
};

function twoQuestions(topic: string): QuizQuestionSeed[] {
  return [
    {
      question: `Which statement best reflects good practice for ${topic}?`,
      options: [
        "Ignore it unless a parent complains",
        `Follow the current ${topic} policy and procedures`,
        "Improvise without reference to policy",
        "Leave it entirely to the coordinator",
      ],
      correctIndex: 1,
      explanation: `Good practice means following the current ${topic} policy and procedures.`,
    },
    {
      question: `Where can you find the most up-to-date guidance on ${topic}?`,
      options: [
        "An old printout",
        "The current policy on the Amana dashboard",
        "Personal memory only",
        "A colleague's guess",
      ],
      correctIndex: 1,
      explanation: `The current ${topic} guidance lives on the Amana dashboard.`,
    },
  ];
}

const MONTHLY_COURSES: MonthlySeed[] = [
  {
    month: 1,
    title: "Annual Policy Refresh",
    description: "Yearly refresh of the policies every educator must know.",
    document: {
      title: "Annual policy refresh overview",
      content:
        "Each year we revisit the core policies to keep everyone current with the latest requirements and best practice. This refresh covers what has changed and what to re-read. Real content will be authored before rollout.",
    },
    quiz: { title: "Quick check", questions: twoQuestions("the annual policy refresh") },
  },
  {
    month: 2,
    title: "Child Protection Refresher",
    description: "A refresher on your child protection responsibilities.",
    document: {
      title: "Child protection refresher",
      content:
        "This refresher reinforces your duty to recognise, respond to, and report concerns about harm to children. It reminds you of your reporting contacts and obligations. Real content will be authored before rollout.",
    },
    quiz: { title: "Quick check", questions: twoQuestions("child protection") },
  },
  {
    month: 3,
    title: "Anaphylaxis & Medical",
    description: "Managing anaphylaxis and medical conditions safely.",
    document: {
      title: "Anaphylaxis and medical management",
      content:
        "This module covers recognising and responding to anaphylaxis and following medical action plans. Knowing where medication is stored and how to act quickly saves lives. Real content will be authored before rollout.",
    },
    quiz: { title: "Quick check", questions: twoQuestions("anaphylaxis and medical management") },
  },
  {
    month: 4,
    title: "Behaviour Guidance",
    description: "Positive, respectful approaches to behaviour guidance.",
    document: {
      title: "Behaviour guidance approaches",
      content:
        "Behaviour guidance at Amana is positive, consistent and respectful of each child. This module introduces strategies that support children to self-regulate. Real content will be authored before rollout.",
    },
    quiz: { title: "Quick check", questions: twoQuestions("behaviour guidance") },
  },
  {
    month: 5,
    title: "Emergency Procedures",
    description: "Evacuation, lockdown and emergency response.",
    document: {
      title: "Emergency procedures",
      content:
        "This module reviews evacuation and lockdown procedures and your role in an emergency. Knowing the plan before an emergency happens is essential. Real content will be authored before rollout.",
    },
    quiz: { title: "Quick check", questions: twoQuestions("emergency procedures") },
  },
  {
    month: 6,
    title: "Food Safety",
    description: "Safe food handling and allergy awareness.",
    document: {
      title: "Food safety basics",
      content:
        "This module covers safe food handling, hygiene, and allergy awareness during snack and meal times. Small lapses can cause real harm, so care and consistency matter. Real content will be authored before rollout.",
    },
    quiz: { title: "Quick check", questions: twoQuestions("food safety") },
  },
  {
    month: 7,
    title: "Supervision",
    description: "Active supervision techniques for OSHC.",
    document: {
      title: "Active supervision",
      content:
        "Active supervision means positioning, scanning, and anticipating so you can respond before problems arise. This module refreshes the techniques that keep every child in view. Real content will be authored before rollout.",
    },
    quiz: { title: "Quick check", questions: twoQuestions("active supervision") },
  },
  {
    month: 8,
    title: "Complaints & Feedback",
    description: "Handling complaints and feedback professionally.",
    document: {
      title: "Complaints and feedback handling",
      content:
        "Complaints and feedback are opportunities to improve. This module explains how to receive concerns professionally and escalate them appropriately. Real content will be authored before rollout.",
    },
    quiz: { title: "Quick check", questions: twoQuestions("complaints and feedback") },
  },
  {
    month: 9,
    title: "Inclusion & Additional Needs",
    description: "Supporting children with additional needs.",
    document: {
      title: "Inclusion and additional needs",
      content:
        "Every child has the right to participate and belong. This module introduces inclusive practice and how we support children with additional needs. Real content will be authored before rollout.",
    },
    quiz: { title: "Quick check", questions: twoQuestions("inclusion and additional needs") },
  },
  {
    month: 10,
    title: "Sun Safety",
    description: "Keeping children sun-safe outdoors.",
    document: {
      title: "Sun safety",
      content:
        "This module covers our sun safety practices, including hats, shade, and sunscreen routines. Keeping children protected outdoors is a year-round habit. Real content will be authored before rollout.",
    },
    quiz: { title: "Quick check", questions: twoQuestions("sun safety") },
  },
  {
    month: 11,
    title: "Incident Reporting Quality",
    description: "Writing clear, accurate incident reports.",
    document: {
      title: "Quality incident reporting",
      content:
        "A good incident report is timely, factual, and complete. This module explains how to write reports that protect children and the service. Real content will be authored before rollout.",
    },
    quiz: { title: "Quick check", questions: twoQuestions("incident reporting quality") },
  },
  {
    month: 12,
    title: "Reflective Practice & QIP",
    description: "Reflective practice and the Quality Improvement Plan.",
    document: {
      title: "Reflective practice and QIP",
      content:
        "Reflective practice helps us continually improve, and it feeds directly into our Quality Improvement Plan. This module introduces how your reflections become evidence. Real content will be authored before rollout.",
    },
    quiz: { title: "Quick check", questions: twoQuestions("reflective practice and the QIP") },
  },
];

// ── Helpers ────────────────────────────────────────────────────

/**
 * Find a course by its natural key (title + track), or create it if missing.
 * Returns the course id. Idempotent.
 */
async function ensureCourse(
  prisma: PrismaClient,
  data: {
    title: string;
    description: string;
    category: string;
    track: "essential" | "monthly";
    isRequired: boolean;
    sortOrder: number;
  },
): Promise<string> {
  const existing = await prisma.lMSCourse.findFirst({
    where: { title: data.title, track: data.track },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.lMSCourse.create({
    data: {
      title: data.title,
      description: data.description,
      category: data.category,
      status: "draft",
      isRequired: data.isRequired,
      track: data.track,
      sortOrder: data.sortOrder,
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * Find a module by (courseId + title), or create it. Returns the module id.
 * When a quiz module is created, its questions are seeded too. Idempotent —
 * questions are only added if the module was freshly created.
 */
async function ensureModule(
  prisma: PrismaClient,
  courseId: string,
  data: {
    title: string;
    description: string;
    type: "document" | "quiz";
    content?: string;
    sortOrder: number;
    questions?: QuizQuestionSeed[];
  },
): Promise<void> {
  const existing = await prisma.lMSModule.findFirst({
    where: { courseId, title: data.title },
    select: { id: true },
  });
  if (existing) return; // already seeded — do not duplicate module or questions

  const module = await prisma.lMSModule.create({
    data: {
      courseId,
      title: data.title,
      description: data.description,
      type: data.type,
      content: data.content ?? null,
      duration: 5,
      sortOrder: data.sortOrder,
      isRequired: true,
    },
    select: { id: true },
  });

  if (data.type === "quiz" && data.questions) {
    for (let i = 0; i < data.questions.length; i++) {
      const q = data.questions[i];
      await prisma.lMSQuizQuestion.create({
        data: {
          moduleId: module.id,
          question: q.question,
          options: q.options as unknown as Prisma.InputJsonValue,
          correctIndex: q.correctIndex,
          explanation: q.explanation,
          sortOrder: i,
          active: true,
        },
      });
    }
  }
}

// ── Main entry ─────────────────────────────────────────────────

export async function seedInduction(prisma: PrismaClient): Promise<void> {
  console.log("Seeding staff-induction curriculum (drafts)...");

  // 1. Seven essential courses, each with 2 document + 1 quiz module.
  for (let i = 0; i < ESSENTIAL_COURSES.length; i++) {
    const course = ESSENTIAL_COURSES[i];
    const courseId = await ensureCourse(prisma, {
      title: course.title,
      description: course.description,
      category: course.category,
      track: "essential",
      isRequired: true,
      sortOrder: i,
    });

    // Only seed placeholder modules when the course has NONE. Once a course
    // has modules — whether from a prior seed or real authored content whose
    // titles differ from these placeholders — leave it untouched. (Without
    // this guard, re-seeding re-adds the placeholder-titled modules alongside
    // renamed real content, duplicating them on every deploy.)
    const existingModuleCount = await prisma.lMSModule.count({ where: { courseId } });
    if (existingModuleCount === 0) {
      for (let m = 0; m < course.modules.length; m++) {
        const mod = course.modules[m];
        await ensureModule(prisma, courseId, {
          title: mod.title,
          description: mod.description,
          type: mod.type,
          content: mod.content,
          sortOrder: m,
          questions: mod.questions,
        });
      }
    }
  }
  console.log(`  Ensured ${ESSENTIAL_COURSES.length} essential courses`);

  // 2. Practical checklist items — findFirst by title, create if missing.
  for (let i = 0; i < PRACTICAL_ITEMS.length; i++) {
    const item = PRACTICAL_ITEMS[i];
    const existing = await prisma.practicalChecklistItem.findFirst({
      where: { title: item.title },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.practicalChecklistItem.create({
      data: {
        title: item.title,
        description: item.description,
        sortOrder: i,
        active: true,
      },
    });
  }
  console.log(`  Ensured ${PRACTICAL_ITEMS.length} practical checklist items`);

  // 3. Twelve monthly courses (1 document + 1 quiz each) + calendar slots.
  for (const monthly of MONTHLY_COURSES) {
    const courseId = await ensureCourse(prisma, {
      title: monthly.title,
      description: monthly.description,
      category: "Monthly Training",
      track: "monthly",
      isRequired: false,
      sortOrder: monthly.month,
    });

    // Only seed modules when the course has NONE (see the essential loop note).
    const existingModuleCount = await prisma.lMSModule.count({ where: { courseId } });
    if (existingModuleCount === 0) {
      await ensureModule(prisma, courseId, {
        title: monthly.document.title,
        description: monthly.description,
        type: "document",
        content: monthly.document.content,
        sortOrder: 0,
      });
      await ensureModule(prisma, courseId, {
        title: monthly.quiz.title,
        description: `Quick check for ${monthly.title}.`,
        type: "quiz",
        sortOrder: 1,
        questions: monthly.quiz.questions,
      });
    }

    // Calendar slot — unique on (month, courseId). Guard so re-runs skip.
    const existingSlot = await prisma.trainingCalendarSlot.findFirst({
      where: { month: monthly.month, courseId },
      select: { id: true },
    });
    if (!existingSlot) {
      await prisma.trainingCalendarSlot.create({
        data: { month: monthly.month, courseId, active: true },
      });
    }
  }
  console.log(`  Ensured ${MONTHLY_COURSES.length} monthly courses + calendar slots`);

  console.log("Staff-induction curriculum seed complete.");
}
