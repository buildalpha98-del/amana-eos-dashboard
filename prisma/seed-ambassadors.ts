import { PrismaClient, Prisma } from "@prisma/client";

/**
 * Seeds the "Amana Ambassadors" course (library track) from
 * Amana_Ambassadors_LMS_Content_V1.docx (V1.0, August 2026).
 *
 * Three units, each a reading module followed by a 5-question knowledge check.
 * The quiz engine's fixed 80% pass mark (4/5) and unlimited attempts match the
 * document's requirements exactly. Completion of all three units is a
 * prerequisite for ambassador incentive eligibility (tracked outside the LMS).
 *
 * FULLY IDEMPOTENT — same guards as seed-induction.ts: course found by
 * (title + track) and created only if missing; modules only seeded when the
 * course has NONE, so later dashboard edits (including unpublishing) are never
 * clobbered by a redeploy.
 *
 * Seeded as PUBLISHED: the source document's upload instructions ask for the
 * course to be created ready for use, and the library track carries no
 * induction-gate risk.
 */

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
  duration: number;
  questions?: QuizQuestionSeed[];
};

const COURSE = {
  title: "Amana Ambassadors",
  description:
    "Three training units for the Amana Ambassadors scheme: our story and programmes, parent conversations that convert, and the boundaries that keep children safe and the scheme honest. Completing all three units (80% on each knowledge check) is a prerequisite for incentive eligibility. Estimated total time: 35–40 minutes.",
  category: "Ambassadors",
};

const UNIT_1_CONTENT = `## Learning outcomes

- Tell the Amana OSHC story in under 30 seconds, in your own words.
- Name all eight branded programmes and explain what a child does in each.
- State current session prices and explain the first-session-free offer correctly.

## Our story

Amana OSHC — **Beyond The Bell** — runs before and after school care across 11 centres in NSW and Victoria. **"Amana" means trust**: families entrust us with their children, and everything we do honours that trust. We combine the systems and safety discipline of the big national providers with something they cannot copy — genuine community identity, cultural safety and educators who know every child by name. Children here are capable, confident learners; families are partners, not customers.

When you speak with a prospective parent, you are not selling a product. **You are welcoming a family into a community their child will love.** That is the whole pitch.

## The eight programmes — your everyday language

| Programme | What it is | One line for parents |
| --- | --- | --- |
| **Rise and Shine Club** | Before school care | "A calm, fed, happy start — breakfast, quiet play, and walked safely to class." |
| **Amana Afternoons** | After school care | "The main event — afternoon tea, play, clubs and homework, all in one session." |
| **Homework Heroes** | Homework support | "Homework done before pick-up, with an educator alongside — evenings back for family." |
| **Little Champions Club** | Sport & physical activity | "Non-competitive sport every week — every child plays, every child belongs." |
| **Imagination Station** | Arts, craft & STEM | "Making, building, experimenting — child-led creativity, not worksheets." |
| **Iqra Circle** | Quran sessions | "A gentle, structured Quran circle — faith and belonging woven into the afternoon." |
| **Fuel Up with Amana** | Food & cooking | "Healthy afternoon tea daily, plus cooking sessions the kids run themselves." |
| **Holiday Quest** | Vacation care | "School holidays sorted — excursions, incursions and big-day adventures." |

## Prices and the pilot offer

- **Rise and Shine Club (BSC):** $26 regular booking / $31 casual, per session.
- **Amana Afternoons (ASC):** $36 regular booking / $41 casual, per session.
- Most families pay far less out of pocket — the **Child Care Subsidy (CCS)** applies to OSHC. **Never estimate a family's CCS**: direct them to the Director or Services Australia.
- **Pilot offer: the first session is free** — one free casual session per new child, once enrolment paperwork is complete. Say it exactly like that: **paperwork first, then the free session.**`;

const UNIT_1_QUESTIONS: QuizQuestionSeed[] = [
  {
    question: "What is our after school care programme called?",
    options: ["Beyond The Bell", "Amana Afternoons", "Amana Club", "Afternoon Quest"],
    correctIndex: 1,
    explanation:
      "Amana Afternoons is the after school care programme. Beyond The Bell is our overall tagline, not a programme.",
  },
  {
    question: "A parent asks what their child does in Imagination Station. Best answer?",
    options: [
      "Watches movies",
      "Arts, craft and STEM — child-led making and experimenting",
      "Extra tutoring",
      "Free play only",
    ],
    correctIndex: 1,
    explanation:
      "Imagination Station is our arts, craft and STEM programme — child-led creativity, not worksheets.",
  },
  {
    question: "The ASC regular booking price per session is:",
    options: ["$26", "$31", "$36", "$41"],
    correctIndex: 2,
    explanation:
      "Amana Afternoons (ASC) is $36 for a regular booking and $41 casual, per session.",
  },
  {
    question: "A parent asks how much CCS they'll get. You should:",
    options: [
      "Estimate 85%",
      "Say CCS doesn't apply",
      "Direct them to the Director or Services Australia",
      "Tell them to guess",
    ],
    correctIndex: 2,
    explanation:
      "Never estimate a family's CCS — always direct them to the Director or Services Australia.",
  },
  {
    question: "The first free session happens:",
    options: [
      "Before any paperwork",
      "After enrolment paperwork is complete",
      "Only in Holiday Quest",
      "After 4 paid sessions",
    ],
    correctIndex: 1,
    explanation:
      "One free casual session per new child, once enrolment paperwork is complete — paperwork first, then the free session.",
  },
];

const UNIT_2_CONTENT = `## Learning outcomes

- Open a warm, natural conversation with a prospective parent.
- Use discovery questions to understand what the family actually needs.
- Respond to the four most common objections honestly and confidently.
- Hand over to enrolment smoothly using your QR card.

## The Amana conversation — four steps

**1. Open warmly.** You are a familiar face at the school — use it. *"Assalamu alaikum! I'm one of the educators at Amana Afternoons here at the school — has your little one ever come along?"* A greeting, your name, your role, one question. That's it.

**2. Discover.** Ask before you tell. *"What does your afternoon pick-up look like at the moment?"* · *"Does anyone help with homework in the evenings?"* · *"What does your child love doing after school?"* Their answers tell you which programme to talk about. A parent juggling work pick-ups needs Amana Afternoons; a parent battling homework at 8pm needs Homework Heroes; a family wanting Quran learning needs Iqra Circle.

**3. Match.** Connect what they told you to one or two programmes — **never all eight**. *"You mentioned homework is a struggle — in Homework Heroes it's done before you arrive, with an educator alongside."* Specific beats general, every time.

**4. Invite.** *"The first session is free — the easiest way to see if it's right for your child. If you scan my card, the enrolment form takes about ten minutes, and then we book the free session in."* Offer the QR card, or introduce them to the Director if they prefer to talk it through.

## Handling the four common objections

| Parent says… | You say… (honest, warm, no pressure) |
| --- | --- |
| "It's too expensive." | "The listed price is before the Child Care Subsidy — most families pay much less out of pocket. The Director can show you exactly what it looks like for your family. And the first session is free, so you can see the value before paying anything." |
| "We manage pick-up ourselves." | "That's wonderful — lots of our families don't need us every day. Some come just one afternoon a week for Iqra Circle or Little Champions, or keep us as a backup for the days plans change. Casual bookings work exactly like that." |
| "My child is shy — they won't settle." | "That's really common, and it's exactly what the free first session is for. We pair new children with a buddy and the same educator greets them each day. Most shy starters are running in the door by week two — and if it's not right, there's no obligation at all." |
| "I don't understand the CCS / Centrelink side." | "You're not alone — it confuses everyone. Our Director sits with families and walks through it step by step, and we have a one-page explainer in English, Arabic, Urdu and Dari. Can I introduce you?" |

## The handover

- **Your QR card is your attribution** — when a family enrols through your code, the enrolment is credited to you. Always offer the card; **never write a family's details down yourself.**
- If the family wants to talk fees, CCS specifics, or anything you're unsure of — **introduce them to the Director**. A warm handover counts as your conversation; the credit is still yours.
- Follow up naturally: *"Lovely to meet you — hope we see Yusuf on Thursday!"* **Warmth converts. Pressure repels.**`;

const UNIT_2_QUESTIONS: QuizQuestionSeed[] = [
  {
    question: "The right first move in a parent conversation is:",
    options: [
      "List all 8 programmes",
      "Quote prices",
      "Greet, introduce yourself, ask one question",
      "Hand over a form",
    ],
    correctIndex: 2,
    explanation:
      "Open warmly: a greeting, your name, your role, one question. That's it.",
  },
  {
    question: "A parent says homework is a nightly battle. You talk about:",
    options: [
      "Holiday Quest",
      "Homework Heroes",
      "Fuel Up with Amana",
      "All programmes equally",
    ],
    correctIndex: 1,
    explanation:
      "Match what they told you to one or two programmes — a homework battle points to Homework Heroes.",
  },
  {
    question: "A parent says it's too expensive. You:",
    options: [
      "Offer a discount",
      "Mention CCS reduces out-of-pocket cost and offer the free first session",
      "Estimate their subsidy at 85%",
      "Agree and end the chat",
    ],
    correctIndex: 1,
    explanation:
      "The honest answer: the listed price is before CCS, the Director can show exact figures, and the first session is free.",
  },
  {
    question: "A parent is interested. To capture their enrolment you:",
    options: [
      "Write their number on your phone",
      "Offer your QR card or introduce the Director",
      "Take a photo of them",
      "Fill the form for them later from memory",
    ],
    correctIndex: 1,
    explanation:
      "The QR card and the Director are the only two channels — never collect family details yourself.",
  },
  {
    question: "A parent asks a CCS question you can't answer. You:",
    options: [
      "Guess",
      "Say CCS is automatic",
      "Introduce them to the Director",
      "Change the subject",
    ],
    correctIndex: 2,
    explanation:
      "A warm handover to the Director counts as your conversation — and the credit is still yours.",
  },
];

const UNIT_3_CONTENT = `## Learning outcomes

- State the three absolute boundaries of the Ambassadors scheme.
- Identify when a conversation may and may not happen.
- Apply privacy and honesty rules in every family interaction.

## The three absolute boundaries

**1. Never while responsible for children.** If you are counted in ratio or supervising children, you do not start or continue an ambassador conversation. A ratio breach carries a **$172,200 penalty** and — far more importantly — puts children at risk. No enrolment is worth either.

**2. Never collect family details yourself.** The QR card and the Director are the only two channels. No names, numbers or photos on personal devices — ever.

**3. Never overpromise.** Published prices only, no CCS estimates, no guarantees about places, and never a negative word about another provider.

## When and where conversations happen

| ✓ Right moments | ✗ Wrong moments |
| --- | --- |
| Before your shift starts, on your way in | While counted in educator-to-child ratio |
| After the last child is signed out and supervision has ended | While actively supervising, serving food, or running an activity |
| At school events, open days and community events (with Director's knowledge) | While a colleague is left alone covering your area |
| When your Director has released you from ratio for this purpose | Anywhere on school grounds where the school has asked us not to approach parents |

Each host school has its own expectations about parent interactions on their grounds. **Your Director will brief you on your site's arrangements — if you are ever unsure, ask first.**

## Honesty, culture and care

- We welcome families — **we never pressure them**. If a parent isn't interested, a warm "no worries at all, we're here if you ever need us" protects the relationship for next term.
- **Cultural safety cuts both ways**: greet families in the way that is natural to you and to them, and respect every family's choices about faith-based programmes — Iqra Circle is offered, never assumed.
- Your obligations under the **Code of Conduct, child safety policies and mandatory reporting are completely unchanged** by this scheme, and always come first.
- Incentive payments are made **through payroll with tax and super** — they are part of your wages. Any benefit offered to you directly by a family or anyone else must still be declined and reported.`;

const UNIT_3_QUESTIONS: QuizQuestionSeed[] = [
  {
    question: "You're in ratio and a prospective parent approaches you. You:",
    options: [
      "Have the full conversation",
      "Greet them warmly, and hand over to the Director or offer to chat after sign-out",
      "Ignore them",
      "Step away from the children to talk",
    ],
    correctIndex: 1,
    explanation:
      "Never while responsible for children — greet warmly, then hand over or defer until after sign-out.",
  },
  {
    question: 'A parent wants to give you their number so you can "sort it out later". You:',
    options: [
      "Save it in your phone",
      "Write it on paper",
      "Offer your QR card or introduce the Director",
      "Memorise it",
    ],
    correctIndex: 2,
    explanation:
      "Never collect family details yourself — the QR card and the Director are the only two channels.",
  },
  {
    question: "A parent asks if you're cheaper than Camp Australia. You:",
    options: [
      "Criticise Camp Australia",
      "Guess their prices",
      "Share our published prices and what makes Amana different — without disparaging anyone",
      "Promise to beat any price",
    ],
    correctIndex: 2,
    explanation:
      "Published prices only, and never a negative word about another provider.",
  },
  {
    question: "The penalty for a single ratio breach is:",
    options: ["$1,722", "$17,220", "$172,200", "A warning letter"],
    correctIndex: 2,
    explanation:
      "A ratio breach carries a $172,200 penalty — and, far more importantly, puts children at risk.",
  },
  {
    question: "The scheme changes your child safety and reporting obligations:",
    options: [
      "Slightly",
      "Only during conversations",
      "Not at all — they always come first",
      "Only for casuals",
    ],
    correctIndex: 2,
    explanation:
      "Code of Conduct, child safety policies and mandatory reporting are completely unchanged and always come first.",
  },
];

const MODULES: ModuleSeed[] = [
  {
    title: "Unit 1 — Our Story & Our Programmes",
    description:
      "The Amana story, the eight branded programmes, current prices and the first-session-free offer. (≈10 min)",
    type: "document",
    content: UNIT_1_CONTENT,
    duration: 10,
  },
  {
    title: "Knowledge check — Unit 1",
    description: "Five questions on our story, programmes and prices. 80% to pass; unlimited attempts.",
    type: "quiz",
    duration: 5,
    questions: UNIT_1_QUESTIONS,
  },
  {
    title: "Unit 2 — Parent Conversations That Convert",
    description:
      "The four-step Amana conversation, the four common objections, and the QR-card handover. (≈15 min)",
    type: "document",
    content: UNIT_2_CONTENT,
    duration: 15,
  },
  {
    title: "Knowledge check — Unit 2",
    description: "Five questions on parent conversations. 80% to pass; unlimited attempts.",
    type: "quiz",
    duration: 5,
    questions: UNIT_2_QUESTIONS,
  },
  {
    title: "Unit 3 — Boundaries & Compliance",
    description:
      "The three absolute boundaries, right and wrong moments for conversations, and honesty rules. (≈10 min)",
    type: "document",
    content: UNIT_3_CONTENT,
    duration: 10,
  },
  {
    title: "Knowledge check — Unit 3",
    description: "Five questions on boundaries and compliance. 80% to pass; unlimited attempts.",
    type: "quiz",
    duration: 5,
    questions: UNIT_3_QUESTIONS,
  },
];

export async function seedAmbassadors(prisma: PrismaClient): Promise<void> {
  console.log("Seeding Amana Ambassadors course...");

  let course = await prisma.lMSCourse.findFirst({
    where: { title: COURSE.title, track: "library", deleted: false },
    select: { id: true },
  });
  if (!course) {
    course = await prisma.lMSCourse.create({
      data: {
        title: COURSE.title,
        description: COURSE.description,
        category: COURSE.category,
        track: "library",
        status: "published",
        isRequired: false,
        sortOrder: 0,
      },
      select: { id: true },
    });
  }

  // Seed modules only when the course has NONE — once seeded (or edited via
  // the dashboard), redeploys must never re-add or duplicate content.
  const moduleCount = await prisma.lMSModule.count({ where: { courseId: course.id } });
  if (moduleCount > 0) {
    console.log("Amana Ambassadors already has modules — skipping.");
    return;
  }

  for (let i = 0; i < MODULES.length; i++) {
    const mod = MODULES[i];
    const created = await prisma.lMSModule.create({
      data: {
        courseId: course.id,
        title: mod.title,
        description: mod.description,
        type: mod.type,
        content: mod.content ?? null,
        duration: mod.duration,
        sortOrder: i,
        isRequired: true,
      },
      select: { id: true },
    });

    if (mod.type === "quiz" && mod.questions) {
      for (let q = 0; q < mod.questions.length; q++) {
        const question = mod.questions[q];
        await prisma.lMSQuizQuestion.create({
          data: {
            moduleId: created.id,
            question: question.question,
            options: question.options as unknown as Prisma.InputJsonValue,
            correctIndex: question.correctIndex,
            explanation: question.explanation,
            sortOrder: q,
            active: true,
          },
        });
      }
    }
  }

  console.log("Amana Ambassadors seeded: 3 units + 3 knowledge checks (15 questions).");
}
