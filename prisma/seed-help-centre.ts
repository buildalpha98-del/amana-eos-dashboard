import type { PrismaClient } from "@prisma/client";

/**
 * Seeds the public parent Help Centre (/support) with Amana OSHC starter
 * content — 4 categories and their articles.
 *
 * FULLY IDEMPOTENT — same guards as seed-induction/seed-ambassadors:
 * categories are found by slug and created only if missing; articles are only
 * seeded when their category has NONE, so later dashboard edits (rewording,
 * re-ordering, unpublishing) are never clobbered by a redeploy.
 *
 * Seeded as PUBLISHED: this is parent-facing FAQ content with no gating
 * risk, and an empty help centre on launch helps nobody. Admins can edit or
 * unpublish anything from /help-centre.
 */

type ArticleSeed = { title: string; body: string };

type CategorySeed = {
  name: string;
  slug: string;
  description: string;
  icon: string;
  sortOrder: number;
  articles: ArticleSeed[];
};

const CATEGORIES: CategorySeed[] = [
  {
    name: "Enrolments & Bookings",
    slug: "enrolments-and-bookings",
    description:
      "Enrolling your child, booking before & after school care sessions, and changing or cancelling days.",
    icon: "calendar-days",
    sortOrder: 1,
    articles: [
      {
        title: "How do I enrol my child at Amana OSHC?",
        body: `Enrolling takes about ten minutes online:

1. Open our enrolment form at **amanaoshc.company/enrol** (or ask your school's Amana coordinator for the link).
2. Fill in your child's details, your contact details, and any medical or dietary needs.
3. Choose the days you'd like — permanent before-school, after-school, or both.
4. Submit the form. Our team reviews every enrolment and confirms by email, usually within two business days.

Once your enrolment is confirmed you'll receive a welcome email with your first-day details and how to set up the parent app.

**Tip:** if you plan to claim the Child Care Subsidy (CCS), start your CCS claim with Services Australia early — see the *Payments & CCS* section. You can enrol before your CCS is approved.`,
      },
      {
        title: "How do I book a casual day?",
        body: `Casual bookings are for days outside your child's regular schedule — a one-off work commitment, an appointment, or a change of plans.

1. Log in to the **Amana parent portal** and open **Bookings**.
2. Pick the date and session (before or after school care) you need.
3. Submit the request. The centre team reviews it against that day's capacity and educator-to-child ratios and confirms by email.

A casual booking isn't guaranteed until it's confirmed — popular days can fill up, so book as early as you can.

If you can't see the day you need, or it's for **today**, please call your centre directly so the team can help straight away.`,
      },
      {
        title: "How do I change or cancel my child's booked days?",
        body: `**Permanent (recurring) days**

To change your child's regular schedule — for example moving from Tuesday to Wednesday, or adding a day — send the request through the parent portal messages or email your centre. Changes to permanent bookings take effect from the following week once confirmed.

**Casual bookings**

Casual bookings can be cancelled from the **Bookings** page in the parent portal. Please give as much notice as you can — it frees the place for another family.

**Cancellation notice**

Sessions cancelled with less than the required notice period may still be charged, in line with our enrolment terms. Allowable absences under CCS may still apply to charged sessions — see *Payments & CCS*.`,
      },
      {
        title: "My child will be absent — what do I need to do?",
        body: `If your child is enrolled for a session but won't attend:

1. **Tell us before the session starts** — mark the absence in the parent app, or message/call your centre. This matters most for after-school care: if your child doesn't arrive from class and we haven't been told, our team must treat it as a missing child and will begin follow-up immediately.
2. For illness, let us know anything we should be aware of — some conditions have exclusion periods to protect other children (see *Policies & Safety*).

Charged absences generally still count toward your CCS allowable absences, so you usually still receive your subsidy for that session.`,
      },
    ],
  },
  {
    name: "Payments & CCS",
    slug: "payments-and-ccs",
    description:
      "Fees, statements, direct debit, and getting the Child Care Subsidy (CCS) applied to your account.",
    icon: "credit-card",
    sortOrder: 2,
    articles: [
      {
        title: "What is the Child Care Subsidy (CCS) and how do I claim it?",
        body: `The **Child Care Subsidy (CCS)** is the Australian Government payment that reduces what you pay for approved child care — including Amana OSHC's before and after school care.

**How much you get** depends on your family income, the type of care, and your recognised activity (work, study, volunteering). For most families it covers a substantial part of the session fee.

**To claim it:**

1. Sign in to **myGov** and go to **Centrelink**.
2. Make a *Child Care Subsidy claim* for each child (you only do this once per child).
3. When Centrelink asks for your provider, select **Amana OSHC** and your child's centre.
4. Once we've confirmed your enrolment on our side, a **CCS enrolment confirmation** appears in your myGov — approve it so the subsidy starts flowing.

Until the subsidy is confirmed you'll be billed full fees; once approved, CCS is usually backdated in line with Services Australia's rules.`,
      },
      {
        title: "How do I confirm my CCS enrolment in myGov?",
        body: `After you enrol with us and your CCS claim is approved, Services Australia asks you to confirm the enrolment — the subsidy won't apply until you do.

1. Sign in to **myGov** and open **Centrelink**.
2. Go to **My Family → Child Care → Enrolments**.
3. Find the enrolment for your child at Amana OSHC and check the details (days, centre).
4. Select **Confirm**.

If the enrolment doesn't appear within a few days of our confirmation email, or the details look wrong, contact us through the Help Centre and we'll re-submit it.`,
      },
      {
        title: "How and when am I billed?",
        body: `- **Statements** are issued regularly to the email address on your enrolment, showing sessions, fees, CCS applied, and the gap amount you pay.
- **Payment** is by the direct debit details you provided at enrolment, on the schedule shown on your statement.
- **Casual bookings** appear on the statement covering the week they were used.

Your statement always shows the fee *after* CCS, so what you see is what's debited.

If a payment fails (expired card, insufficient funds), we'll email you to retry — please update your details promptly so care isn't interrupted. Questions about a specific statement? Submit a ticket with the statement date and we'll go through it with you.`,
      },
      {
        title: "I think my fees are wrong — who do I talk to?",
        body: `Fee questions are usually one of three things:

1. **CCS hasn't been confirmed yet** — until you approve the enrolment in myGov, sessions bill at the full rate. See *How do I confirm my CCS enrolment in myGov?*
2. **Your CCS percentage changed** — Services Australia reassesses your subsidy (for example after an income update or the annual balancing). Your myGov shows the current percentage.
3. **A session or absence looks wrong** — a day charged you don't recognise, or a cancelled day still showing.

For anything on our side, **submit a ticket** from this Help Centre with your child's name, centre, and the statement date — our team will investigate and reply by email. We never need your banking details in a ticket, so please don't include them.`,
      },
    ],
  },
  {
    name: "Programs & Daily Routine",
    slug: "programs-and-daily-routine",
    description:
      "What happens at a session — homework club, Quran and faith programme, enrichment, food, and pick-ups.",
    icon: "sun",
    sortOrder: 3,
    articles: [
      {
        title: "What happens at an Amana OSHC session?",
        body: `Amana OSHC runs care that goes *beyond the bell* — built around faith, learning and play.

**Before school care** starts with a calm arrival, breakfast for children who need it, and quiet activities until we walk children to class.

**After school care** typically flows through:

1. **Arrival & roll call** — educators collect younger children from class; everyone is marked in.
2. **Afternoon tea** — a nutritious, halal snack.
3. **Homework club** — supervised time to get homework done before pick-up.
4. **Quran & faith programme** — age-appropriate Quran reading and Islamic values woven into the afternoon.
5. **Enrichment & play** — sport, art, STEM activities and free play, rotating through the term.

Every centre's program is displayed at the service and shaped by the children's interests — ask your coordinator to see what's on this term.`,
      },
      {
        title: "What should my child bring (and not bring)?",
        body: `**Bring:**

- A **water bottle** and their school **hat** for outdoor play
- Any **medication** your child may need, handed to an educator with the authorisation form (never left in a school bag)
- For before-school care: anything they need for the school day ahead

**We provide** afternoon tea (halal), activity materials, and sunscreen.

**Please leave at home:** toys from home (they get lost and cause tears), money, and valuables. Phones and smart watches should stay in school bags — children can always ask an educator to contact you.

Label everything — jumpers especially. Our lost property basket fills fast in winter!`,
      },
      {
        title: "Is the food halal? What about allergies?",
        body: `Yes — **all food served at Amana OSHC is halal.**

Afternoon tea is planned to be nutritious and varied. Menus are displayed at each centre.

**Allergies and dietary needs:** every allergy, intolerance or dietary requirement you list on the enrolment form goes onto your child's profile, and educators check it before food is served. Children with anaphylaxis risk have their action plan and medication accessible to educators at every session.

If your child's dietary needs change, update us straight away — message the centre through the parent portal or submit a ticket, and we'll update their profile.`,
      },
      {
        title: "How do drop-off and pick-up work?",
        body: `**Before school care:** bring your child into the centre and sign them in with an educator. When school starts, educators walk children to their classrooms or lines.

**After school care:** educators collect younger children directly from their classrooms; older children walk to the OSHC room and are marked off the roll as they arrive.

**Pick-up:** come into the centre and sign your child out with an educator. Children are only released to a parent/guardian or a person named as an **authorised contact** on your enrolment — photo ID may be requested for anyone the team hasn't met (see *Policies & Safety*).

**Running late?** Call the centre as soon as you can. A late-collection fee may apply after closing time, but the priority is always that your child is safe and settled with an educator until you arrive.`,
      },
    ],
  },
  {
    name: "Policies & Safety",
    slug: "policies-and-safety",
    description:
      "How we keep children safe — illness, incidents, authorised collection, and raising a concern.",
    icon: "shield-check",
    sortOrder: 4,
    articles: [
      {
        title: "How does Amana OSHC keep children safe?",
        body: `Child safety is the foundation of everything we run.

- **Staff checks:** every educator holds a valid Working With Children Check for their state (NSW/VIC) and completes child-protection training. New starters cannot work with children until their induction and essential training are complete.
- **Ratios:** sessions always run at or better than the regulated educator-to-child ratios.
- **First aid:** educators hold current first aid, CPR, asthma and anaphylaxis qualifications.
- **Attendance:** children are signed in and out every session, and a child who is expected but hasn't arrived triggers immediate follow-up with the school and family.
- **Policies:** our full policy library — child safe environment, sun protection, medical conditions, emergency management and more — is available at every centre. Ask your coordinator to see any policy in full.`,
      },
      {
        title: "What happens if my child is unwell or has an accident at OSHC?",
        body: `**Illness during a session:** we'll settle your child away from the group, monitor them, and call you to arrange collection if they're not well enough to stay. For some infectious conditions, public-health exclusion periods apply before they can return — the centre will tell you the timeframe.

**Injuries and incidents:** educators provide first aid immediately. For anything beyond a minor scrape you'll be contacted straight away, and every incident is documented in an incident report that you'll be asked to read and sign at pick-up. Serious incidents are also notified to the regulator as required by law.

**Medication:** we can only administer medication that is prescribed/labelled for your child and covered by a signed authorisation. Hand it to an educator at drop-off — never leave it in a school bag.`,
      },
      {
        title: "Who is allowed to collect my child?",
        body: `Children are only released to:

1. **Parents/guardians** listed on the enrolment, and
2. **Authorised contacts** you've nominated — grandparents, friends, a nanny.

Anyone our educators haven't met before will be asked for **photo ID**, which is checked against your authorised list. This can feel formal, but it's how we make sure "Nana is picking up today" is really Nana.

**To add or change authorised contacts,** update your details in the parent portal or message your centre. In an emergency, you can phone the centre and authorise a one-off collection verbally — the team will still ID-check the person at the door.

If a court order affects who may collect your child, please give the centre a copy so the team can uphold it.`,
      },
      {
        title: "How do I raise a concern or make a complaint?",
        body: `We'd always rather hear it than not — concerns make the service better.

**Step 1 — your centre coordinator.** Most things are fixed fastest on the ground: a chat at pick-up or a message through the parent portal.

**Step 2 — head office.** If you're not comfortable raising it at the centre, or it wasn't resolved, **submit a ticket** through this Help Centre or email **contact@amanaoshc.com.au**. Complaints go to our management team, you'll get an acknowledgement, and we'll keep you updated through to resolution.

**Serious concerns** about a child's safety or a breach of regulations can also be raised directly with the education and care regulator in your state at any time.

All complaints are handled confidentially and never affect how your child is cared for.`,
      },
    ],
  },
];

export async function seedHelpCentre(prisma: PrismaClient): Promise<void> {
  for (const cat of CATEGORIES) {
    let category = await prisma.helpCategory.findUnique({
      where: { slug: cat.slug },
      select: { id: true, _count: { select: { articles: true } } },
    });

    if (!category) {
      category = {
        id: (
          await prisma.helpCategory.create({
            data: {
              name: cat.name,
              slug: cat.slug,
              description: cat.description,
              icon: cat.icon,
              sortOrder: cat.sortOrder,
              published: true,
            },
            select: { id: true },
          })
        ).id,
        _count: { articles: 0 },
      };
      console.log(`  Help centre: created category "${cat.name}"`);
    }

    // Only seed articles when the category has NONE — a redeploy must never
    // clobber or duplicate admin-edited content.
    if (category._count.articles > 0) continue;

    for (const [i, article] of cat.articles.entries()) {
      const slug = article.title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/[\s_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
      const existing = await prisma.helpArticle.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (existing) continue;
      await prisma.helpArticle.create({
        data: {
          categoryId: category.id,
          title: article.title,
          slug,
          body: article.body,
          sortOrder: (i + 1) * 10,
          published: true,
        },
      });
    }
    console.log(`  Help centre: seeded ${cat.articles.length} articles in "${cat.name}"`);
  }
}
