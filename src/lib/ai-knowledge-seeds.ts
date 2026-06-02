/**
 * Starter content for the AI Knowledge Library.
 *
 * Three core docs every Amana OSHC org should have indexed so the bot
 * can answer day-to-day staff questions. The content here is the
 * SCAFFOLD — Amana-specific facts (mission, tagline, programmes) are
 * accurate; sections marked `[FILL IN YOUR SPECIFICS]` need the
 * admin to flesh out with the org's own procedures. Editing happens
 * in /settings/ai-knowledge after seeding.
 *
 * Writing rules baked into the scaffolds:
 *   - Clear Markdown headings (##) so the chunker splits on natural
 *     section boundaries
 *   - Front-loaded keywords staff would actually type
 *   - Synonyms in the body (e.g. "family communication / posting to
 *     families / OWNA updates / daily reports")
 *   - Procedural steps as numbered lists
 *   - "Common questions" FAQ section at the bottom of each entry
 *     so real user wording goes straight into the search index
 *
 * 2026-06-02.
 */

export interface KnowledgeSeed {
  title: string;
  body: string;
}

// ─── 1. The Amana Way ──────────────────────────────────────────────

const AMANA_WAY = `# The Amana Way

The Amana Way is our handbook of values, mission, and how we work together. Read this to understand WHO we are and HOW we do things.

## Our mission

> "To create a safe, nurturing environment where children are actively engaged in quality learning and play."

## Our tagline

**Beyond The Bell** — extending meaningful learning, play, and growth beyond the school day.

## Our values

Amana OSHC is rooted in Islamic values. Our brand personality:

- **Inviting** — we welcome every child and family warmly
- **Trustworthy** — parents can rely on us for quality, safe care
- **Approachable** — we are accessible, friendly, and easy to connect with

All communications — social media posts, parent newsletters, emails — should reflect these three qualities.

## What Amana OSHC is

We are an Australian **Outside School Hours Care (OSHC)** provider delivering subsidised educational and recreational activities for children. We operate:

- **Before School Care (BSC)** — 6:45 am to school start. "Rise and Shine Club" — a calm, structured morning to fuel children for the day
- **After School Care (ASC)** — school end to 6:30 pm. "Amana Afternoons" — structured programme with rotating activities
- **Vacation Care (VC)** — full-day care during school holidays. "Holiday Quest" — excursions, cooking, sports, themed activities

## Our programmes

| Programme | What it is |
|---|---|
| **Rise and Shine Club** | Before School Care — calm structured mornings |
| **Amana Afternoons** | After School Care — rotating engaging activities |
| **Homework Heroes** | Dedicated homework support with educators |
| **Little Champions Club** | Sports, team games, physical activity |
| **Imagination Station** | Arts, crafts, STEM projects |
| **Iqra Circle** | Quran recitation and Islamic studies in an inclusive setting |
| **Fuel Up with Amana** | Cooking and nutrition workshops |
| **Holiday Quest** | Full-day vacation care |

## Our team structure

1. **Area Manager / Director (Daniel)** — overall responsibility, ensures safety and compliance, owns the strategy
2. **Director of Service** (also called OSHC Coordinator) — experienced in childcare/OSHC, Educational Leader of the programme at a specific centre
3. **2IC Educators** — second-in-charge at larger services, supports the Director of Service, working towards becoming a Director themselves
4. **Educators** (OSHC Educators) — make up the largest part of the team. Priority is engaging with children, helps run the programme.
5. **State Manager (head_office role)** — portfolio of services across a state, handles regional operations

## Core educator responsibilities

Every educator:

- Builds positive relationships with children, families, and colleagues
- Implements the **My Time Our Place (MTOP)** framework — the national learning framework for school-age children
- Assists with planning, delivering, and evaluating educational experiences
- Upholds child-safe standards and mandatory reporting requirements
- Maintains confidentiality, professionalism, and compliance with the National Quality Standard (NQS)

## How we communicate

### With families (parent communication / posting to families)

Family communication happens through **OWNA** — our childcare management platform.

Daily, educators post updates to families through OWNA, also called the OWNA Family App or Family Portal. Posts include:

- Daily reports — what your child did today, what they learned
- Photos and videos of activities (with parental consent)
- Important announcements — closures, special events, reminders
- Incident notifications — when an injury or behaviour incident occurs

> **[FILL IN YOUR SPECIFICS]**: Document the exact step-by-step process for posting to families through OWNA — which screens to use, what content to include, how often to post, who reviews posts before they go live.

### Within the team

We use the dashboard's internal communication tools and WhatsApp for centre-level coordination. The State Manager runs weekly check-ins with each Director of Service.

### With external parties (regulators, suppliers, the community)

The Director (Daniel) or the State Manager is the point of contact for regulators (ACECQA, the state's Department of Education). Centre Directors should escalate any regulator contact upward immediately.

## Tone of voice — how we write and speak

- **Warm, friendly, and encouraging**
- **Clear and straightforward** — avoid jargon
- **Inclusive, community-oriented** language for both parents and the school community
- Reflect our Islamic values with respect — language should be inclusive, never exclusionary
- **Nurturing and positive** — celebrate children's growth
- Avoid corporate or clinical language. We are a community care provider, not a business.

✅ "We're here to help your child thrive beyond the school bell."
✅ "Quality care, rooted in values that matter."
❌ "Maximising student outcomes through evidence-based interventions."

## How we run our business — the EOS framework

We use the Entrepreneurial Operating System (EOS) to run the business. Every leader (Director and above) is expected to:

- Set **quarterly Rocks** (3-7 priorities per quarter)
- Track weekly **measurables** on the Scorecard
- Resolve **Issues** in weekly Level-10 (L10) meetings
- Complete **Todos** between meetings
- Follow the company **Vision/Traction Organizer** (V/TO)

Educators don't directly participate in EOS but should know it exists so they understand what their Director is working towards.

## What Amana OSHC is NOT

- ❌ Not a generic daycare — we are specifically OSHC (Outside School Hours Care)
- ❌ Not for younger-than-school-age children
- ❌ Imagery and language must not conflict with Islamic values
- ❌ Not corporate / sterile in tone

## Common questions (FAQ)

**Q: What does "Beyond The Bell" mean?**
A: Our tagline — it captures that we extend meaningful learning, play, and growth beyond the school day.

**Q: Who's the Director / who do I report to?**
A: Daniel is the overall Director / Area Manager. Your direct manager is your Director of Service (your centre lead, also called the OSHC Coordinator). The State Manager covers your state.

**Q: What's the OSHC educator priority?**
A: Engaging with children. Programming, family communication, and admin support that priority.

**Q: How do I post to families / send a parent update / post to OWNA?**
A: Use the OWNA Family App. See the "How we communicate" section above for the procedure, and your Director of Service for the centre-specific steps.

**Q: What's MTOP?**
A: My Time Our Place — the national learning framework for school-age children. Every Amana programme is planned against MTOP outcomes.

**Q: What's NQS?**
A: National Quality Standard — the 7 Quality Areas that ACECQA assesses every OSHC service against.
`;

// ─── 2. Employee Handbook ──────────────────────────────────────────

const EMPLOYEE_HANDBOOK = `# Amana OSHC Employee Handbook

This handbook covers your conditions of employment, leave, pay, performance, conduct, and the day-to-day workplace policies that apply to every Amana team member.

## Your employment

### Roles at Amana

- **OSHC Educator** (Cert III or working towards) — entry-level educator
- **OSHC Coordinator** (Diploma-qualified) — also called Director of Service, leads a centre
- **State Manager** — portfolio of centres
- **Marketing / Admin / Owner** — head office support

### Your contract

You'll have an Employment Contract issued via the dashboard's Contracts module. It covers your position, hours, pay rate, award level, and start date. You sign it digitally (both you and the issuing admin sign).

Your contract sits in your staff profile → Pay & Compensation. You can also re-download it via My Portal.

### Award & pay rates

Amana OSHC operates under the **Children's Services Award 2010**. Pay rates and classifications are set per the award. Your award level is on your contract.

> **[FILL IN YOUR SPECIFICS]**: Document any organisation-specific pay above-award uplifts, allowances, or rate review cycles here.

## Pay & superannuation

### When you get paid

We pay fortnightly via **Employment Hero Payroll**. Pay drops Thursday for the previous Mon–Sun cycle.

### Where to see your payslip

Open your dashboard → **My Portal** → My Payslips. You can also download payslip PDFs.

### Superannuation

Super is paid quarterly to your nominated fund. The current Superannuation Guarantee rate is set by the ATO. To update your super fund, contact admin via the dashboard.

### Common pay questions

**Q: Where do I see my payslip?**
A: My Portal → My Payslips.

**Q: When does pay come through?**
A: Fortnightly, Thursday after the Mon-Sun cycle.

**Q: How do I update my bank details?**
A: Update them in Employment Hero directly (talk to admin for an EH invite if you haven't been set up).

**Q: My payslip looks wrong / I missed a shift on it.**
A: Speak to your Director of Service within 48 hours of the payslip dropping. They'll flag the correction to admin.

## Leave

### Leave types you can apply for

- **Annual leave** — accrued at 4 weeks per year for permanent staff
- **Personal/Carer's leave** — accrued at 10 days per year for permanent staff
- **Compassionate leave** — 2 days per occasion when an immediate family member dies or has a life-threatening illness
- **Parental leave** — paid + unpaid options under the Fair Work Act
- **Study leave** — case-by-case for relevant qualifications (e.g. Diploma in Early Childhood)
- **Long service leave** — accrues per your state's Long Service Leave Act

Casual staff don't accrue paid leave (it's loaded into the casual rate) but can request unpaid time off.

### How to apply for leave

1. Open the dashboard → **My Portal** → My Leave Requests
2. Click "New leave request"
3. Choose leave type, dates, and reason (optional for annual / personal)
4. Submit
5. Your Director of Service approves in Employment Hero
6. You'll be notified when it's approved or declined

> **[FILL IN YOUR SPECIFICS]**: Add your notice periods, blackout dates (e.g. school holidays for vacation care), and any leave-specific procedures.

### Common leave questions

**Q: How do I request leave / apply for time off?**
A: My Portal → My Leave Requests → New leave request.

**Q: How much notice do I need to give?**
A: As much as possible, ideally 4+ weeks for annual leave. Personal leave can be same-day if you're unwell — call your Director of Service before your shift starts.

**Q: Can casuals take leave?**
A: Unpaid only — speak to your Director.

**Q: I'm sick today and can't come in.**
A: Call your Director of Service ASAP — ideally before 6am if you have a BSC shift, before 2:30pm for an ASC shift. Then submit a Personal leave request via My Portal.

## Performance

### Performance reviews

Every staff member has reviews on a regular cycle:

- **Probation review** — 75 days after start date. Discussion + outcome (pass / extend / end).
- **Annual review** — yearly. Self-assessment + manager assessment + rating + goals for the next year.
- **Mid-year check-in** — light-touch progress conversation.

You'll be notified via the dashboard when your review opens. Complete your self-assessment via My Portal → My Performance Reviews. Your manager fills in the manager assessment; you then acknowledge.

### Goals

Goals from your last review carry forward. Your Director of Service sets new goals at each review. Goals are tracked in the dashboard so you can see them anytime.

### Common performance questions

**Q: When's my probation review?**
A: 75 days after your start date. You'll get an in-app notification when it opens.

**Q: What happens at an annual review?**
A: You write a self-assessment, your manager writes their assessment, you discuss in a 1:1, your manager records a rating + sets goals, you acknowledge.

**Q: I disagree with my review rating — what do I do?**
A: Write your disagreement in the "Acknowledgement notes" field when you sign off. Then request a follow-up conversation with your manager and/or the State Manager.

## Conduct & expectations

### Professional conduct

- Punctual — arrive at least 10 minutes before your shift
- Professional dress code (your Director of Service will brief you on the centre standard)
- Phones off-floor during programme delivery — emergencies via the centre phone
- No social media posts about children, families, or work matters
- Maintain confidentiality of all child, family, and staff information

### Child-safe code of conduct

Every staff member must:

- Treat all children with respect and dignity
- Avoid being alone with a child in a private space — keep doors open, stay in eyeline of another educator
- Never physically discipline or restrain a child except in immediate safety
- Report any concerns about another staff member's behaviour to the Director of Service
- Complete **Child Safe Code of Conduct training** annually

### Right to disconnect

Under the Closing Loopholes No. 2 Act 2024 (s333M), you have a legal right to disconnect outside your working hours. Amana respects this — set your quiet hours in My Portal so managers know when not to contact you. The only exception is genuine emergencies (a child's safety, a centre closure).

## Compliance & training requirements

Every educator must hold and maintain current:

- **Working with Children Check (WWCC)** — mandatory under National Law s162
- **First Aid certification**
- **CPR** (re-certify annually)
- **Anaphylaxis training**
- **Asthma training**
- **Police Check**
- **Child Protection training**
- **Mandatory Reporter training** — legally required for OSHC educators
- **Child Safe Code of Conduct acknowledgement** — annual

Your certificates are tracked in your staff profile → Compliance. You'll get email reminders 30, 14, and 7 days before any cert expires. Renew BEFORE expiry — an expired cert blocks you from being rostered.

### Common compliance questions

**Q: My WWCC / First Aid is expiring — what do I do?**
A: Renew through the official channel before the expiry date, then upload the new certificate via your staff profile → Compliance. If you don't, you can't be rostered.

**Q: What if my visa is expiring?**
A: Tell admin at least 60 days before. If your visa expires you cannot legally work in Australia and you cannot be rostered.

## Workplace health & safety

### Reporting incidents and injuries

ALL incidents — child injury, staff injury, near-miss, behavioural incident — must be logged via OWNA on the same day.

1. Open OWNA → Incidents
2. Select the child (if applicable)
3. Document what happened, when, who was involved
4. Record any action taken (first aid, family notified)
5. Notify the Director of Service immediately

Serious incidents (any incident requiring medical attention, any allegation of misconduct, any death) must be reported to your Director AND to the Director (Daniel) within 1 hour.

> **[FILL IN YOUR SPECIFICS]**: Add your full Incident Reporting Procedure, with state-specific notifiable incident timelines.

### Workers compensation

If you're injured at work:

1. Get medical attention first
2. Tell your Director of Service
3. Lodge a Workers Compensation claim — admin will assist
4. Your claim is tracked in your staff profile → Health & WHS

## Equal opportunity, harassment, and grievances

### Positive duty (Respect at Work)

Amana has a legal positive duty under the *Sex Discrimination and Fair Work (Respect at Work) Amendment Act 2022* to prevent sexual harassment. We take this seriously.

### How to raise a concern

- Speak to your Director of Service first if you're comfortable
- If you're not comfortable, contact the State Manager or the Director (Daniel)
- For anonymous reporting: use the dashboard's **Safe Report** channel — your identity is never recorded

We do NOT tolerate retaliation against anyone who raises a concern in good faith.

## Common general questions (FAQ)

**Q: Where do I find my contract?**
A: My Portal → contract panel, OR Staff profile → Pay & Compensation.

**Q: How do I update my address / phone / emergency contact?**
A: Staff profile → Personal details OR Emergency contacts.

**Q: What's my position description?**
A: My Portal → My Position Description (read-only, expand to view full content).

**Q: How do I see my upcoming roster?**
A: Roster → Me (or My Portal).

**Q: How do I swap a shift?**
A: Roster → Swaps inbox. Post the shift; another staff member can claim it. Director of Service approves.
`;

// ─── 3. The Proven Process ─────────────────────────────────────────

const PROVEN_PROCESS = `# Amana's Proven Process

The Proven Process is the **operational playbook** that runs Amana OSHC. It's how we make sure every centre delivers the same quality of care, every day. Built on EOS principles.

## Why a proven process?

Every centre, every shift, every interaction with a family should feel like Amana — same warmth, same professionalism, same standards. The Proven Process is what makes that consistent.

If a Director of Service follows this process, the centre runs well. If multiple Directors follow it, the org scales without quality dropping.

## The daily centre rhythm

### Morning (Before School Care — BSC)

1. **Open the centre** — Director or 2IC arrives 15 min before opening. Check the space, set up snacks, prep the activity.
2. **Greet the first family** — warm welcome, smile, child's name
3. **Sign children in** via OWNA — required by National Law for ratio calculation
4. **Activity time** — implement the day's planned programme
5. **Breakfast** — supervised, allergen-aware
6. **Walk children to school** — head count before leaving and on arrival
7. **Close-down** — log attendance, post a daily update to families

### Afternoon (After School Care — ASC)

1. **School pickup** — head count at school AND at centre arrival; reconcile against expected attendees
2. **Sign children in** via OWNA
3. **Afternoon tea** — supervised, allergen-aware
4. **Activity rotation** — programme delivery; small groups; observe and document children's learning
5. **Family pickup** — collect children's bags, complete the parent handover; verify ID matches authorised collector
6. **Sign children out** via OWNA
7. **Programme reflection** — Director writes the day's reflection in OWNA
8. **Family update** posted via OWNA — photos + summary of the day

### Common daily-rhythm questions

**Q: What do I do at the start of my BSC shift?**
A: See the BSC section above — open, greet, sign in, run activity, supervise breakfast, walk to school.

**Q: How do I sign a child in/out?**
A: Use OWNA's roll-call screen. Tap the child, confirm time. The system enforces ratio calculations.

**Q: A parent isn't on the authorised pickup list — what do I do?**
A: Do NOT release the child. Call the parent on the file. If unresolved, call your Director of Service immediately.

## The weekly cadence

### Educator level

- **Daily reflection** at end of shift (OWNA)
- **Weekly programme planning** — review next week's activities, link to MTOP outcomes
- **Weekly 1:1 with Director of Service** (15 min) — your priorities, blockers, anything you need
- **Friday afternoon family update** — week-in-review post via OWNA

### Director of Service level

- **Weekly L10 meeting** with State Manager (90 min)
- **Scorecard update** in the dashboard before L10 — weekly KPIs for your centre
- **Issues list** — anything blocking your centre, raised at L10
- **Compliance check** — review expiring certs, missed sign-ins, incidents

### State Manager / head office level

- **Weekly L10** with the Director (Daniel)
- **Portfolio scorecard review** — all centres in the state
- **Centre visits** — at least one centre visit per week

## The quarterly cadence (EOS Rocks)

Every quarter:

1. **Quarterly Planning Session** — leadership team sets Rocks (3-7 priorities) for the quarter
2. **Each leader has personal Rocks** — what THEY are accountable for delivering in 90 days
3. **Weekly Rock reviews** at L10 — green/yellow/red status
4. **End-of-quarter review** — what got done, what didn't, what carries to next quarter

Rocks are stored in the dashboard's Rocks module.

## The hiring & onboarding process

### When you need to hire

1. **Open a vacancy** in the dashboard → Recruitment → New vacancy
2. **Link a Position Description** — pulls in selection criteria + qualifications
3. **Post the job** (channels: Indeed, Seek, community, referrals)
4. **Screen applications** as they come in
5. **Interview** shortlist (panel of 2 — Director of Service + State Manager)
6. **Reference checks** — capture in the dashboard → Staff profile → Employment Records → References. Minimum 2 references.
7. **Offer** — issue contract via Contracts module; admin signs, candidate signs
8. **Onboarding** — auto-seeded onboarding pack (7 todos + welcome announcement)
9. **Probation review** at 75 days

> **[FILL IN YOUR SPECIFICS]**: Add your interview questions, scoring rubric, and any extra screening steps.

### Common hiring questions

**Q: How do I post a job?**
A: Recruitment → New vacancy. Link a Position Description. Then post to channels.

**Q: Do I need to do reference checks?**
A: Yes — minimum 2 references for every new hire. Logged in the dashboard.

**Q: What goes into the offer?**
A: Use the Contracts module → "Issue from template" → pick the right contract template → fill in pay/hours/start date → sign as admin → email to candidate.

## The compliance & quality cadence

### NQS (National Quality Standard)

The seven NQS Quality Areas — every Amana centre is assessed against these:

- **QA1**: Educational Program and Practice
- **QA2**: Children's Health and Safety
- **QA3**: Physical Environment
- **QA4**: Staffing Arrangements
- **QA5**: Relationships with Children
- **QA6**: Collaborative Partnerships with Families and Communities
- **QA7**: Governance and Leadership

Each Director of Service maintains a current **Quality Improvement Plan (QIP)** for their centre.

### Audits

- Monthly internal compliance audit (your Director of Service runs this)
- Annual external audit
- ACECQA visits — every Amana centre will be assessed within the rating cycle

### Mandatory reporting

If you suspect a child is being abused or neglected, you MUST report. Process:

1. Recognise signs/concerns (refer to Child Protection training)
2. Report to your Director of Service immediately
3. Director (with State Manager support) reports to the appropriate state agency:
   - **NSW**: Child Protection Hotline — 13 2111
   - **VIC**: Child Protection Crisis Line — 131 278
   - **WA**: Central Intake Team — 1800 273 889
4. Document the report (in OWNA + via the dashboard's Safe Report channel if anonymous)
5. Continue to support the child

This is a LEGAL obligation. Failure to report carries fines, civil liability, and jail time.

## The financial rhythm

Mostly handled by admin, but every Director should know:

- **Centre budget** — reviewed quarterly against actuals (in the dashboard → Financials)
- **CCS subsidies** — most families are subsidised; admin reconciles weekly
- **Bookings & billing** — admin sends invoices; centres ensure attendance is accurate so invoicing matches

## The communication rhythm

- **Internal team**: WhatsApp for fast coordination, dashboard for formal todos/issues
- **With families**: OWNA daily; email for formal notices; phone for urgent
- **External**: Director (Daniel) handles regulators; admin handles vendors

## Common process questions (FAQ)

**Q: What's the daily flow at a centre?**
A: See the daily rhythm section above — open, sign in, programme, sign out, reflect, post to families.

**Q: How often do I plan the programme?**
A: Weekly. Review next week's plan against MTOP outcomes; link to children's interests and learning goals.

**Q: How do we run weekly meetings?**
A: L10 format (90 min, fixed agenda). Segue (5) → Scorecard (5) → Rock review (5) → Customer/employee headlines (5) → Todos (5) → Issues (60) → Conclude (5).

**Q: Where do I track my Rocks?**
A: Dashboard → Rocks. Personal rocks for what YOU own this quarter.

**Q: What happens at an annual NQS rating?**
A: ACECQA assesses against the 7 Quality Areas. Director of Service is the main point of contact during the visit; State Manager attends; we present our QIP.
`;

export const KNOWLEDGE_SEEDS: KnowledgeSeed[] = [
  { title: "The Amana Way", body: AMANA_WAY },
  { title: "Employee Handbook", body: EMPLOYEE_HANDBOOK },
  { title: "Proven Process", body: PROVEN_PROCESS },
];
