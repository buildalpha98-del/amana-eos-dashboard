# Amana Ambassadors Module Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Amana Ambassadors staff enrolment-incentive pilot tracker (17 Aug – 11 Sep 2026, 4 centres): educator ref codes + QR, enrolment-form attribution capture, a qualification engine (new-child + 28-day paid-session rules), a verified payout state machine with LMS hard gate, payroll export, and role-scoped dashboard views.

**Architecture:** New `Ambassador*` Prisma models isolated from existing `Referral`/`StaffReferral`; all derived values flow through one recompute function (`recomputeAmbassadorRecord`, mirroring the `recalcEnrollmentStatus` pattern); attribution is captured at `/parent/signup?ref=` (the anonymous form is retired) and at the existing `referralSource` question, then resolved into records by a post-submission hook on both enrolment paths. Attendance is manual-first (Director quick entry + CSV import via the existing `ImportWizard`/xlsx pattern) because none of the 4 pilot centres have `ownaServiceId` set; the session model is source-tagged so OWNA sync can automate it later.

**Tech Stack:** Next.js 16 App Router, Prisma 5.22 (+ `migrate diff`-generated SQL — NEVER apply locally, the deploy pipeline runs `migrate deploy`), `withApiAuth` route wrappers, React Query hooks via `fetchApi`/`mutateApi`, `qrcode` npm package (already a dep), `xlsx` importer pattern, Vitest.

**Key policy decisions (approved by Jayden 2026-08-03):**
- 6-month new-child check = name+DOB heuristic across `Child` rows + attendance/booking/withdrawal signals; ambiguous ⇒ `uncertain` ⇒ Director review flag (blocks qualification until resolved).
- Ref capture at `/parent/signup?ref=CODE` persisted on `ParentAccount`; legacy `/enrol/[token]` wizard OUT of scope.
- Existing network-wide `referralSource` options replaced with the pilot's option set ("Word of mouth" → "Friend or family").
- Attendance: Director quick entry + CSV import (OWNA per-child auto-sync is future work — pilot centres unlinked).
- Sibling path (`EnrolmentApplication` approval) also creates ambassador records (spec: two siblings = two records). `EnrolmentApplication.familyId` is a **CentreContact** id with no ParentAccount FK — attribution there resolves via lowercased-email join: `parentAccount.findUnique({ where: { email: family.email.toLowerCase() } })` (ParentAccount stores emails lowercased+trimmed).
- Child privacy: store denormalised `childInitials` on the record; all Ambassadors UI shows initials only.
- **Late service assignment**: the submit route deliberately leaves `Child.serviceId` null when the school match is ambiguous (`submit/route.ts:262–279`), assigned later via `/api/enrolments/[id]/assign-service` (and `backfill-service`). The logging hook therefore works PER CHILD on the child's own `serviceId`, and BOTH assign routes also call the hook so late-assigned pilot children get logged (window check uses the SUBMISSION date, not the assignment date).
- **Legacy `/enrol/[token]` consequences (accepted gaps)**: the option replacement covers `AgreementStep` only — the legacy wizard's own `REFERRAL_OPTIONS` (`src/components/enrol/steps/ReviewStep.tsx:66`) keeps "Word of mouth" etc.; and a pilot-centre enrolment submitted through the legacy path during the window will NOT auto-create an ambassador record (Directors can't log it — acceptable: those token links are old nurture emails predating the pilot).

---

## Chunk 1: Schema, migration, seed

### Task 1: Prisma schema additions

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add enums** (near the other enum blocks, before `model User`):

```prisma
enum AmbassadorPilotStatus {
  draft
  active
  closed
}

enum AmbassadorAttributionSource {
  form_field
  qr_ref
  both
  unknown
}

enum AmbassadorRecordStatus {
  logged
  director_verified
  sm_approved
  sent_to_payroll
  paid
  rejected
}

enum AmbassadorNewChildStatus {
  new_child
  existing_child
  uncertain
}

enum AmbassadorSessionSource {
  manual
  csv_import
  owna
}
```

(`new`/`existing` are avoided as enum values — `new` is a TS reserved word in some codegen paths; use `new_child`/`existing_child`.)

- [ ] **Step 2: Add models** (new `// ── Amana Ambassadors pilot ──` section near the end of the schema):

```prisma
model AmbassadorPilot {
  id        String                @id @default(cuid())
  name      String
  startDate DateTime              @db.Date
  endDate   DateTime              @db.Date
  status    AmbassadorPilotStatus @default(draft)
  closedAt   DateTime?
  closedById String?
  closedBy   User?    @relation("AmbassadorPilotClosedBy", fields: [closedById], references: [id], onDelete: SetNull)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  centres     AmbassadorPilotCentre[]
  records     AmbassadorEnrolment[]
  adjustments AmbassadorAdjustment[]

  @@index([status])
}

model AmbassadorPilotCentre {
  id                        String          @id @default(cuid())
  pilotId                   String
  pilot                     AmbassadorPilot @relation(fields: [pilotId], references: [id], onDelete: Cascade)
  serviceId                 String
  service                   Service         @relation("AmbassadorPilotCentres", fields: [serviceId], references: [id], onDelete: Cascade)
  targetQualifiedEnrolments Int
  teamBonusAmount           Float           @default(200)

  @@unique([pilotId, serviceId])
}

model EducatorRefCode {
  id       String  @id @default(cuid())
  userId   String  @unique
  user     User    @relation("EducatorRefCode", fields: [userId], references: [id], onDelete: Cascade)
  /// 6-char unambiguous code (no 0/O/1/I/L) — appears in /parent/signup?ref=
  code     String  @unique
  active   Boolean @default(true)
  /// Linked marketing QrCode row so scans get the existing /a/{shortCode}
  /// analytics for free. Nullable: codes work without a QR.
  qrCodeId String? @unique
  qrCode   QrCode? @relation("EducatorRefQr", fields: [qrCodeId], references: [id], onDelete: SetNull)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model AmbassadorEnrolment {
  id      String          @id @default(cuid())
  pilotId String
  pilot   AmbassadorPilot @relation(fields: [pilotId], references: [id], onDelete: Cascade)
  serviceId String
  service   Service @relation("AmbassadorEnrolments", fields: [serviceId], references: [id])

  childId String?
  child   Child?  @relation("AmbassadorChild", fields: [childId], references: [id], onDelete: SetNull)
  enrolmentSubmissionId  String?
  enrolmentSubmission    EnrolmentSubmission?  @relation("AmbassadorFromSubmission", fields: [enrolmentSubmissionId], references: [id], onDelete: SetNull)
  enrolmentApplicationId String?
  enrolmentApplication   EnrolmentApplication? @relation("AmbassadorFromApplication", fields: [enrolmentApplicationId], references: [id], onDelete: SetNull)
  /// Privacy: every Ambassadors surface shows initials only ("A.K.").
  childInitials String

  creditedEducatorId String?
  creditedEducator   User?   @relation("AmbassadorCredited", fields: [creditedEducatorId], references: [id], onDelete: SetNull)
  namedEducatorText   String?
  refCode             String?
  attributionSource   AmbassadorAttributionSource @default(unknown)
  attributionConflict Boolean                     @default(false)

  newChildStatus    AmbassadorNewChildStatus @default(uncertain)
  newChildCheckedAt DateTime?
  newChildDetail    String?                  @db.Text

  regularSessionsPerWeek Int?
  firstAttendanceDate    DateTime? @db.Date
  /// Derived: fee>0 sessions inside the 28-day window. Only
  /// recomputeAmbassadorRecord writes this.
  paidSessionsAttended Int     @default(0)
  tierAmount           Float?
  incentiveAmount      Float?
  qualified            Boolean @default(false)
  qualifiedAt          DateTime?

  status          AmbassadorRecordStatus @default(logged)
  rejectionReason String?
  sentToPayrollAt DateTime?
  paidAt          DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  sessions    AmbassadorSession[]
  transitions AmbassadorTransition[]

  @@index([pilotId, serviceId])
  @@index([creditedEducatorId])
  @@index([status])
}

model AmbassadorSession {
  id       String              @id @default(cuid())
  recordId String
  record   AmbassadorEnrolment @relation(fields: [recordId], references: [id], onDelete: Cascade)
  date        DateTime                @db.Date
  /// "bsc" | "asc" | "vc" | "unknown" — String (not the SessionType enum)
  /// because CSV rows may not identify the session; enum has no unknown.
  sessionType String                  @default("unknown")
  fee         Float
  source      AmbassadorSessionSource
  createdById String?
  createdBy   User?                   @relation("AmbassadorSessionCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)
  createdAt   DateTime                @default(now())

  @@unique([recordId, date, sessionType])
}

model AmbassadorTransition {
  id         String                 @id @default(cuid())
  recordId   String
  record     AmbassadorEnrolment    @relation(fields: [recordId], references: [id], onDelete: Cascade)
  fromStatus AmbassadorRecordStatus
  toStatus   AmbassadorRecordStatus
  actorId    String?
  actor      User?                  @relation("AmbassadorTransitionActor", fields: [actorId], references: [id], onDelete: SetNull)
  reason     String?
  createdAt  DateTime               @default(now())

  @@index([recordId])
}

model AmbassadorAdjustment {
  id         String          @id @default(cuid())
  pilotId    String
  pilot      AmbassadorPilot @relation(fields: [pilotId], references: [id], onDelete: Cascade)
  educatorId String
  educator   User            @relation("AmbassadorAdjustments", fields: [educatorId], references: [id], onDelete: Cascade)
  /// milestone_kicker is the only type today; team bonus is display-only.
  type            String
  amount          Float
  sentToPayrollAt DateTime?
  paidAt          DateTime?
  createdAt       DateTime  @default(now())

  @@unique([pilotId, educatorId, type])
}
```

- [ ] **Step 3: Add back-relations + capture columns to existing models**
  - `User`: `educatorRefCode EducatorRefCode? @relation("EducatorRefCode")`, `ambassadorCredits AmbassadorEnrolment[] @relation("AmbassadorCredited")`, `ambassadorTransitions AmbassadorTransition[] @relation("AmbassadorTransitionActor")`, `ambassadorAdjustments AmbassadorAdjustment[] @relation("AmbassadorAdjustments")`, `ambassadorSessionsCreated AmbassadorSession[] @relation("AmbassadorSessionCreatedBy")`, `ambassadorPilotsClosed AmbassadorPilot[] @relation("AmbassadorPilotClosedBy")`
  - `Service`: `ambassadorPilotCentres AmbassadorPilotCentre[] @relation("AmbassadorPilotCentres")`, `ambassadorEnrolments AmbassadorEnrolment[] @relation("AmbassadorEnrolments")`
  - `Child`: `ambassadorRecords AmbassadorEnrolment[] @relation("AmbassadorChild")`
  - `EnrolmentSubmission`: `referralEducatorName String?` + `ambassadorRecords AmbassadorEnrolment[] @relation("AmbassadorFromSubmission")`
  - `EnrolmentApplication`: `ambassadorRecords AmbassadorEnrolment[] @relation("AmbassadorFromApplication")`
  - `QrCode`: `educatorRefCode EducatorRefCode? @relation("EducatorRefQr")`
  - `ParentAccount`: `ambassadorRefCode String?` (captured from `?ref=` at signup)

- [ ] **Step 4: Validate schema**

Run: `npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid`

### Task 2: Migration file (schema-to-schema diff — NEVER apply locally)

**Files:**
- Create: `prisma/migrations/20260803<hhmmss>_ambassador_pilot/migration.sql`

- [ ] **Step 1: Generate SQL with `migrate diff`** (per `reference_local-db-and-worktrees` — `.env.local` DATABASE_URL is PROD; do not `db execute`/`migrate dev`):

```bash
git stash -- prisma/schema.prisma   # only if needed to get the pre-change schema
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "$SHADOW_DATABASE_URL_OR_LOCAL_PG" \
  --script > prisma/migrations/20260803120000_ambassador_pilot/migration.sql
```

If no shadow DB is available, use `--from-schema-datamodel <git-show of old schema>` with two temp schema files (the technique used for previous migrations in this repo).

- [ ] **Step 2: Review the SQL** — must contain only `CREATE TYPE`/`CREATE TABLE`/`ALTER TABLE ... ADD COLUMN`/indexes; the two `ADD COLUMN`s on existing tables (`EnrolmentSubmission.referralEducatorName`, `ParentAccount.ambassadorRefCode`) must be nullable with no default rewrite.
- [ ] **Step 3: `npx prisma generate` and `npm run build` to confirm client compiles.**
- [ ] **Step 4: Commit** — `feat(ambassadors): schema + migration for pilot tracker`

### Task 3: Seed pilot + centres

**Files:**
- Create: `prisma/seed-ambassadors-pilot.ts`
- Modify: `prisma/seed.ts` (call it where `seed-ambassadors.ts` is called)

- [ ] **Step 1: Write idempotent seed** — pilot named `"Amana Ambassadors Pilot — Term 3 2026"`, `startDate: 2026-08-17`, `endDate: 2026-09-11`, `status: draft` (Jayden activates via UI; seed must never flip an active/closed pilot back). Centres by `Service.code`: `MFIS-GA` target 8, `MFIS-BH` target 5, `MIN-DOV` target 6, `MIN-SPR` target 6, all `teamBonusAmount: 200`. Find-by-name-or-create; upsert centres on `@@unique([pilotId, serviceId])` (create-if-missing only — never overwrite an admin-edited target). Skip missing services with a console.warn (seed runs on every deploy).
- [ ] **Step 2: Run seed against prod is automatic on deploy — locally only dry-check via `npx tsx --tsconfig tsconfig.json -e` type-check or unit-test the helper. Do NOT run the seed locally (prod DB).**
- [ ] **Step 3: Commit** — `feat(ambassadors): seed Term 3 pilot + 4 centre targets (draft)`

---

## Chunk 2: Core engine (`src/lib/ambassadors/`) — pure logic + tests first

### Task 4: Ref codes

**Files:**
- Create: `src/lib/ambassadors/ref-codes.ts`
- Test: `src/__tests__/lib/ambassadors-ref-codes.test.ts`

- [ ] **Step 1: Failing tests** — charset excludes `0 O 1 I L`; length 6; `ensureRefCodesForPilot` creates codes for active `staff`+`member` users with a `UserServiceMembership` at a pilot centre, skips users who already have one, retries on collision.
- [ ] **Step 2: Implement:**

```ts
const CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // unambiguous: no 0/O/1/I/L

export function generateRefCode(rand: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < 6; i++) out += CHARSET[Math.floor(rand() * CHARSET.length)];
  return out;
}

export function signupUrlForCode(code: string): string {
  const base = process.env.NEXTAUTH_URL ?? "";
  return `${base}/parent/signup?ref=${code}`;
}

export async function ensureRefCodesForPilot(pilotId: string): Promise<{ created: number; existing: number }>
// - pilot centres -> serviceIds
// - users: active, role in ["staff","member"], membership status active at those services
// - for each without an EducatorRefCode: create with collision-retry (unique code), and a
//   linked QrCode {
//     shortCode: await generateUniqueShortCode(),   // from src/lib/activation-qr.ts:51 — REQUIRED, unique
//     name: `Ambassador ref — ${user.name}`,
//     destinationUrl: signupUrlForCode(code),
//     serviceId,
//   }
```

**Scan analytics contract:** the printed/downloaded QR must encode `buildScanUrl(shortCode)` (from `src/lib/activation-qr.ts:13` — the `/a/{shortCode}` redirect URL), NOT the raw signup URL — otherwise `QrScan` rows are never written and Task 17's scan counts are dead. The signup URL is what the `/a/` redirect points AT (`destinationUrl`).

- [ ] **Step 3: Tests pass, commit** — `feat(ambassadors): educator ref code generation`

### Task 5: Qualification engine (pure)

**Files:**
- Create: `src/lib/ambassadors/qualification.ts`
- Test: `src/__tests__/lib/ambassadors-qualification.test.ts`

- [ ] **Step 1: Failing tests — the spec's exact cases:**
  - `deriveFirstAttendance`: min session date including a $0 session (the free first session IS first attendance).
  - 28-day window: session on day 27 counts, day 28 does not (window = `[first, first + 27 days]` inclusive — 28 days total).
  - `$0` sessions never count toward the 4 (`fee > 0` strictly).
  - `paidSessionsInWindow` with 4 paid inside window ⇒ 4; 3 paid + 1 free ⇒ 3.
  - `tierAmountFor(3) === 50`, `tierAmountFor(2) === 30`, `tierAmountFor(1) === 30`, `tierAmountFor(0) === null`, `tierAmountFor(null) === null`, `tierAmountFor(5) === 50`.

```ts
export const QUALIFYING_PAID_SESSIONS = 4;
export const WINDOW_DAYS = 28;
export const TIER_HIGH = 50;   // ≥3 regular sessions/week
export const TIER_LOW = 30;    // 1–2
export const MILESTONE_THRESHOLD = 5;
export const MILESTONE_AMOUNT = 100;

export interface SessionLike { date: Date; fee: number }

export function deriveFirstAttendance(sessions: SessionLike[]): Date | null;
export function windowEnd(first: Date): Date;               // first + 27 days
export function paidSessionsInWindow(sessions: SessionLike[], first: Date): number;
export function tierAmountFor(sessionsPerWeek: number | null | undefined): number | null;
```

- [ ] **Step 2: Implement (pure, UTC-date arithmetic like the rest of the repo — `@db.Date` columns come back as UTC midnight).**
- [ ] **Step 3: Tests pass, commit** — `feat(ambassadors): qualification engine (28-day window, $0 exclusion, tiers)`

### Task 6: New-child check (6-month rule)

**Files:**
- Create: `src/lib/ambassadors/new-child-check.ts`
- Test: `src/__tests__/lib/ambassadors-new-child.test.ts` (prisma-mock with input-based `mockImplementation` routing)

- [ ] **Step 1: Failing tests:**
  - No `Child` row matching name+DOB anywhere ⇒ `new_child`.
  - Match with `status: active|pending` ⇒ `existing_child`.
  - Match `withdrawn` + `AttendanceRecord`/`Booking` within prior 6 months ⇒ `existing_child`.
  - Match `withdrawn`, last attendance 7 months ago, no recent booking ⇒ `new_child` (returning family after 6+ months).
  - Match on name but candidate has no DOB ⇒ `uncertain` (Director must resolve).
  - `newChildDetail` explains the outcome in plain English.

```ts
export interface NewChildCheckInput {
  firstName: string; surname: string; dob: Date | null;
  excludeChildIds: string[];          // the just-created Child row(s)
  enrolmentDate: Date;                // window anchor: enrolmentDate - 6 months
}
export interface NewChildCheckResult {
  status: "new_child" | "existing_child" | "uncertain";
  detail: string;
}
export async function checkNewChild(input: NewChildCheckInput): Promise<NewChildCheckResult>
```

Matching: `Child.findMany` where `firstName` + `surname` equal case-insensitively (`mode: "insensitive"`), id not in exclude list, across ALL services. If input has DOB, require DOB equality on matches that have one; a name-match with a *different* DOB is not a match; a name-match where either side lacks DOB ⇒ `uncertain`. For each true match, look for signals inside `[enrolmentDate − 6 months, enrolmentDate]`: `Child.status in (active, pending)` OR any `AttendanceRecord` OR any `Booking` row ⇒ `existing_child`.

- [ ] **Step 2: Implement; Step 3: tests pass; commit** — `feat(ambassadors): 6-month new-child heuristic`

### Task 7: Attribution resolution

**Files:**
- Create: `src/lib/ambassadors/attribution.ts`
- Test: `src/__tests__/lib/ambassadors-attribution.test.ts`

- [ ] **Step 1: Failing tests:** ref code only ⇒ `qr_ref` + credited; named educator only (unique fuzzy name match among users with an active membership at the service) ⇒ `form_field` + credited; both pointing at the SAME user ⇒ `both`, no conflict; both DIFFERENT users ⇒ `both` + `attributionConflict: true` + `creditedEducatorId: null` (never silently pick one — spec); neither / no match ⇒ `unknown`, uncredited; named text matching 0 or 2+ users ⇒ uncredited, no conflict flag unless a ref code disagrees.
- [ ] **Step 2: Implement** `resolveAttribution({ refCode, namedEducatorText, serviceId })` — name matching: case-insensitive full-name equality first, then unique first-name match; anything non-unique resolves to null.
- [ ] **Step 3: Commit** — `feat(ambassadors): attribution resolution with conflict flagging`

### Task 8: Recompute + milestone kicker (single derivation point)

**Files:**
- Create: `src/lib/ambassadors/recompute.ts`
- Test: `src/__tests__/lib/ambassadors-recompute.test.ts`

- [ ] **Step 1: Failing tests:** derives `firstAttendanceDate`/`paidSessionsAttended` from sessions; `qualified` only when `newChildStatus === "new_child"` AND paid ≥ 4 in window; `incentiveAmount` = tier when qualified + credited + no conflict, `0` when qualified but unattributed (still counts toward centre target); reaching 5 qualified for one educator upserts exactly one `AmbassadorAdjustment` (`milestone_kicker`, $100) — idempotent on re-run; a later disqualification does NOT delete an adjustment already `sentToPayrollAt` (log a warning instead).
- [ ] **Step 2: Implement `recomputeAmbassadorRecord(recordId)`** — the ONLY writer of `paidSessionsAttended`, `firstAttendanceDate`, `tierAmount`, `incentiveAmount`, `qualified`, `qualifiedAt`. Called by: session quick-entry, CSV import, PATCH (sessions/week or credited-educator changes), new-child resolution, transition route.
- [ ] **Step 3: Commit** — `feat(ambassadors): recompute + milestone kicker`

### Task 9: State machine + LMS hard gate

**Files:**
- Create: `src/lib/ambassadors/state-machine.ts`, `src/lib/ambassadors/lms-gate.ts`
- Test: `src/__tests__/lib/ambassadors-state-machine.test.ts`

- [ ] **Step 1: Failing tests:**
  - Allowed: `logged→director_verified|rejected`, `director_verified→sm_approved|logged|rejected`, `sm_approved→sent_to_payroll|director_verified|rejected`, `sent_to_payroll→paid`, `rejected→logged`; everything else throws `ApiError.badRequest`.
  - `rejected` requires a reason.
  - `→director_verified` blocked while `attributionConflict` is true.
  - `→director_verified` blocked when the record is credited (`creditedEducatorId` set) but `regularSessionsPerWeek` is null — a credited record must have its tier assessable before verification, or it reaches payroll with a null gross.
  - `→sm_approved` blocked unless `qualified`.
  - `→sent_to_payroll` blocked when `incentiveAmount > 0` and the credited educator has NOT completed the Amana Ambassadors course (`lms-gate`), with the exact message: `"<Name> has not completed the Amana Ambassadors course — incentive cannot be sent to payroll."` Unattributed records (incentive 0) pass the gate.
  - Every transition writes an `AmbassadorTransition` row with actor + reason.
- [ ] **Step 2: Implement.** `lms-gate.ts`: `hasCompletedAmbassadorsCourse(userId)` — find course `{ title: "Amana Ambassadors", track: "library", deleted: false }` (same lookup as `prisma/seed-ambassadors.ts`), then `LMSEnrollment` `status === "completed"`. Module-level cached courseId (60s TTL, cleared in tests).
- [ ] **Step 3: Commit** — `feat(ambassadors): state machine + LMS completion hard gate`

### Task 10: Record creation hook

**Files:**
- Create: `src/lib/ambassadors/log-enrolment.ts`
- Test: `src/__tests__/lib/ambassadors-log-enrolment.test.ts`

- [ ] **Step 1: Failing tests:** no active pilot ⇒ no-op; child's `serviceId` null or not a pilot centre ⇒ no-op for that child (others still logged); submission date outside `[startDate, endDate]` ⇒ no-op; happy path creates one `logged` record PER CHILD (keyed on the CHILD's `serviceId`, not a submission-level service) with `childInitials` (e.g. `"A.K."`), attribution resolved from `ParentAccount.ambassadorRefCode` + `referralEducatorName`, and `checkNewChild` result stored; idempotent (re-running for the same child creates no duplicate — guard on `childId`); errors NEVER propagate (wrapped, logged) — an ambassador failure must not break enrolment submission.
- [ ] **Step 2: Implement** `logAmbassadorEnrolments({ submissionId })` (iterates the submission's `childRecords`, skipping null-service children) and `logAmbassadorEnrolmentFromApplication({ applicationId, childId })` sharing one internal helper. Sibling-path attribution: look up `ParentAccount` by the CentreContact family's lowercased email (no FK exists).
- [ ] **Step 3: Commit** — `feat(ambassadors): auto-create records on enrolment`

---

## Chunk 3: Capture wiring (signup, form, submission paths)

### Task 11: `?ref=` capture at signup

**Files:**
- Modify: `src/app/parent/signup/page.tsx` (read `ref` search param → hidden state → include in POST body; also stash in `sessionStorage` under `amana_ref` as a fallback if they bounce)
- Modify: `src/app/api/parent/auth/signup/route.ts` (schema: `refCode: z.string().trim().max(12).optional()`; after `createParentAccount` succeeds, `parentAccount.update({ ambassadorRefCode })` — validate it matches an active `EducatorRefCode` first; silently drop invalid codes)
- Test: extend `src/__tests__/api/` signup tests (auth file already exists for parent auth — follow its pattern)

- [ ] Steps: failing test (valid ref persisted; unknown ref dropped; no ref = null) → implement → pass → commit `feat(ambassadors): capture ?ref= at parent signup`

### Task 12: "How did you hear about us?" question

**Files:**
- Modify: `src/app/parent/enrol/AgreementStep.tsx:84` — replace `REFERRAL_SOURCES` with: `"One of our educators"`, `"School newsletter"`, `"Friend or family"`, `"Social media"`, `"Other"`. Conditional text input "Which educator spoke with you?" (`referralEducatorName`) shown when the educator option is selected. Australian English, existing form styling (this file's own input classes).
- Modify: `src/lib/enrol-draft.ts` — `agreement.referralEducatorName?: string`; make `referralSource` REQUIRED in the agreement-step validation (mandatory question per spec).
- Modify: `src/app/api/parent/enrolment-draft/submit/route.ts:313` — persist `referralEducatorName`; server-side reject missing `referralSource`.
- Test: extend the existing enrol-draft/submit tests.

- [ ] Steps: failing tests → implement → pass → commit `feat(ambassadors): educator referral question on enrolment form`

### Task 13: Hook both submission paths

**Files:**
- Modify: `src/app/api/parent/enrolment-draft/submit/route.ts` — AFTER the `$transaction` commits: `await logAmbassadorEnrolments({ submissionId })` (fire-and-forget semantics inside its own try/catch; it already never throws).
- Modify: `src/app/api/enrolment-applications/[id]/approve/route.ts` — after child creation: `logAmbassadorEnrolmentFromApplication(...)`. Sibling applications have no referral question; attribution comes from the ParentAccount matched by the family's lowercased email (`ambassadorRefCode` if present), else `unknown` (still counts toward target).
- Modify: `src/app/api/enrolments/[id]/assign-service/route.ts` AND the backfill-service route — after a child gains a `serviceId`, call the logging hook for that child (window check against the original submission's `createdAt`), so pilot-centre children whose school didn't auto-match at submit time are still tracked.
- Test: route tests assert a record is created for a pilot-centre submission inside the window and NOT for others; assign-service late-match creates the record; re-approval/re-assignment does not duplicate.

- [ ] Steps: failing tests → implement → pass → commit `feat(ambassadors): create records from both enrolment paths`

---

## Chunk 4: API routes (`/api/ambassadors/*`)

All routes: `withApiAuth`, Zod bodies with Prisma enum values, `parseJsonBody`, scoping helpers. Member (Director) scoping = record's `serviceId` ∈ their active `UserServiceMembership` services. State Manager scoping = `Service.state === user.state` (user with null state sees all — matches existing head_office behaviour).

### Task 14: Pilot + overview routes

**Files:**
- Create: `src/app/api/ambassadors/pilot/route.ts` — GET (any dashboard role incl. staff): current pilot, centres with `{ qualifiedCount, target, teamBonusEarned }`, network totals, cost summary `{ gross, super: gross * 0.12 }` (gross = qualified incentives + milestone kickers; super display-only, PAYG not computed), attribution-source breakdown, leaderboard (first names only, qualified count). PATCH (owner/head_office): activate, edit dates/targets, `close` action (sets `closed` — closing blocks NEW record logging but verification/approval of existing records continues; guard in `log-enrolment` uses status+window, transition route ignores pilot status).
- Test: `src/__tests__/api/ambassadors-pilot.test.ts` — 401, staff-can-read, member-cannot-PATCH (403), happy GET aggregates, close semantics.

### Task 15: Records list + detail + edit

**Files:**
- Create: `src/app/api/ambassadors/records/route.ts` — GET with role scoping: staff ⇒ only `creditedEducatorId === session.user.id`; member ⇒ their centres; head_office ⇒ their state; admin/owner ⇒ all. Filters: `status`, `conflictsOnly`, `dueSoon` (day 28 within 5 days).
- Create: `src/app/api/ambassadors/records/[id]/route.ts` — GET (same scoping) returns record + sessions + transitions + LMS completion status of credited educator. PATCH (member-scoped/admin/head_office/owner): `regularSessionsPerWeek` (only until `director_verified` — spec), `creditedEducatorId` (conflict resolution — clears `attributionConflict`; the candidate set is NOT stored, so the route re-runs `resolveAttribution` on the persisted `refCode` + `namedEducatorText` to reconstruct it, and requires the chosen id to be one of those candidates or explicit null=unattributed), `newChildStatus` resolution for `uncertain` (Director attests, stores who/when in `newChildDetail`). Every PATCH logs to `ActivityLog` and triggers recompute.
- Test: scoping matrix (staff sees only own; member other-centre 404; head_office other-state 404), sessions/week locked after verification, conflict resolution rules.

### Task 16: Transitions + quick entry + sessions

**Files:**
- Create: `src/app/api/ambassadors/records/[id]/transition/route.ts` — POST `{ to, reason? }`; per-transition role rules: `director_verified` = member(scoped)/admin/head_office/owner; `sm_approved` = head_office(state-scoped)/admin/owner; `sent_to_payroll` = admin/owner (normally via export route); `paid` = admin/owner; `rejected` = any role that could make the current state's forward transition. Delegates to the state machine (which enforces guards + audit row).
- Create: `src/app/api/ambassadors/records/[id]/sessions/route.ts` — POST (Director quick entry): array of `{ date, sessionType, fee }` upserts + DELETE by id; each change `ActivityLog`-audited; recompute after. Manual sessions use `source: manual`.
- Test: role denial per transition, LMS-gate block message, guard failures (unqualified → sm_approved), quick-entry recompute.

### Task 17: Ref codes + CSV attendance import + payroll export

**Files:**
- Create: `src/app/api/ambassadors/ref-codes/route.ts` — GET (member+ see their centre's; staff see own; admin/owner all): code, signup URL, scan count (join QrCode→scans). POST (owner/head_office/admin): `ensureRefCodesForPilot` for the active pilot; per-educator PATCH to toggle `active`.
- Create: `src/app/api/ambassadors/attendance-import/route.ts` — multipart `file` + `mode=dry-run|execute`, follows `src/app/api/attendance/import/route.ts` structure (`XLSX.read`, header alias map, Excel-serial dates, 10MB cap). Column aliases: child name (`child|child name|name`), date (`date|attendance date`), session (`session|session of care|session type` — reuse `parseSessionType` aliases), fee (`fee|amount|charge|session fee`). Matches child by name (+DOB column if present) against OPEN ambassador records in the active pilot only; unmatched rows reported, never guessed. Writes `AmbassadorSession` (`source: csv_import`) and recomputes touched records. Roles: owner/head_office/admin/member (member: rows for their centres only).
- Create: `src/app/api/ambassadors/payroll-export/route.ts` — GET (admin/owner): CSV via `src/lib/csv-export.ts` of all `sm_approved` records grouped by educator: `Educator Name, Employee ID, Centre, Qualified Count, Gross Incentive, Milestone Kicker, Line Item, Super (12%)` with `Line Item = "Ambassador Incentive"`; Employee ID from the User's Employment Hero mapping when set. POST `{ confirm: true }`: same selection transitions each record `sm_approved→sent_to_payroll` (state machine, per-record LMS gate — gate failures EXCLUDE the record from the export and are returned in the response so Daniel sees who was held back) and stamps included `AmbassadorAdjustment.sentToPayrollAt`. **Only records with `incentiveAmount > 0` are exported/transitioned** — unattributed $0 records complete their lifecycle at `sm_approved` (they count toward the centre target but have no payroll line). Separate POST `mark-paid` action: `sent_to_payroll→paid` bulk.
- Test: export shape (super = gross × 0.12 to 2dp), non-completer excluded with message, transition side-effects, role gating (member 403).

- [ ] Each route: failing tests → implement → pass → commit per route group.

---

## Chunk 5: UI

### Task 18: Data hooks

**Files:**
- Create: `src/hooks/useAmbassadors.ts` — `usePilotOverview()`, `useAmbassadorRecords(filters)` (primitive-value query keys), `useAmbassadorRecord(id)`, `useMyAmbassadorView()`, mutations (`useTransitionRecord`, `useUpdateRecord`, `useQuickSessions`, `useGenerateRefCodes`, `usePayrollExport`). ALL queries `retry: 2`, `staleTime: 30_000`; ALL mutations `onError` destructive toast. Uses `fetchApi`/`mutateApi`.

### Task 19: `/ambassadors` page + components

**Files:**
- Create: `src/app/(dashboard)/ambassadors/page.tsx` — role-adaptive tabs (URL-synced `?tab=`, same pattern as services detail):
  - **Overview** (member/head_office/admin/owner/marketing-read?—no, keep to the five spec roles): per-centre progress bars (qualified vs target, `bg-brand` fill, `bg-accent` "$200 team pool earned" chip when target met), network totals, cost summary incl. 12% super, attribution breakdown, leaderboard (FIRST NAMES ONLY).
  - **Worklist** (member/head_office/admin/owner): awaiting verification, attribution conflicts, `uncertain` new-child checks, approaching day 28 (≤5 days left); row click opens `RecordDrawer`.
  - **My referrals** (staff — their ONLY tab; also visible to all): own credited records, tier, LMS completion status w/ link to `/my-training` if incomplete, projected payout (records + kicker).
  - **Codes & QR** (member+): educator list w/ code, scan count, QR download (PNG + SVG via `qrcode` package `toDataURL`/`toString({ type: "svg" })`, client-side, encoding the signup URL), print sheet.
  - **Admin** (head_office/owner + export for admin): pilot activate/close, dates, targets, payroll export panel (preview table → export CSV → confirm send-to-payroll → mark paid), CSV attendance import (`ImportWizard` with endpoint `/api/ambassadors/attendance-import`).
- Create: `src/components/ambassadors/` — `PilotOverview.tsx`, `DirectorWorklist.tsx`, `MyReferrals.tsx`, `RecordDrawer.tsx` (detail: initials-only child, attribution + conflict resolver, sessions/week editor, session quick-entry table, transition buttons w/ reason modal for reject, full audit trail from transitions), `RefCodesPanel.tsx`, `PayrollExportPanel.tsx`, `AmbassadorProgressBar.tsx`.
- Design: tokens only (`bg-card`, `text-foreground`, `text-muted`, `border-border`, `bg-brand`, `bg-accent`); `Button` from `@/components/ui/Button`; `PageHeader`; `text-2xs` for badges; dark-mode pairs for any tinted status rows; mobile at `sm:`. Australian English copy throughout ("enrolment", "verify", "authorised").

### Task 20: Nav + role permissions (critical checklist)

**Files:**
- Modify: `src/lib/nav-config.ts` — Growth section, `/ambassadors`, label "Ambassadors", `core: ["owner", "head_office", "admin", "member", "staff"]`, and set `roles` explicitly to those same five roles (sibling Growth items use `roles: ALL_NON_MARKETING` — we're narrower: marketing/eos roles must not see a dead link since role-permissions won't grant them the page).
- Modify: `src/lib/role-permissions.ts` — add `/ambassadors` to `allPages` AND explicitly to `member`, `staff` lists (owner/head_office/admin inherit via allPages).
- [ ] Verify sidebar visibility per role via `canAccessPage()` unit check; commit `feat(ambassadors): nav + role access`

---

## Chunk 6: Docs, verification, delivery

### Task 21: Director guide

**Files:**
- Create: `docs/ambassadors-director-guide.md` — short, Australian English: what the pilot is, how educators share codes/QRs, what Directors verify (sessions count, sessions/week, conflicts, new-child attestations), the day-28 rule in plain words, what happens after verification (SM approval → payroll), and the LMS-completion rule.

### Task 22: Full verification (verification-before-completion)

- [ ] `npm run lint` — clean (design-token rails included)
- [ ] `npm test` — full suite green (4,228+ baseline, zero new failures)
- [ ] `npm run build` — passes
- [ ] Dev server boots; `/ambassadors` renders per role (spot-check with the seeded roles); enrolment form shows the new question; signup accepts `?ref=`
- [ ] Commit remaining work; branch ready for PR to `main`

**Out of scope (explicitly):** legacy `/enrol/[token]` wizard changes; OWNA per-child attendance auto-sync (future: link `ownaServiceId` for the 4 centres, then extend `owna-sync.ts` to write `AmbassadorSession { source: "owna" }` — the model is ready); per-educator team-bonus splits (display-only per spec); PAYG/tax computation.
