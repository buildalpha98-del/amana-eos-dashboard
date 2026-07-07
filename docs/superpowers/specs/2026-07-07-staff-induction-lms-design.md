# Staff Induction & Training LMS — Design Spec

**Date**: 2026-07-07
**Status**: Approved design, pending implementation plan
**Problem**: Staff start working without completing any training. The Amana Way, handbook, and existing LMS content go unread because nothing requires them. Existing training infrastructure (LMS courses, onboarding packs, policy acknowledgements, compliance certs) exists as five disconnected pieces with no enforcement, no learning verification, and no ongoing cadence.

## Goals

1. **Essential pre-start training** completed between contract signing and day 1, covering OWNA, document locations, introducing yourself to children/parents, the Amana Way, child safety, and key policies.
2. **Hard gate**: a new starter cannot be rostered or clock in until essential training is complete AND a coordinator signs off their week-1 practical checklist.
3. **Verified learning**: quizzes with pass marks, not read-and-tick.
4. **Monthly auto-assigned training** driven by an annual compliance calendar.
5. **Backfill existing staff** to the same standard with a grace period.

## Non-Goals

- External LMS integration or SCORM support.
- Ad-hoc "push training now" tooling (existing manual LMS enrolment covers this; can be improved later).
- Rebuilding policy acknowledgement, compliance certificates, or the knowledge base — the gate consumes these systems, it does not replace them.

## Key Decisions (made with Jayden, 2026-07-07)

| Decision | Choice |
|---|---|
| Access model | Dashboard account created at contract signing, locked-down "new starter" experience |
| Gate strength | Hard gate: no roster assignment, no clock-in until cleared |
| Verification | Module quizzes (80% pass, unlimited shuffled retries) + week-1 coordinator practical sign-off |
| Monthly cadence | Annual compliance calendar (12 slots), executed by cron |
| Content authoring | AI-drafted from existing Amana docs, human-reviewed, published course-by-course |
| Existing staff | Backfilled with a 5-week grace period, then the same gate applies |
| Architecture | Extend the existing LMS models (Approach A) — one training system |

Compliance note: mandatory pre-start training is paid work time under the applicable awards. Quiz attempts and module `timeSpent` are timestamped so induction hours can be evidenced.

## The Essential Curriculum (7 courses, ~4–5h, `track: essential`)

| # | Course | ~Time | Content source |
|---|---|---|---|
| 1 | The Amana Way | 45m | AmanaWayContent singleton |
| 2 | Child Safety & You | 60m | Child Safe Code of Conduct, mandatory reporter material |
| 3 | Your First Day | 30m | New content: OSHC session flow, intro scripts for children and parents |
| 4 | OWNA Essentials | 45m | New content: sign in/out, roll call, incidents, daily notes, parent comms |
| 5 | Finding What You Need | 30m | Dashboard tour; scavenger-hunt quiz |
| 6 | Policies That Matter Most | 45m | Distilled from top 6–8 PolicyDocuments, links to acknowledgement flow |
| 7 | Health & Safety Basics | 30m | Anaphylaxis/asthma awareness, first aid, emergency procedures, ratios |

Each course: 3–5 modules of 5–10 minutes ending in a quiz. Scenario-based questions over recall.

**"Ready to Work" readiness checklist** (computed, not stored): all published `essential` courses completed + WWCC certificate on file + Child Safe Code of Conduct and Privacy Policy acknowledged + profile complete (photo, phone, emergency contact).

**Week-1 practical sign-off** (coordinator-observed, org-wide template, editable): OWNA sign in/out, self-introduction to a parent, locate first aid kit / evac plan / medical action plans, find a policy on the dashboard, incident report walkthrough, supervision positioning.

**Monthly calendar year-1 draft**: Feb child protection refresher · Mar anaphylaxis & medical · Apr behaviour guidance · May emergency procedures · Jun food safety · Jul supervision · Aug complaints & feedback · Sep inclusion & additional needs · Oct sun safety · Nov incident reporting quality · Dec reflective practice & QIP · Jan annual policy refresh. (Refined during content phase; slots are admin-editable.)

## Data Model

### User — induction state machine

```prisma
enum InductionStatus {
  new_starter        // account created, hasn't begun
  in_training        // working through essential track (backfilled staff sit here with grace)
  awaiting_signoff   // readiness checklist passes; waiting on practical sign-off
  cleared            // fully inducted — may be rostered and clock in
}

// on User:
inductionStatus       InductionStatus @default(cleared)  // migration default preserves existing staff
inductionDueDate      DateTime?   // start date for new hires; grace deadline for backfill
inductionClearedAt    DateTime?
inductionClearedById  String?     // coordinator/admin who signed off
inductionGraceUntil   DateTime?   // backfill only: works while in_training until this date
inductionOverrideUntil DateTime?  // admin override exemption window (audited); reason written to ActivityLog
```

**Creating a new starter**: the user-create flows (`/api/users` POST, bulk-invite, and the `/onboarding` admin UI) gain a "New starter" option — when set, the account is created with `inductionStatus: new_starter` and `inductionDueDate` = their start date, and the welcome email uses induction-specific copy ("complete your training before day 1"). Without the flag, user creation behaves exactly as today (`cleared`) — for admin/head-office accounts and corrections.

Transitions: `new_starter → in_training` on first module interaction; `in_training → awaiting_signoff` automatic when `getInductionReadiness()` passes; `awaiting_signoff → cleared` via practical sign-off completion by a signer role (see below). Sign-off completion **re-checks readiness at that moment** — if a newly published essential course made readiness false again, the user drops back to `in_training` instead of clearing. Reverse transitions otherwise only via admin action (logged).

**Signer roles** ("coordinator+"): `member` (OSHC Coordinator), `admin`, `head_office`, `owner`. A signer cannot sign off their own induction.

**Backfilled staff skip the practical sign-off**: users with `inductionGraceUntil` set move `awaiting_signoff → cleared` automatically when readiness passes. The practical checklist validates unknown newcomers; veterans demonstrably perform these tasks daily, and requiring observed sign-offs for 100+ existing staff (including the signers themselves) would stall the backfill.

### LMS extensions

```prisma
enum LMSCourseTrack { essential  monthly  library }
// on LMSCourse:
track LMSCourseTrack @default(library)

model LMSQuizQuestion {
  id          String    @id @default(cuid())
  moduleId    String
  module      LMSModule @relation(...)
  question    String    @db.Text
  options     Json      // string[]
  correctIndex Int
  explanation String?   @db.Text   // shown after answering — teaching tool
  sortOrder   Int       @default(0)
  active      Boolean   @default(true)
}

model LMSQuizAttempt {
  id            String   @id @default(cuid())
  enrollmentId  String   // → LMSEnrollment
  moduleId      String   // → LMSModule
  answers       Json     // [{questionId, selectedIndex}]
  score         Float    // 0–100
  passed        Boolean
  attemptNumber Int
  createdAt     DateTime @default(now())
  @@index([enrollmentId, moduleId])
}

model PracticalChecklistItem {
  id          String  @id @default(cuid())
  title       String
  description String? @db.Text
  sortOrder   Int     @default(0)
  active      Boolean @default(true)
}

model PracticalSignoff {
  id         String   @id @default(cuid())
  userId     String   // the new starter
  itemId     String   // → PracticalChecklistItem
  signedById String   // the observing coordinator/admin
  signedAt   DateTime @default(now())
  notes      String?  @db.Text
  @@unique([userId, itemId])
}

model TrainingCalendarSlot {
  id       String  @id @default(cuid())
  month    Int     // 1–12
  courseId String  // → LMSCourse (track: monthly)
  active   Boolean @default(true)
  @@unique([month, courseId])
}
```

Quiz rules: pass mark 80%, unlimited attempts, option order shuffled per attempt, per-question explanation revealed after answering. **Shuffling and scoring are server-side**: the attempt-start endpoint returns questions with a persisted per-attempt option permutation (correct answers never sent to the client), and the submit endpoint maps submitted indices back through that permutation to score against `correctIndex`. A `quiz` module completes only via a passing attempt. `document`/`video` modules require minimum time-on-page (from `duration`, floor 60s) before "mark complete" activates; time recorded in existing `LMSModuleProgress.timeSpent`.

## Gate Enforcement

Single source of truth: `src/lib/induction.ts`

- `getInductionReadiness(userId)` → `{ ready, blockers: [{kind, label, href}] }` — checks essential-track course completion, WWCC on file, required policy acknowledgements, profile completeness. Only counts **published** essential courses, so rollout is gradual (gate inert until content published).
- `assertUserCleared(userId)` → throws `ApiError.forbidden` with blocker summary.

Enforcement points:
1. **Roster assignment APIs** — reject adding a non-`cleared` user to a shift; error names outstanding blockers. The implementation plan must enumerate every surface: shift create/assign, open-shift claim (`shifts/[id]/release`/claim), and any bulk-assignment path.
2. **Clock-in** — reject with "finish your induction" message across all clock paths (`roster/shifts/[id]/clock-in`, `roster/clock-in/auto`, `roster/unscheduled-clock-in`, `kiosk/clock`); kiosk shows a coordinator-readable reason.
3. **Backfill grace**: while `inductionGraceUntil` is in the future, `in_training` staff pass both checks. A daily cron flips expired-grace staff into full gating.

**Admin override**: owner/head_office only, requires a reason, writes an `ActivityLog` entry, and sets `inductionOverrideUntil` (e.g. end of the shift in question). `assertUserCleared()` passes while the window is active — expiry is a simple timestamp comparison in the check itself, no cron needed.

**New-starter locked mode**: while `inductionStatus` is `new_starter`/`in_training` *without* grace, `canAccessPage()` is overlaid to permit only: `/my-training`, `/learn/[enrollmentId]` (the course player), own profile, `/handbook`, `/policies`. Implemented as an overlay on the existing page-access system — **not** a new Role enum value (avoids the VALID_ROLES 401 class of bug). Backfilled staff with active grace keep full access.

This means when a backfilled veteran's grace **expires** without completing the essentials, they drop into locked mode alongside the roster/clock-in gate — losing general dashboard access until they finish. This is deliberate: expiry is the point at which a backfilled user is treated exactly like an uncleared new starter. Because it is a mid-employment behaviour change for an existing staff member, the final-week daily reminders (see Automation) must make the consequence explicit, and the admin override remains available for genuine edge cases.

## Learner Experience

Two surfaces: a **hub** (`/my-training`, inside the dashboard) and a dedicated **immersive course player** (`/learn/[enrollmentId]`, opens in a new tab). Both mobile-first, both added to `nav-config` + `allPages` + every role's `rolePageAccess` list (and to the locked-mode allow-list) per the new-page checklist.

### Hub — `/my-training`
- **New starters**: journey view — progress ring, courses as ordered steps, blockers list ("2 courses left, WWCC not uploaded"), what happens next. Each course card has a **Start / Continue** button that opens the player in a new tab (`target="_blank"`).
- **Cleared staff**: this month's course front and centre, overdue flags, training history, downloadable completion certificates (jsPDF, existing branding pattern) — each also launching the player.

### Immersive course player — `/learn/[enrollmentId]` (new tab)
A focused, full-screen player **without the main dashboard chrome** — the learner does one thing: work through the course.

- **Click-through, sequential flow**: one module at a time with a top progress bar and Prev/Next. **Next is gated** — a content module unlocks Next only after the minimum time-on-page (from `duration`, floor 60s); a quiz module unlocks Next only after a passing attempt. Read → then answer, module by module, exactly as described.
- **Rich, interactive content per module** — rendered with the existing react-markdown + remark-gfm + rehype-sanitize stack, extended for media:
  - **Photos**: uploaded through the existing authenticated `/api/upload` endpoint (Vercel Blob; already accepts png/jpeg/gif/webp/heic, 10MB limit), inserted as markdown images and placeable anywhere in a module. Multiple per module.
  - **Videos**: embedded from YouTube, Loom, or Vimeo URLs, auto-rendered as responsive iframes (the established `resourceUrl`/`videoUrl` embed pattern). A module may carry a primary video plus additional embeds inline. No direct large-file video upload — embeds only (cost + bandwidth).
  - Optional linked documents (`documentId`) render as download cards.
- **Quiz UI**: one question at a time or a scrollable set, instant per-question feedback with the `explanation` shown after answering, score + pass/fail summary, retry on fail (fresh shuffle).
- **Completion screen**: celebration, updated readiness ("1 course left before you're ready to work"), and a link back to the hub. Progress persists per module via the existing `LMSModuleProgress`, so closing the tab resumes where they left off.

### Authoring (admin, inside `/onboarding` course editor)
The course/module editor gains: an **image-upload button** (calls `/api/upload`, inserts the returned Blob URL as a markdown image), a **video embed field** (paste a YouTube/Loom/Vimeo link), and the quiz question editor (question, options, correct answer, explanation). A live preview renders the module exactly as the player will.

**Security note**: supporting inline media requires widening the `rehype-sanitize` allow-list to permit `<img>` (Blob-host `src` only) and `<iframe>` (whitelisted video hosts: youtube.com/youtube-nocookie.com, loom.com, vimeo.com). This is a scoped, reviewed change to the sanitizer schema with an explicit host allow-list — not a blanket relaxation — and must be unit-tested against script-injection payloads.

**Admin additions to `/onboarding` (Staff Lifecycle)**:
- Induction pipeline board: who is at which stage, days in stage, blockers.
- Practical sign-off queue: coordinators tick observed items per new starter (phone-friendly).
- Training calendar editor (12 slots → monthly-track courses).
- Quiz question editor inside course/module editing.
- Backfill launch action (one-time, confirmation gated).

## Automation

**Monthly assignment** — extend `/api/cron/auto-onboarding`: on the 1st (AEST), read active `TrainingCalendarSlot` rows for the month, enrol all active `cleared` users in those courses (skip existing enrolments), due last day of month.

**Reminder ladder** (email via existing template system + in-app notification, respecting suppression):
- Monthly course: on assignment, T-7, T-2, overdue.
- New starters: nudges keyed to `inductionDueDate` — day 1, then every 3 days, escalating to coordinator at T-3.
- Backfill: weekly nudge; final-week daily.
- **Admin visibility**: Monday summary email to admins/coordinators — completion % per service, overdue list, pipeline stage counts.

New cron: `/api/cron/induction-grace` (daily) — expire grace windows, escalate. Both crons follow the standard pattern (CRON_SECRET, `acquireCronLock`, `withApiHandler`, `vercel.json` schedule).

## Content Pipeline

All 7 essential courses drafted (modules + quiz banks) from existing sources (AmanaWayContent, handbook singletons, PolicyDocuments, knowledge base articles) as **seed data in `draft` status**. Jayden's team reviews in the course editor and publishes course-by-course. The gate only counts published essential courses. Monthly-track courses drafted the same way, prioritising Feb–Apr slots.

## Rollout

1. Ship schema + gate machinery + learner UI. All existing staff default `cleared` — zero behaviour change on deploy.
2. Publish essential courses as review completes.
3. **Backfill launch** (admin action): enrol all active staff in the essential track, set `in_training` + `inductionGraceUntil` = +5 weeks, notify. Weekly completion reports run.
4. Grace expiry: uncompleted staff become gated (cron).
5. New hires from launch: account created with the "New starter" flag at contract signing → full journey.

The implementation plan should mirror these phases (schema + gate machinery → learner/admin UI → crons + backfill → seed content) rather than one monolithic pass.

## Testing

Per existing route-test conventions (Vitest, prisma-mock, input-based mock routing):
- Gate: roster reject / clock-in reject / kiosk reject for each non-cleared status; grace-window pass; override window pass + expiry + audit record.
- Readiness: each blocker type individually; unpublished-course exclusion; empty-curriculum inert gate.
- State machine: all legal transitions; illegal transitions rejected; backfill auto-clear (grace set, no practical needed); sign-off re-checks readiness; new-starter flag on user creation sets `new_starter` + due date, default flow stays `cleared`; self-sign-off rejected.
- Quiz: scoring, pass boundary (exactly 80%), attempt numbering, shuffled options, quiz-gated module completion.
- Crons: auth rejection, lock skip, happy path (monthly enrol dedup, grace expiry) for both crons.
- Practical sign-off: completion triggers `cleared` only from `awaiting_signoff`; permission checks (coordinator+ only).
- Player gating: content-module Next locked until min time-on-page; quiz-module Next locked until a passing attempt; progress resumes after tab close.
- Sanitizer: widened `rehype-sanitize` schema renders whitelisted `<img>`/`<iframe>` but strips `<script>`, `on*` handlers, `javascript:` URLs, and non-whitelisted iframe hosts.

## Risks

- **Kiosk UX**: a blocked clock-in must fail with a human-readable reason at the kiosk, or coordinators will phone Jayden. Mitigated by explicit kiosk error copy.
- **Content bottleneck**: system ships before content review finishes. Mitigated by publish-as-you-go gate design.
- **Backfill friction**: 5-week deadline must be communicated by leadership, not just email. Out of software scope; flagged for P&C comms.
- **Award/paid-time**: induction hours are evidenced via timestamps; payroll treatment is a P&C policy decision outside this system.
