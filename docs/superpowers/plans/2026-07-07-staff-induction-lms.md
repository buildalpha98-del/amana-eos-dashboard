# Staff Induction & Training LMS — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make essential training a hard prerequisite for working — a new starter cannot be rostered or clock in until they complete a media-rich, quiz-verified induction and a State Manager/Admin signs off their week-1 practical — and auto-assign monthly training from an annual calendar.

**Architecture:** Extend the existing LMS models (`LMSCourse`/`LMSModule`/`LMSEnrollment`/`LMSModuleProgress`) rather than build a parallel system. Add an induction state machine on `User`, a single gate library (`src/lib/induction.ts`) enforced at all 6 roster/clock surfaces, a proper quiz-question model with server-side scoring, a practical sign-off model, an immersive full-screen course player at `/learn/[enrollmentId]` (new tab) with sanitized inline media, and two crons (monthly assignment + grace expiry). Everything ships with existing staff defaulted to `cleared` so deploy day is a no-op; the gate activates as courses are published and the backfill is launched.

**Tech Stack:** Next.js 16 (App Router), Prisma 5.22 + PostgreSQL (Neon), NextAuth, TanStack Query, Tailwind, react-markdown + remark-gfm + rehype-sanitize, jsPDF, Vitest (route tests with prisma-mock), Vercel cron.

**Spec:** `docs/superpowers/specs/2026-07-07-staff-induction-lms-design.md`

---

## Conventions (read once, apply everywhere)

- **API routes**: session routes use `withApiAuth(handler, { roles?, rateLimit? })` from `@/lib/server-auth`; cron/public use `withApiHandler` from `@/lib/api-handler`. Validate every write body with Zod `.safeParse()` using **Prisma enum values** in `z.enum([...])`. Read the body with `parseJsonBody(req)`. Throw `ApiError.badRequest/forbidden/notFound/conflict` — never `return {error}`.
- **Client hooks**: every `useQuery` has `retry: 2` + `staleTime: 30_000`; query keys use **primitive** values. Every `useMutation` has `onError: (err) => toast({ variant: "destructive", description: err.message || "Something went wrong" })`. Use `fetchApi`/`mutateApi` from `@/lib/fetch-api`.
- **Tests**: Vitest, `src/__tests__/api/...`. Use `prisma-mock.ts` (input-based `mockImplementation`, not `mockResolvedValueOnce` chains), `auth-mock.ts` (`mockSession`/`mockNoSession`), `request.ts` (`createRequest`). Clear in-memory caches in `beforeEach`.
- **Migrations**: `npx prisma migrate dev --name <name>` to create+apply against the local `.env.local` DB (an **empty dev clone**, safe). Review generated SQL before committing. Never `db push` for tracked changes. (See memory `reference_local-db-and-worktrees` and `reference_neon_migration_recovery`.)
- **Roles**: 8 roles — `owner`, `head_office` ("State Manager"), `admin`, `marketing`, `member` (on-site service lead), `staff` ("Educator"), `eos_viewer`, `eos_implementer`. **Signer roles** for practical sign-off = `head_office`, `admin`, `owner` only. Admin-like helper: `isAdminRole(role)` (owner/head_office/admin).
- **New page checklist**: add route to `allPages` AND every role's `rolePageAccess` in `src/lib/role-permissions.ts`, add nav item in `src/lib/nav-config.ts`, verify `canAccessPage()`.
- **New cron checklist**: `verifyCronSecret(req)`, `acquireCronLock(name, period)`, `withApiHandler`, schedule in `vercel.json`, test auth-reject + lock-skip + happy paths.
- **Commit cadence**: commit after every green test (per-step commits below). Branch: create a feature branch off `main` before Task 1.

## File Structure (what gets created/modified)

**Created**
- `src/lib/induction.ts` — gate single-source-of-truth: `getInductionReadiness`, `assertUserCleared`, `isInductionLocked`, transition helpers.
- `src/lib/quiz.ts` — server-side quiz shuffle + score (pure functions, unit-tested).
- `src/lib/lms-sanitize-schema.ts` — the widened rehype-sanitize schema scoped to the player only.
- `src/app/api/induction/readiness/route.ts` — GET current user's (or a target user's) readiness + blockers.
- `src/app/api/induction/signoff/route.ts` — POST practical sign-off item (signer roles only).
- `src/app/api/induction/override/route.ts` — POST admin override window (owner/head_office).
- `src/app/api/lms/modules/[id]/quiz/route.ts` — GET start attempt (shuffled, no answers), POST submit attempt (scored server-side).
- `src/app/api/lms/quiz-questions/route.ts` + `/[id]/route.ts` — admin quiz question CRUD.
- `src/app/api/training-calendar/route.ts` + `/[id]/route.ts` — 12-slot calendar CRUD.
- `src/app/api/induction/backfill/route.ts` — one-time backfill launcher (owner/head_office).
- `src/app/api/cron/training-monthly/route.ts` — monthly calendar auto-enrol.
- `src/app/api/cron/induction-grace/route.ts` — expire grace windows + escalate.
- `src/app/(dashboard)/my-training/page.tsx` + `MyTrainingContent.tsx` — learner hub.
- `src/app/learn/[enrollmentId]/page.tsx` + `CoursePlayer.tsx` + `ModuleContent.tsx` + `QuizPlayer.tsx` — immersive player (route group OUTSIDE `(dashboard)` so it renders without sidebar chrome).
- `src/components/induction/InductionPipelineBoard.tsx`, `PracticalSignoffQueue.tsx`, `TrainingCalendarEditor.tsx`, `QuizQuestionEditor.tsx`, `MediaModuleEditor.tsx` — admin UI (mounted in `/onboarding`).
- `src/hooks/useInduction.ts` — readiness, signoff, override, backfill.
- `src/hooks/useQuiz.ts` — start/submit attempt.
- `src/hooks/useTrainingCalendar.ts` — calendar CRUD.
- `prisma/seed-induction.ts` — seed the 7 essential courses + practical checklist items + calendar (draft).
- Test files mirroring each API route under `src/__tests__/api/...` and lib tests under `src/__tests__/lib/`.

**Modified**
- `prisma/schema.prisma` — `InductionStatus` enum; User induction fields; `LMSCourseTrack` enum + `track` on `LMSCourse`; `LMSQuizQuestion`, `LMSQuizAttempt`, `PracticalChecklistItem`, `PracticalSignoff`, `TrainingCalendarSlot` models + relations.
- 6 enforcement routes (roster/clock/kiosk) — insert `assertUserCleared`.
- `src/lib/auth.ts` — add `inductionStatus` + `inductionGraceUntil` to JWT + session.
- `src/middleware.ts` — locked-mode overlay for non-cleared users.
- `src/lib/role-permissions.ts` — add `/my-training` to `allPages` + every role list; export `INDUCTION_ALLOWED_PATHS`.
- `src/lib/nav-config.ts` — add "My Training" nav item.
- `src/app/api/users/route.ts` + `bulk-invite` — "New starter" flag → sets `new_starter` + `inductionDueDate`.
- `src/components/onboarding/*` / `/onboarding` page — mount admin induction tabs.
- `src/lib/email-templates/*` — induction welcome, reminders, admin summary.
- `vercel.json` — two new cron schedules.

---

## Chunk 1: Schema & migration

### Task 1: Add induction + LMS-training models to Prisma schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the `InductionStatus` and `LMSCourseTrack` enums** near the other LMS enums (~line 3358).

```prisma
enum InductionStatus {
  new_starter
  in_training
  awaiting_signoff
  cleared
}

enum LMSCourseTrack {
  essential
  monthly
  library
}
```

- [ ] **Step 2: Add induction fields to `User`** (in the Staff Profile section, alongside `startDate`).

```prisma
  inductionStatus        InductionStatus @default(cleared)
  inductionDueDate       DateTime?
  inductionClearedAt     DateTime?
  inductionClearedById   String?
  inductionGraceUntil    DateTime?
  inductionOverrideUntil DateTime?
  practicalSignoffs      PracticalSignoff[] @relation("SignoffSubject")
  practicalSignoffsGiven PracticalSignoff[] @relation("SignoffSigner")
```

- [ ] **Step 3: Add `track` to `LMSCourse`** (after `isRequired`).

```prisma
  track       LMSCourseTrack  @default(library)
```

Add `@@index([track])` to the `LMSCourse` block.

- [ ] **Step 4: Add the new models** at the end of the LMS section.

```prisma
model LMSQuizQuestion {
  id           String    @id @default(cuid())
  moduleId     String
  module       LMSModule @relation(fields: [moduleId], references: [id], onDelete: Cascade)
  question     String    @db.Text
  options      Json      // string[]
  correctIndex Int
  explanation  String?   @db.Text
  sortOrder    Int       @default(0)
  active       Boolean   @default(true)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  @@index([moduleId])
}

model LMSQuizAttempt {
  id            String   @id @default(cuid())
  enrollmentId  String
  enrollment    LMSEnrollment @relation(fields: [enrollmentId], references: [id], onDelete: Cascade)
  moduleId      String
  module        LMSModule     @relation(fields: [moduleId], references: [id], onDelete: Cascade)
  answers       Json     // [{questionId, selectedIndex}]
  score         Float
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
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  signoffs PracticalSignoff[]
}

model PracticalSignoff {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation("SignoffSubject", fields: [userId], references: [id], onDelete: Cascade)
  itemId     String
  item       PracticalChecklistItem @relation(fields: [itemId], references: [id], onDelete: Cascade)
  signedById String
  signedBy   User     @relation("SignoffSigner", fields: [signedById], references: [id], onDelete: Cascade)
  signedAt   DateTime @default(now())
  notes      String?  @db.Text

  @@unique([userId, itemId])
  @@index([userId])
}

model TrainingCalendarSlot {
  id       String  @id @default(cuid())
  month    Int     // 1–12
  courseId String
  course   LMSCourse @relation("CalendarCourse", fields: [courseId], references: [id], onDelete: Cascade)
  active   Boolean @default(true)

  @@unique([month, courseId])
}
```

- [ ] **Step 5: Add back-relations** on `LMSModule` (`quizQuestions LMSQuizQuestion[]`, `quizAttempts LMSQuizAttempt[]`), `LMSEnrollment` (`quizAttempts LMSQuizAttempt[]`), and `LMSCourse` (`calendarSlots TrainingCalendarSlot[] @relation("CalendarCourse")`).

- [ ] **Step 6: Generate + apply the migration.**

Run: `npx prisma migrate dev --name induction_and_training_lms`
Expected: migration created under `prisma/migrations/`, applied to local dev DB, `prisma generate` runs. Open the generated SQL and confirm: new enums, `ALTER TABLE "User" ADD COLUMN ... DEFAULT 'cleared'`, new tables. The `cleared` default is critical — it preserves existing staff.

- [ ] **Step 7: Commit.**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(induction): schema — state machine, quiz, practical sign-off, training calendar"
```

---

## Chunk 2: Gate library + enforcement

### Task 2: `src/lib/induction.ts` — readiness & gate (the heart of the system)

**Files:**
- Create: `src/lib/induction.ts`
- Test: `src/__tests__/lib/induction.test.ts`

- [ ] **Step 1: Write failing tests** for `getInductionReadiness` and `assertUserCleared`. Cover: (a) all essential courses complete + WWCC + policies + profile → `ready:true`; (b) each blocker in isolation → `ready:false` with the right blocker; (c) **unpublished** essential courses are excluded (a draft course never blocks); (d) empty essential curriculum → `ready:true` (inert gate); (e) `assertUserCleared` passes when status `cleared`; (f) passes when `inductionGraceUntil` in the future; (g) passes when `inductionOverrideUntil` in the future; (h) throws `ApiError.forbidden` with blocker summary otherwise.

Use prisma-mock with input-based routing (mock `lMSCourse.findMany` for published essential courses, `lMSEnrollment.findMany` for the user's completions, `complianceCertificate.findFirst` for WWCC, `policyDocumentAcknowledgement.findMany`, `user.findUnique` for profile fields).

- [ ] **Step 2: Run tests, verify they fail.** `npx vitest run src/__tests__/lib/induction.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/induction.ts`.**

```typescript
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";

export type Blocker = { kind: string; label: string; href: string };

/** Paths a locked (new_starter / in_training-without-grace) user may still reach. */
export const INDUCTION_ALLOWED_PREFIXES = [
  "/my-training",
  "/learn",
  "/profile",
  "/handbook",
  "/policies",
] as const;

const WWCC_TYPE = "wwcc";
// Titles of policies a new starter must acknowledge before clearing.
export const REQUIRED_POLICY_TITLES = [
  "Child Safe Code of Conduct",
  "Privacy Policy",
];

export async function getInductionReadiness(
  userId: string,
): Promise<{ ready: boolean; blockers: Blocker[] }> {
  const blockers: Blocker[] = [];

  // 1. Essential courses — only PUBLISHED ones count (gradual rollout).
  const essential = await prisma.lMSCourse.findMany({
    where: { track: "essential", status: "published", deleted: false },
    select: { id: true, title: true },
  });
  if (essential.length > 0) {
    const enrollments = await prisma.lMSEnrollment.findMany({
      where: { userId, courseId: { in: essential.map((c) => c.id) } },
      select: { courseId: true, status: true },
    });
    const doneCourseIds = new Set(
      enrollments.filter((e) => e.status === "completed").map((e) => e.courseId),
    );
    const remaining = essential.filter((c) => !doneCourseIds.has(c.id));
    if (remaining.length > 0) {
      blockers.push({
        kind: "courses",
        label: `${remaining.length} training course${remaining.length > 1 ? "s" : ""} left`,
        href: "/my-training",
      });
    }
  }

  // 2. WWCC on file (any non-superseded cert of type wwcc for this user).
  const wwcc = await prisma.complianceCertificate.findFirst({
    where: { userId, type: WWCC_TYPE, supersededAt: null },
    select: { id: true },
  });
  if (!wwcc) {
    blockers.push({ kind: "wwcc", label: "WWCC not uploaded", href: "/profile" });
  }

  // 3. Required policy acknowledgements (current version of each).
  const policies = await prisma.policyDocument.findMany({
    where: { title: { in: REQUIRED_POLICY_TITLES }, isArchived: false },
    select: { title: true, currentVersionId: true },
  });
  if (policies.length > 0) {
    const acks = await prisma.policyDocumentAcknowledgement.findMany({
      where: {
        userId,
        versionId: { in: policies.map((p) => p.currentVersionId).filter(Boolean) as string[] },
      },
      select: { versionId: true },
    });
    const ackedVersions = new Set(acks.map((a) => a.versionId));
    const unacked = policies.filter(
      (p) => !p.currentVersionId || !ackedVersions.has(p.currentVersionId),
    );
    if (unacked.length > 0) {
      blockers.push({
        kind: "policies",
        label: `${unacked.length} policy acknowledgement${unacked.length > 1 ? "s" : ""} outstanding`,
        href: "/policies",
      });
    }
  }

  // 4. Profile completeness — photo, phone, at least one emergency contact.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      avatar: true,
      phone: true,
      _count: { select: { emergencyContacts: true } },
    },
  });
  if (!user?.avatar || !user?.phone || (user?._count.emergencyContacts ?? 0) === 0) {
    blockers.push({ kind: "profile", label: "Profile incomplete", href: "/profile" });
  }

  return { ready: blockers.length === 0, blockers };
}

/** Throws unless the user may be rostered / clock in right now. */
export async function assertUserCleared(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      inductionStatus: true,
      inductionGraceUntil: true,
      inductionOverrideUntil: true,
    },
  });
  if (!user) throw ApiError.notFound("User not found");

  if (user.inductionStatus === "cleared") return;

  const now = new Date();
  if (user.inductionOverrideUntil && user.inductionOverrideUntil > now) return;
  if (user.inductionGraceUntil && user.inductionGraceUntil > now) return;

  const { blockers } = await getInductionReadiness(userId);
  const summary = blockers.map((b) => b.label).join(", ") || "induction incomplete";
  throw ApiError.forbidden(
    `Induction not complete — cannot roster or clock in. Outstanding: ${summary}. Finish at /my-training.`,
  );
}

/** Middleware helper: is this user in locked (restricted-nav) mode? */
export function isInductionLocked(
  status: string | undefined,
  graceUntil: Date | string | null | undefined,
  now = new Date(),
): boolean {
  if (status !== "new_starter" && status !== "in_training") return false;
  if (graceUntil && new Date(graceUntil) > now) return false; // backfilled w/ active grace
  return true;
}
```

> Note for the implementer: `isInductionLocked` takes `now` as a param so tests are deterministic — do NOT call `Date.now()` inside without allowing injection.

- [ ] **Step 4: Run tests, verify pass.** `npx vitest run src/__tests__/lib/induction.test.ts` → PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/induction.ts src/__tests__/lib/induction.test.ts
git commit -m "feat(induction): readiness + gate library (src/lib/induction.ts)"
```

### Task 3: Insert the gate at all 6 roster/clock surfaces

**Files (modify + a test each):**
- `src/app/api/roster/shifts/route.ts` (POST, inside `if (data.userId)` after `assertStaffCertsValidForShift`)
- `src/app/api/roster/shifts/[id]/claim/route.ts` (after cert check, using `session.user.id`)
- `src/app/api/roster/shifts/[id]/clock-in/route.ts` (after the `shift.userId !== session.user.id` check)
- `src/app/api/roster/clock-in/auto/route.ts` (top, after `const userId = session.user.id`)
- `src/app/api/roster/unscheduled-clock-in/route.ts` (after serviceId resolution)
- `src/app/api/kiosk/clock/route.ts` (after `if (!pinOk) return fail;`)

For each of the 5 `withApiAuth` routes, the insertion is identical:

```typescript
import { assertUserCleared } from "@/lib/induction";
// ...at the documented insertion point:
await assertUserCleared(<userId>);   // throws ApiError.forbidden if not cleared
```

The **kiosk** route is not `withApiAuth` and returns JSON directly, so wrap it:

```typescript
import { assertUserCleared } from "@/lib/induction";
import { ApiError } from "@/lib/api-error";
// after PIN verification:
try {
  await assertUserCleared(userId);
} catch (e) {
  const msg = e instanceof ApiError ? e.message : "Induction incomplete.";
  return NextResponse.json(
    { error: `Cannot clock in — ${msg}` },
    { status: 403 },
  );
}
```

- [ ] **Step 1 (per route): Write a failing test** asserting a non-cleared user is rejected (403) and a cleared user proceeds. Add these cases to the existing route test file where one exists (e.g. `src/__tests__/api/roster/*`), else create it. Mock `user.findUnique` to return `inductionStatus: "in_training"` (no grace) for the reject case and `"cleared"` for the pass case. For kiosk, assert the JSON `{ error }` + 403.
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Add the `assertUserCleared` call** at the documented point.
- [ ] **Step 4: Run → pass.** Also run the full roster/kiosk test files to confirm no regression: `npx vitest run src/__tests__/api/roster src/__tests__/api/kiosk`.
- [ ] **Step 5: Commit** (one commit for all 6, or per-route — implementer's choice):

```bash
git commit -am "feat(induction): enforce clearance gate at roster assignment, claim, and all clock-in paths"
```

> Edge case to test explicitly: a backfilled user with `inductionGraceUntil` in the future must PASS the gate (they keep working during grace). An override with `inductionOverrideUntil` in the future must PASS.

### Task 4: Locked-mode — extend session + middleware

**Files:**
- Modify: `src/lib/auth.ts` (JWT + session callbacks)
- Modify: `src/middleware.ts`
- Modify: `src/lib/role-permissions.ts` (export `INDUCTION_ALLOWED_PATHS` matcher; add `/my-training`)
- Test: `src/__tests__/lib/induction-lock.test.ts`

- [ ] **Step 1: Add `inductionStatus` + `inductionGraceUntil` to the JWT and session.** In `src/lib/auth.ts`, the `jwt` callback already loads the user; extend the `select` to include `inductionStatus` and `inductionGraceUntil`, and set them on the token (refresh on the same cadence as `rolePageOverride`). In the `session` callback, copy them onto `session.user`. Update the `next-auth.d.ts` type augmentation to include both fields.

- [ ] **Step 2: Enforce locked-mode in `src/middleware.ts`.** After the existing `canAccessPage` block, add:

```typescript
import { isInductionLocked } from "@/lib/induction";
import { INDUCTION_ALLOWED_PREFIXES } from "@/lib/induction";
// ...
const locked = isInductionLocked(
  token?.inductionStatus as string | undefined,
  token?.inductionGraceUntil as string | null | undefined,
);
if (locked && !pathname.startsWith("/api/")) {
  const allowed = INDUCTION_ALLOWED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!allowed) {
    const url = req.nextUrl.clone();
    url.pathname = "/my-training";
    return NextResponse.redirect(url);
  }
}
```

> Why middleware and not `rolePageAccess`: locked-mode is **per-user** (keyed on `inductionStatus`), while the existing override system is **per-role**. Reusing the role override would lock every user of that role. Keep them separate. This also avoids adding a Role enum value (the `VALID_ROLES` 401 class of bug — see memory `project_eos-roles`).

- [ ] **Step 3: Client sidebar parity.** In the sidebar/nav filter that calls `canAccessPage`, also read `session.user.inductionStatus`/`inductionGraceUntil` and, when `isInductionLocked` is true, show only the induction nav items. (Find the component rendering the sidebar from `nav-config`; apply the same `INDUCTION_ALLOWED_PREFIXES` filter.)

- [ ] **Step 4: Tests** for `isInductionLocked`: new_starter → locked; in_training no grace → locked; in_training future grace → unlocked; cleared → unlocked; awaiting_signoff → unlocked (they've done the training, just waiting on sign-off — they should see the dashboard). Verify a locked user hitting `/rocks` redirects, `/my-training` and `/learn/x` pass.

- [ ] **Step 5: Run → pass. Commit.**

```bash
git commit -am "feat(induction): per-user locked-mode via session + middleware overlay"
```

---

## Chunk 3: Quiz engine + practical sign-off + new-starter creation

### Task 5: `src/lib/quiz.ts` — server-side shuffle + score

**Files:**
- Create: `src/lib/quiz.ts`
- Test: `src/__tests__/lib/quiz.test.ts`

Pure functions (no DB) so they're trivially testable and the correct answers never reach the client.

- [ ] **Step 1: Failing tests.** `shuffleQuestion(q, seed)` returns options in a deterministic permutation for a given seed + the mapping from displayed index → original index; `scoreAttempt(questions, submitted)` returns `{ score, passed }` where score is `% correct` and `passed = score >= 80`; exactly 80% passes; a submitted index is mapped back through the attempt's permutation before comparing to `correctIndex`.

- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement.** Seeded shuffle (do NOT use `Math.random()` — it's unavailable in some contexts and non-deterministic; use an index-derived seed, e.g. a small LCG over `enrollmentId+moduleId+attemptNumber`). `PASS_MARK = 80`.
- [ ] **Step 4: Run → pass. Commit.**

### Task 6: Quiz attempt API — `src/app/api/lms/modules/[id]/quiz/route.ts`

**Files:**
- Create route + `src/__tests__/api/lms/quiz.test.ts`

- [ ] **GET** (start attempt): auth user must own an enrollment covering this module's course. Load active `LMSQuizQuestion`s, compute the next `attemptNumber`, apply `shuffleQuestion` per question, return `{ attemptNumber, questions: [{ id, question, options(shuffled) }] }` — **never** `correctIndex` or `explanation`. Persist nothing yet (or persist the permutation seed = attemptNumber so submit can re-derive it).
- [ ] **POST** (submit): body `{ answers: [{questionId, selectedIndex}] }` (Zod). Re-derive each question's permutation from the same seed, map indices, call `scoreAttempt`, create `LMSQuizAttempt` with `score/passed/attemptNumber/answers`. If `passed`, upsert `LMSModuleProgress.completed = true` for this module, then **recalculate enrollment status** using the existing pattern from `enrollments/route.ts` (required-modules-complete → `completed`). Return `{ score, passed, explanations: [{questionId, correctIndex, explanation}] }` (explanations returned only AFTER submit — the teaching moment).
- [ ] Tests: pass path completes the module; fail path records attempt but leaves module incomplete; attemptNumber increments; non-owner 403; unknown module 404; a passing quiz that completes the last required module flips enrollment to `completed` and (if this is the last essential course) leaves the user eligible for `awaiting_signoff` (verified in Task 8).
- [ ] Commit.

### Task 7: Quiz question admin CRUD + `useQuiz` hook

**Files:**
- Create: `src/app/api/lms/quiz-questions/route.ts` (GET by moduleId, POST create — `withApiAuth`, `roles: admin-like`), `/[id]/route.ts` (PATCH/DELETE).
- Create: `src/hooks/useQuiz.ts` (`useStartQuiz`, `useSubmitQuiz`, `useModuleQuestions`, `useSaveQuestion`) following `useLMS.ts` conventions exactly.
- Tests for the CRUD route (auth 401, role 403, validation 400, happy 201).
- [ ] Standard TDD steps + commit.

### Task 8: Practical sign-off + state transitions

**Files:**
- Create: `src/app/api/induction/signoff/route.ts` + test
- Create: `src/app/api/induction/readiness/route.ts` + test
- Modify: `src/lib/induction.ts` — add `recomputeInductionState(userId)`

- [ ] **Step 1: `recomputeInductionState(userId)`** (add to `induction.ts`, unit-tested): loads the user; if status `cleared` do nothing; compute readiness; then:
  - If not ready and status is `awaiting_signoff` → set back to `in_training` (a newly-published essential course regressed readiness).
  - If ready and user has `inductionGraceUntil` set (backfilled) → set `cleared` + `inductionClearedAt` (backfill skips practical).
  - If ready and NOT backfilled → set `awaiting_signoff` (waiting on practical).
  - On first module interaction elsewhere, `new_starter → in_training` (handled in quiz/module-progress submit: if status `new_starter`, bump to `in_training`).
- [ ] **Step 2: `GET /api/induction/readiness`** — returns `getInductionReadiness` for the current user, or for `?userId=` if caller `isAdminRole`. Include current `inductionStatus` and practical checklist completion.
- [ ] **Step 3: `POST /api/induction/signoff`** — signer roles (`head_office`/`admin`/`owner`) only; body `{ userId, itemId, notes? }` (Zod). Reject `signedById === userId` (no self-sign-off). Upsert `PracticalSignoff`. After each, check if ALL active `PracticalChecklistItem`s are signed AND readiness passes AND status is `awaiting_signoff` → set `cleared` + `inductionClearedAt` + `inductionClearedById`. Return updated status.
- [ ] **Step 4: Tests** — signer role matrix (`member`/`staff` → 403; `head_office`/`admin`/`owner` → 200); self-sign-off rejected; completing the last item from `awaiting_signoff` clears; from `in_training` does NOT clear (readiness must pass first); backfilled user auto-clears on readiness without any practical rows; sign-off re-checks readiness (regression drop-back).
- [ ] Commit.

### Task 9: Admin override endpoint

**Files:** `src/app/api/induction/override/route.ts` + test.
- [ ] `POST` owner/head_office only; body `{ userId, until: ISO, reason: string(min 3) }`. Set `inductionOverrideUntil = until`; write an `ActivityLog` entry (action `induction.override`, actorId, targetUserId, reason). Return ok. Tests: role gate, reason required, ActivityLog written, `assertUserCleared` passes within the window (integration-style with mock).
- [ ] Commit.

### Task 10: "New starter" creation flag

**Files:**
- Modify: `src/app/api/users/route.ts` (POST), `src/app/api/users/bulk-invite/route.ts`
- Test: extend existing users route tests

- [ ] Add optional `newStarter?: boolean` + `startDate?: ISO` to the create Zod schema. When `newStarter` is true, create the user with `inductionStatus: "new_starter"` and `inductionDueDate: startDate ?? null`, and send the induction-welcome email variant (Task 17). When absent/false, behaviour is unchanged (`cleared`). Bulk-invite: accept a `newStarter` column.
- [ ] Tests: `newStarter:true` → `new_starter` + due date; default → `cleared`; admin accounts created without the flag are never gated.
- [ ] Commit.

---

## Chunk 4: Learner UI — hub + immersive player + sanitized media

### Task 11: Sanitizer schema (security-scoped)

**Files:**
- Create: `src/lib/lms-sanitize-schema.ts`
- Test: `src/__tests__/lib/lms-sanitize-schema.test.ts`

- [ ] **Step 1: Failing tests** feeding hostile input through `rehype-sanitize` with the widened schema: `<script>`, `<img src=x onerror=alert(1)>`, `<iframe src="javascript:...">`, `<iframe src="https://evil.com">` are all stripped/neutralised; `<img src="https://<blob-host>/x.png">` and `<iframe src="https://www.youtube.com/embed/x">`, loom.com, player.vimeo.com survive.
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** by cloning `defaultSchema` from `rehype-sanitize` and extending: allow `img` (`src`, `alt`), allow `iframe` (`src`, `allow`, `allowfullscreen`, `width`, `height`), and add `protocols.src`/host constraints. Since `rehype-sanitize` can't host-filter by itself, add a tiny companion `rehype` plugin (or a pre-pass) that drops `img`/`iframe` whose `src` host isn't in the allow-list (`BLOB_HOST`, `youtube.com`, `youtube-nocookie.com`, `loom.com`, `vimeo.com`, `player.vimeo.com`). Export both the schema and the host-filter plugin as a pair `LMS_MARKDOWN_PLUGINS`.

> HARD CONSTRAINT (from spec): this schema/plugin pair is imported ONLY by the course player module renderer. Do NOT modify `ReportViewer.tsx`, `AiDraftReviewPanel.tsx`, or `FloatingChatWidget.tsx` — they keep the bare default schema. Do NOT reuse the unvalidated `help/HelpContent.tsx` iframe. Add an ESLint-style comment marking the export as player-only.

- [ ] **Step 4: Run → pass. Commit.**

### Task 12: `ModuleContent` renderer

**Files:**
- Create: `src/app/learn/[enrollmentId]/ModuleContent.tsx`
- Test: component test (Vitest + Testing Library) — renders markdown, an inline image, a YouTube embed; asserts a script payload does not execute/render.

- [ ] Render `LMSModule.content` via `ReactMarkdown` with `remarkPlugins={[remarkGfm]}` and the `LMS_MARKDOWN_PLUGINS` from Task 11. Render an optional primary `resourceUrl` video as a responsive iframe (through the same host filter). Render `documentId` as a download card. Style with the existing `prose` classes seen in `LmsCoursesTab`.
- [ ] TDD + commit.

### Task 13: `QuizPlayer` component

**Files:** `src/app/learn/[enrollmentId]/QuizPlayer.tsx` + test.
- [ ] Uses `useStartQuiz` (GET) to fetch shuffled questions, renders one-at-a-time or a scroll list, submits via `useSubmitQuiz`, shows per-question correctness + `explanation` after submit, shows score + pass/fail, offers Retry (re-fetches a fresh shuffle) on fail. On pass, calls back to the player to unlock Next.
- [ ] TDD + commit.

### Task 14: `CoursePlayer` — the immersive, gated, click-through shell

**Files:**
- Create: `src/app/learn/[enrollmentId]/page.tsx` (server component: auth, load enrollment + course + modules + this user's module progress; 404 if not the owner and not admin), `CoursePlayer.tsx` (client).
- Test: player gating logic (unit-test the `canAdvance` helper).

Key behaviours:
- Route lives at `src/app/learn/...` — **outside `(dashboard)`** so it renders full-screen without the sidebar. Add a minimal layout (`src/app/learn/layout.tsx`) with just brand chrome + a "Back to My Training" link.
- Top progress bar (modules complete / total). Sidebar module list (accordion on mobile) with lock icons on not-yet-reached modules.
- **Gated Next**: extract a pure `canAdvance(module, progress, timeOnPageSec)` helper and unit-test it. A `document`/`video` module unlocks Next after `max(module.duration ?? 0, 60)` seconds on page (track with a timer; persist `timeSpent` via the module-progress endpoint). A `quiz` module unlocks Next only once `QuizPlayer` reports a pass.
- On completing a module, POST progress (reuse `POST /api/lms/enrollments` progress mode) — which recalculates enrollment status; when the course completes, call `recomputeInductionState` (server-side, triggered by the progress endpoint) so status advances. Show a completion screen with updated readiness ("1 course left before you're ready to work") and a link back to `/my-training`.
- Resume: initial module = first incomplete module (progress persisted, so closing the tab resumes).

- [ ] TDD the `canAdvance` helper first, then build the component, then commit.

### Task 15: `/my-training` hub + `useInduction` hook

**Files:**
- Create: `src/app/(dashboard)/my-training/page.tsx` + `MyTrainingContent.tsx`
- Create: `src/hooks/useInduction.ts`
- Modify: `src/lib/role-permissions.ts` (add `/my-training` to `allPages` + every role list — owner/head_office/admin get it via `allPages`; add explicitly to `marketing`, `member`, `staff`, `eos_*`), `src/lib/nav-config.ts` (add "My Training" People item, `icon: GraduationCap`/`BookMarked`).

- [ ] `useInduction`: `useReadiness()` (GET `/api/induction/readiness`, `retry:2`, `staleTime:30_000`), plus `useMyEnrollments()` filtered to essential/monthly. Journey view for new starters: progress ring, ordered course steps, blockers list from readiness, each course card a **Start/Continue** button that does `window.open('/learn/'+enrollmentId, '_blank')` (opens the player in a new tab). Cleared-staff view: this month's course prominent, overdue flags, training history, a "Download certificate" button (jsPDF — Task 16).
- [ ] Verify the new-page checklist: nav shows for all roles, middleware allows `/my-training` for locked users (already in `INDUCTION_ALLOWED_PREFIXES`), page loads.
- [ ] Commit.

### Task 16: Completion certificate PDF

**Files:** `src/lib/induction-certificate-pdf.ts` (follow `src/lib/report-pdf.ts` branding) + a GET route `src/app/api/lms/enrollments/[id]/certificate/route.ts` (owner or admin; only if `status === completed`).
- [ ] TDD the "not completed → 403" + happy path; commit.

---

## Chunk 5: Admin UI — pipeline, sign-off, calendar, quiz & media editors

### Task 17: Admin induction tabs mounted in `/onboarding`

**Files:**
- Create components: `InductionPipelineBoard.tsx`, `PracticalSignoffQueue.tsx`, `TrainingCalendarEditor.tsx`, `QuizQuestionEditor.tsx`, `MediaModuleEditor.tsx`.
- Create hooks: `useTrainingCalendar.ts`; extend `useInduction.ts` with `useSignoff`, `useOverride`, `useBackfill`, `usePipeline`.
- Create APIs: `training-calendar` CRUD (Task per conventions), `induction/pipeline` GET (admin: users grouped by `inductionStatus` with days-in-stage + blockers).
- Modify: the `/onboarding` page/tab host to add "Induction" (pipeline + sign-off) and "Training Calendar" tabs (admin-like roles only).

Sub-tasks (each TDD'd + committed):
- [ ] **17a**: `training-calendar` CRUD route + hook + `TrainingCalendarEditor` (12 rows month→course picker, only `track:monthly` published courses selectable).
- [ ] **17b**: `induction/pipeline` GET + `InductionPipelineBoard` (columns per status, count + list, days-in-stage).
- [ ] **17c**: `PracticalSignoffQueue` — per new starter, the active checklist items with a sign-off toggle (calls `POST /api/induction/signoff`); phone-friendly. Signer-role gated in UI (hidden for non-signers) AND server-enforced (Task 8).
- [ ] **17d**: `QuizQuestionEditor` — inside module editing; CRUD questions (question, options[], correctIndex, explanation) via Task 7 API; live preview.
- [ ] **17e**: `MediaModuleEditor` — image-upload button (POST `/api/upload`, insert returned Blob URL as markdown `![alt](url)` into `content`), a video-embed field (validate host against the allow-list before saving to `resourceUrl`), and a live preview using `ModuleContent`.
- [ ] **17f**: `course` create/edit gains a `track` selector (essential/monthly/library).

### Task 18: Backfill launcher

**Files:** `src/app/api/induction/backfill/route.ts` + test; a confirmation-gated button in the admin Induction tab.
- [ ] `POST` owner/head_office only. For every active user currently `cleared` who has NOT completed the essential track: set `inductionStatus: "in_training"`, `inductionGraceUntil = now + 5 weeks`, and enrol them in all published essential courses (dedup like `auto-onboarding`). Idempotent (skip users already `in_training`/`awaiting_signoff`). Return counts. Send the backfill-welcome email. Write an `ActivityLog`.
- [ ] Tests: only owner/head_office; idempotency; grace = +35 days; cleared admins with essentials done are left `cleared`.
- [ ] Commit.

---

## Chunk 6: Crons, reminders, seed content

### Task 19: Monthly assignment cron

**Files:** `src/app/api/cron/training-monthly/route.ts` + `src/__tests__/api/cron/training-monthly.test.ts`; add schedule to `vercel.json`.
- [ ] Follow the `auto-onboarding` template exactly: `verifyCronSecret` → `acquireCronLock("training-monthly", "monthly")`. Determine current month (AEST). Read active `TrainingCalendarSlot`s for that month → their courses. Enrol every active `cleared` user (skip existing enrollments, dedup via a Set like auto-onboarding), `dueDate` = last day of month. Send assignment emails (Task 21). `guard.complete({ enrolled })`.
- [ ] Schedule in `vercel.json`: run on the 1st, e.g. `"0 22 1 * *"` (aligns with existing AEST offset pattern). Only runs enrolments on day 1; the reminder cron (below or reuse compliance-alerts) handles nudges.
- [ ] Tests: auth reject, lock skip, happy (enrol dedup, only `cleared` users, only active slots). Commit.

### Task 20: Grace-expiry cron

**Files:** `src/app/api/cron/induction-grace/route.ts` + test; schedule in `vercel.json` (daily).
- [ ] `verifyCronSecret` → `acquireCronLock("induction-grace", "daily")`. Find users with `inductionGraceUntil < now` still `in_training` → clear `inductionGraceUntil` (so the gate + locked-mode now bite) and leave status `in_training`. Also handle new starters approaching `inductionDueDate` (escalation emails at T-3, Task 21). `guard.complete`.
- [ ] Tests: auth reject, lock skip, expiry flips grace off, future grace untouched. Commit.

### Task 21: Reminder ladder + admin summary emails

**Files:**
- Modify: `src/lib/email-templates.ts` + `src/lib/email-templates/` — add `inductionWelcome`, `inductionBackfillWelcome`, `monthlyTrainingAssigned`, `trainingReminder` (T-7/T-2/overdue), `newStarterNudge`, `inductionAdminSummary`.
- Wire sends into: user creation (Task 10), backfill (Task 18), monthly cron (Task 19), grace cron (Task 20).
- Add a Monday admin summary (reuse an existing weekly cron or add to `induction-grace` a Monday branch): completion % per service, overdue list, pipeline stage counts. Respect email suppression (existing `EmailSuppression`).
- [ ] Each template gets a render test (subject + key content present). Commit per logical group.

### Task 22: Seed the essential curriculum, practical checklist, calendar (draft)

**Files:** `prisma/seed-induction.ts` (invoked from `prisma/seed.ts` behind an idempotency guard) + AI-drafted content.
- [ ] Create the 7 essential `LMSCourse`s (`track: essential`, `status: draft`), each with 3–5 `LMSModule`s (markdown content drafted from `AmanaWayContent`, `AmanaHandbookContent`, top `PolicyDocument`s, `KnowledgeBaseArticle`s) and a quiz module with `LMSQuizQuestion`s. Seed the `PracticalChecklistItem`s (OWNA sign in/out, parent intro, locate first-aid/evac/medical, find a policy, incident walkthrough, supervision positioning). Seed 12 `TrainingCalendarSlot`s (draft monthly courses for Feb–Jan). **Idempotent**: guard on a well-known course title/`upsert` so re-running seed doesn't duplicate.
- [ ] Content is drafted but courses stay `draft` — the gate only counts `published`. A human publishes course-by-course after review. Document the publish step in the plan's rollout notes.
- [ ] Commit (content can land in follow-up commits as review completes).

---

## Chunk 7: Rollout, verification, docs

### Task 23: Full verification pass
- [ ] `npm run build` passes.
- [ ] `npm test` — all green (new + existing). Confirm no regression in roster/kiosk/users suites.
- [ ] `npm run lint`.
- [ ] Preview-server smoke test (preview_* tools): create a new-starter user → confirm locked-mode redirects to `/my-training`; open a course in a new tab → step through a module (Next gated) → pass a quiz → complete a course; as admin, sign off practicals → user clears; confirm a non-cleared user is blocked at clock-in.
- [ ] Verify migration applies cleanly (local) and the generated SQL keeps the `cleared` default.

### Task 24: Docs + CLAUDE.md
- [ ] Update `CLAUDE.md` (Automation / Testing sections) with the induction gate, the 6 enforcement points, `src/lib/induction.ts` as the single source of truth, the two new crons, and the player route. Update `MEMORY.md` project note.
- [ ] Note the manual rollout sequence in the PR description: (1) merge (all staff `cleared`, no-op), (2) publish essential courses one by one, (3) launch backfill (owner/head_office button, 5-week grace), (4) grace expiry gates stragglers, (5) new hires use the "New starter" flag.

---

## Rollout & safety notes
- **Deploy is a no-op**: `inductionStatus` defaults to `cleared`; the gate is inert until essential courses are `published` AND users are moved off `cleared` (new-starter flag or backfill).
- **Branch push runs `migrate deploy` against shared prod DB** (see memory Current State) — so the migration applies on the preview deploy. Ensure the migration is safe/additive (it is: new nullable columns with a default, new tables).
- **Backfill is deliberate and reversible-ish**: it only flips `cleared → in_training` for users missing essentials; an override or re-clear path exists via admin.
