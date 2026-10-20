# Knox Live Incident Triage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every new or materially changed child incident, complaint or staff incident is assessed within minutes by a rules-first worker, the right people are alerted on a push + Teams ladder with acknowledgement and escalation, and every follow-on record change is proposed as a card a human approves.

**Architecture:** Writers enqueue a `TriageJob` after their own write (swallow-and-log); dashboard routes run the job immediately via `runAfter`, a 5-minute `knox-tick` cron sweeps the rest and runs escalation. The worker claims atomically, runs pure rules (tier + clocks), dispatches alerts from the rules alone, then calls Claude through `generateStructured` for an opinion, drafts and cards. Cards are `PendingAction` rows committed through helpers extracted from the existing PATCH routes.

**Tech Stack:** Next.js 16 App Router, Prisma 5.22 + PostgreSQL, Zod, `@anthropic-ai/sdk` via `src/lib/ai-provider`, TanStack Query, Vitest, Vercel cron.

**Spec:** `docs/superpowers/specs/2026-10-20-knox-incident-triage-design.md`

## Deviations from the spec (decided while planning, each follows an existing repo pattern)

1. **Knox settings live in `OrgSettingsConfig.knox`** (`{ enabled, shadowMode }` in the validated `config` JSON, `src/lib/org-settings-shared.ts`), not as two new `OrgSettings` columns. That is how `notifications.serviceAlertsPaused` and every other runtime toggle is stored and edited.
2. **The Knox panel mounts in the incident row's expanded area** (`IncidentRow` in `src/app/(dashboard)/incidents/page.tsx`). Complaints (`ComplaintsRegister.tsx`) and staff incidents (`StaffIncidentsPanel` in `ServiceRegistersTab.tsx`) are flat tables with no detail view, so their rows get a `KnoxBadge` linking to `/knox?subject=<type>:<id>`, where the inbox renders the same panel.
3. **OWNA sync becomes a severity ratchet.** Today the update branch in `src/lib/owna-sync.ts` rewrites `severity` and `reportableToAuthority` unconditionally every 30 minutes, which would silently undo an approved `set_severity` / `mark_reportable` card. The update now keeps the higher of existing and mapped severity and never sets `reportableToAuthority` back to false.

## Global Constraints

- Node/Next/Prisma versions as in `package.json`; no new runtime dependencies.
- Design tokens only (`text-foreground`, `bg-card`, `border-border` …); `Button` from `@/components/ui/Button`; `PageHeader`; `text-2xs` for chips; dark-mode pairs for tinted surfaces.
- Every `useQuery`: `retry: 2`, `staleTime: 30_000`, primitive query keys. Every `useMutation`: `onError` → `toast({ variant: "destructive", description: err.message || "Something went wrong" })`.
- Every new dashboard route: `withApiAuth` with explicit `roles`; cron: `verifyCronSecret` + `acquireCronLock`; bodies via `parseJsonBody` + Zod; errors via `ApiError`.
- Notification writers call `notifyUsers` from `@/lib/notify-user`, never `userNotification.create`.
- Post-response work goes through `runAfter` from `@/lib/run-after`.
- Tests: Vitest, `src/__tests__/**`, `mockImplementation` with input routing, never `mockResolvedValueOnce` chains; `_clearUserActiveCache()` in `beforeEach` of route tests; route tests mock `@/lib/rate-limit`, `@/lib/logger`, `@/lib/centre-scope` as in `src/__tests__/api/incidents-recent.test.ts`.
- No `console.*` in production code; `logger` from `@/lib/logger`.
- Model: the provider wrapper's default Anthropic model (`DEFAULT_PROVIDER_MODEL.showcase`); never the Groq `bulk` entry.
- Copy: "Knox suggests…", "Knox flagged…". Tier words: minor, moderate, serious. Ordering `minor < moderate < serious` everywhere.
- Every commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Verify with `npm run lint`, `npm test`, `npx tsc --noEmit`, and `npm run build` before the final PR.

## Review Focus

1. **OWNA re-lowers an approved severity.** A director approves `set_severity → serious`; the next sync maps OWNA's `medicalAttention` to `moderate`. Expected: the record stays `serious`. Pinned in Task 12.
2. **An edit lands while the job is running.** The claimed job read the old row; the edit must still be assessed. Expected: a new `pending` job is created despite a `running` one. Pinned in Task 5.
3. **Knox is switched on weeks after merge.** Hundreds of pending jobs exist. Expected: they are assessed with `alerted: false`, nobody is pinged for stale records. Pinned in Task 11.
4. **A service has no director and its state has no state manager.** Expected: owners and all state managers receive level 0, the ops note posts, nothing throws. Pinned in Task 6.
5. **The model proposes lowering severity or an unknown category.** Expected: discarded; no `set_severity` card; `mark_reportable` only with a valid `SeriousIncidentCategory`. Pinned in Tasks 8 and 10.

---

## File structure

```
prisma/schema.prisma                                   + 4 models, 3 enums, AiUsage.userId optional, back-relations
prisma/migrations/20261021090000_knox_incident_triage/ migration.sql (from migrate dev)
src/lib/org-settings-shared.ts                         + knox section (schema, defaults, merge)
src/app/(dashboard)/settings/organisation/OrganisationSettingsClient.tsx  + Knox section
src/lib/cron-guard.ts                                  + "5min" period
src/lib/knox/types.ts                                  shared types
src/lib/knox/settings.ts                               getKnoxSettings()
src/lib/knox/rules.ts                                  evaluateRules(), REGULATOR_WINDOW_HOURS
src/lib/knox/enqueue.ts                                enqueueTriage()
src/lib/knox/recipients.ts                             resolveRecipients()
src/lib/knox/alerts.ts                                 dispatchLevel(), buildKnoxTeamsCard(), runEscalationSweep()
src/lib/knox/prompt.ts                                 KNOX_SYSTEM_PROMPT, buildAssessmentPrompt()
src/lib/knox/assess.ts                                 assessmentSchema, assessWithModel(), redactForModel()
src/lib/knox/actions.ts                                buildCards(), approvePendingAction(), dismissPendingAction()
src/lib/knox/worker.ts                                 runTriageJob(), sweepJobs()
src/lib/knox/load-subject.ts                           loadSubject()
src/lib/incidents/update-incident-record.ts            incidentPatchSchema, updateIncidentRecord()
src/lib/complaints/update-complaint-record.ts          complaintPatchSchema, updateComplaintRecord()
src/lib/teams-notify.ts                                webhookUrl + mentions on TeamsNotifyOptions
src/lib/notification-types.ts                          KNOX_ALERT
src/lib/morning-briefing.ts                            knox signal
src/lib/owna-sync.ts                                   enqueue + severity ratchet
src/app/api/incidents/route.ts, [id]/route.ts          enqueue (+ helper use)
src/app/api/compliance/complaints/route.ts, [id]/route.ts
src/app/api/services/[id]/staff-incidents/route.ts
src/app/api/cowork/operations/incidents/route.ts
src/app/api/cron/knox-tick/route.ts
src/app/api/knox/assessments/[id]/ack/route.ts
src/app/api/knox/actions/route.ts
src/app/api/knox/actions/[id]/approve/route.ts
src/app/api/knox/actions/[id]/dismiss/route.ts
src/app/api/knox/inbox/route.ts
src/hooks/useKnox.ts
src/components/knox/KnoxPanel.tsx, KnoxCard.tsx, KnoxClock.tsx, KnoxBadge.tsx
src/app/(dashboard)/knox/page.tsx
src/lib/nav-config.ts, src/lib/role-permissions.ts     nav item + page access
vercel.json, .env.example, src/lib/env-validation.ts
CLAUDE.md
src/__tests__/lib/knox/*.test.ts, src/__tests__/api/knox/*.test.ts, src/__tests__/lib/knox-guards.test.ts
tests/integration/knox-triage.test.ts
```

---

### Task 1: Schema and migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_knox_incident_triage/migration.sql` (generated)

**Interfaces:**
- Produces: Prisma models `TriageJob`, `TriageAssessment`, `TriageAlert`, `PendingAction`; enums `TriageSubjectType { incident complaint staff_incident }`, `TriageJobStatus { pending running done failed skipped }`, `TriageTier { minor moderate serious }`; `AiUsage.userId String?` with `user User?`.

- [ ] **Step 1: Add the four models and three enums exactly as in spec §3.2** to `prisma/schema.prisma`, after `model PurchaseApproval`. Add back-relations: on `Service` → `triageAssessments TriageAssessment[] @relation("ServiceTriageAssessments")`; on `User` → `triageAlertsReceived TriageAlert[] @relation("TriageAlertRecipient")`, `triageAlertsAcknowledged TriageAlert[] @relation("TriageAlertAcknowledger")`, `pendingActionsCommitted PendingAction[] @relation("PendingActionCommitter")`, `pendingActionsDismissed PendingAction[] @relation("PendingActionDismisser")`.

- [ ] **Step 2: Relax `AiUsage.userId`** to `String?` and `user User? @relation("AiUsageLogs", fields: [userId], references: [id], onDelete: Cascade)`.

- [ ] **Step 3: Generate the migration against the LOCAL database**

Run: `npx prisma migrate dev --name knox_incident_triage`
Expected: a new folder under `prisma/migrations/`, "Your database is now in sync". `DATABASE_URL` must be the local `amana_eos_dev` (see CLAUDE.md → Environment). Never export `PROD_DATABASE_URL` here.

- [ ] **Step 4: Confirm the client and types compile**

Run: `npx prisma generate && npx tsc --noEmit`
Expected: no errors. (Existing `aiUsage.create` sites still pass a `userId`; the optional type is additive.)

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(knox): triage job, assessment, alert and pending-action models"
```

---

### Task 2: Knox org settings

**Files:**
- Modify: `src/lib/org-settings-shared.ts` (schema near `notifications`, `ORG_SETTINGS_DEFAULTS`, `mergeOrgSettings`)
- Create: `src/lib/knox/settings.ts`
- Modify: `src/app/(dashboard)/settings/organisation/OrganisationSettingsClient.tsx`
- Test: `src/__tests__/lib/knox/settings.test.ts`

**Interfaces:**
- Produces: `OrgSettingsConfig["knox"] = { enabled: boolean; shadowMode: boolean }`; `getKnoxSettings(): Promise<{ enabled: boolean; shadowMode: boolean }>` reading `getOrgSettings()` from `@/lib/org-settings`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/lib/knox/settings.test.ts
import { mergeOrgSettings, ORG_SETTINGS_DEFAULTS, orgSettingsConfigSchema } from "@/lib/org-settings-shared";

it("defaults knox to off + shadow", () => {
  expect(ORG_SETTINGS_DEFAULTS.knox).toEqual({ enabled: false, shadowMode: true });
});
it("merge keeps stored knox values and fills missing ones", () => {
  const merged = mergeOrgSettings({ knox: { enabled: true } } as never);
  expect(merged.knox).toEqual({ enabled: true, shadowMode: true });
});
it("schema accepts a full knox object and rejects a non-boolean", () => {
  expect(orgSettingsConfigSchema.shape.knox.safeParse({ enabled: true, shadowMode: false }).success).toBe(true);
  expect(orgSettingsConfigSchema.shape.knox.safeParse({ enabled: "yes" }).success).toBe(false);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/__tests__/lib/knox/settings.test.ts`
Expected: FAIL — `knox` undefined on defaults.

- [ ] **Step 3: Add the `knox` section** to `orgSettingsConfigSchema` as `z.object({ enabled: z.boolean().default(false), shadowMode: z.boolean().default(true) }).default({ enabled: false, shadowMode: true })`, the same object-level `.default()` reason as `notifications`; add to `ORG_SETTINGS_DEFAULTS`; add the merge branch in `mergeOrgSettings` mirroring `notifications` (typeof-boolean guards per key).

- [ ] **Step 4: Create `getKnoxSettings()`** in `src/lib/knox/settings.ts` returning `(await getOrgSettings()).knox`.

- [ ] **Step 5: Add the settings UI**: a `<Section title="Knox incident triage" description="Knox assesses new incidents and complaints, alerts the right people and proposes record changes for approval. Shadow mode records assessments but sends nothing." onReset={() => resetSection("knox")}>` with two checkboxes bound to `config.knox.enabled` and `config.knox.shadowMode`, copying the `serviceAlertsPaused` checkbox markup.

- [ ] **Step 6: Run tests and typecheck**

Run: `npx vitest run src/__tests__/lib/knox/settings.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/org-settings-shared.ts src/lib/knox/settings.ts "src/app/(dashboard)/settings/organisation/OrganisationSettingsClient.tsx" src/__tests__/lib/knox/settings.test.ts
git commit -m "feat(knox): org settings — enabled + shadow mode"
```

---

### Task 3: Rules and clocks (pure)

**Files:**
- Create: `src/lib/knox/types.ts`, `src/lib/knox/rules.ts`
- Test: `src/__tests__/lib/knox/rules.test.ts`

**Interfaces:**
- Produces (in `types.ts`):

```ts
import type { IncidentRecord, ComplaintRecord, StaffIncidentReport, TriageTier } from "@prisma/client";
export interface ServiceLite { id: string; name: string; state: string | null; managerId: string | null }
export type TriageSubject =
  | { type: "incident"; record: IncidentRecord; service: ServiceLite; childFirstName: string | null }
  | { type: "complaint"; record: ComplaintRecord; service: ServiceLite }
  | { type: "staff_incident"; record: StaffIncidentReport; service: ServiceLite };
export type ClockKind = "parent_24h" | "regulator" | "complaint_regulator";
export interface TriageClock { kind: ClockKind; dueAt: string; basis: string; overdue: boolean }
export interface RulesResult { tier: TriageTier; ruleHits: string[]; clocks: TriageClock[] }
export const TIER_RANK: Record<TriageTier, number> = { minor: 0, moderate: 1, serious: 2 };
```

- Produces (in `rules.ts`): `evaluateRules(subject: TriageSubject, now: Date): RulesResult`; `REGULATOR_WINDOW_HOURS: Record<SeriousIncidentCategory, number>` (import `SeriousIncidentCategory` from `@/lib/compliance-clocks`); `regulatorDueAt(category: string | null, becameAwareAt: Date | null, createdAt: Date): Date | null`.

- [ ] **Step 1: Write the failing table tests**

```ts
// src/__tests__/lib/knox/rules.test.ts
import { evaluateRules, REGULATOR_WINDOW_HOURS, regulatorDueAt } from "@/lib/knox/rules";
const NOW = new Date("2026-10-20T03:00:00Z");
const svc = { id: "svc-1", name: "Arkana", state: "NSW", managerId: null };
const incident = (o: Partial<IncidentRecord> = {}) => ({ type: "incident" as const, service: svc, childFirstName: "Ali",
  record: { id: "i1", serviceId: "svc-1", incidentDate: new Date("2026-10-20T01:00:00Z"), incidentType: "injury", severity: "minor",
    ambulanceCalled: false, medicalPersonnelContacted: null, reportableToAuthority: false, seriousIncidentCategory: null,
    parentNotified: false, becameAwareAt: null, createdAt: NOW, deleted: false, ...o } as IncidentRecord });

describe.each([
  ["ambulance_called",   incident({ ambulanceCalled: true }),                      "serious"],
  ["missing_child",      incident({ incidentType: "missing_child" }),              "serious"],
  ["stated_serious",     incident({ severity: "reportable" }),                     "serious"],
  ["reportable_flag",    incident({ seriousIncidentCategory: "serious_injury" }),  "serious"],
  ["medical_contacted",  incident({ medicalPersonnelContacted: "GP phoned" }),     "moderate"],
  ["medication_error",   incident({ incidentType: "medication_error" }),           "moderate"],
  ["stated_moderate",    incident({ severity: "moderate" }),                       "moderate"],
])("%s", (rule, subject, tier) => {
  it(`→ ${tier} and records the hit`, () => {
    const r = evaluateRules(subject, NOW);
    expect(r.tier).toBe(tier);
    expect(r.ruleHits).toContain(rule);
  });
});
it("nothing matched → minor with no hits", () => {
  expect(evaluateRules(incident(), NOW)).toMatchObject({ tier: "minor", ruleHits: [] });
});
it("records every hit, not just the first", () => {
  const r = evaluateRules(incident({ ambulanceCalled: true, severity: "moderate" }), NOW);
  expect(r.ruleHits).toEqual(expect.arrayContaining(["ambulance_called", "stated_moderate"]));
  expect(r.tier).toBe("serious");
});
it("complaint: notifiable → serious; child_safety → moderate; status escalated → serious", () => { /* three asserts, complaint subjects */ });
it("staff_incident: notifiable severity → serious; moderate → moderate; reportable flag → serious", () => { /* three asserts */ });
it("parent_24h clock when parentNotified is false, overdue flagged", () => {
  const r = evaluateRules(incident({ incidentDate: new Date("2026-10-18T00:00:00Z") }), NOW);
  expect(r.clocks).toContainEqual({ kind: "parent_24h", dueAt: "2026-10-19T00:00:00.000Z", basis: "Reg 86", overdue: true });
});
it("no parent clock once parentNotified", () => {
  expect(evaluateRules(incident({ parentNotified: true }), NOW).clocks.find(c => c.kind === "parent_24h")).toBeUndefined();
});
it("regulator clock: 24h from becameAwareAt, else from createdAt; category drives the window", () => {
  expect(regulatorDueAt("serious_injury", new Date("2026-10-20T00:00:00Z"), NOW)?.toISOString()).toBe("2026-10-21T00:00:00.000Z");
  expect(regulatorDueAt(null, null, NOW)?.toISOString()).toBe("2026-10-21T03:00:00.000Z");
  for (const k of Object.keys(REGULATOR_WINDOW_HOURS)) expect(REGULATOR_WINDOW_HOURS[k as never]).toBeGreaterThan(0);
});
it("complaint_regulator clock reuses the stamped notificationDueAt", () => { /* complaint with notifiable:true, notificationDueAt set, regulatorNotifiedAt null */ });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/__tests__/lib/knox/rules.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `types.ts` and `rules.ts`.** `REGULATOR_WINDOW_HOURS` lists all six `SERIOUS_INCIDENT_CATEGORIES` values; every entry is `24` with a comment citing Reg 176(2)(a) (24 hours for serious incidents under Reg 12) — the spec leaves a longer window only for categories the regulation names, and none of the six are. Keep the map exported so a later correction is one line. `regulatorDueAt` falls back to `24` for an unknown/null category. Use `notificationDueAt`'s `HOUR_MS` arithmetic style; do not import private constants.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/__tests__/lib/knox/rules.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/knox/types.ts src/lib/knox/rules.ts src/__tests__/lib/knox/rules.test.ts
git commit -m "feat(knox): tier rules and regulatory clocks"
```

---

### Task 4: 5-minute cron lock period

**Files:**
- Modify: `src/lib/cron-guard.ts:28,47-75`
- Test: `src/__tests__/lib/cron-guard.test.ts` (extend)

**Interfaces:**
- Produces: `CronPeriod` includes `"5min"`; `acquireCronLock(name, "5min")` keys on `YYYY-MM-DDTHH:MM` floored to 5.

- [ ] **Step 1: Add a failing test** next to the existing `15min` test (use the file's existing fake-timer pattern):

```ts
it("5min period floors the minute to a multiple of five", async () => {
  vi.setSystemTime(new Date("2026-10-20T03:17:30Z"));
  await acquireCronLock("knox-tick", "5min");
  expect(prismaMock.cronRun.findUnique).toHaveBeenCalledWith(
    expect.objectContaining({ where: { cronName_period: { cronName: "knox-tick", period: "2026-10-20T03:15" } } }),
  );
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/__tests__/lib/cron-guard.test.ts` → FAIL (type error / wrong key).

- [ ] **Step 3: Implement**: add `"5min"` to `CronPeriod`; in `getPeriodKey`, a branch identical to `15min` with `Math.floor(min / 5) * 5`.

- [ ] **Step 4: Run tests** → PASS. **Step 5: Commit** `git commit -m "feat(cron-guard): 5-minute lock period"`.

---

### Task 5: Enqueue

**Files:**
- Create: `src/lib/knox/enqueue.ts`
- Test: `src/__tests__/lib/knox/enqueue.test.ts`

**Interfaces:**
- Produces: `enqueueTriage(db: PrismaClient | Prisma.TransactionClient, input: { subjectType: TriageSubjectType; subjectId: string; serviceId: string; reason: "created" | "updated" | "sweep" }): Promise<string | null>` — returns the job id (existing pending or newly created), `null` on any error (logged).

- [ ] **Step 1: Write failing tests**

```ts
it("creates a pending job and returns its id", async () => { /* triageJob.findFirst → null; create → { id: "job-1" }; expect "job-1"; create called with status omitted (defaults pending) */ });
it("returns the existing pending job id without creating", async () => { /* findFirst → { id: "job-0", status: "pending" }; expect "job-0"; create not called */ });
it("a running job does not block a new pending one", async () => { /* findFirst where includes status: "pending" only; create still called */ });
it("swallows database errors and returns null", async () => { /* create rejects; expect null; logger.error called */ });
```

- [ ] **Step 2: Run → FAIL.** **Step 3: Implement** with `findFirst({ where: { subjectType, subjectId, status: "pending" } })` then `create`. **Step 4: Run → PASS.**

- [ ] **Step 5: Commit** `git commit -m "feat(knox): enqueueTriage with pending dedupe"`.

---

### Task 6: Recipient resolution

**Files:**
- Create: `src/lib/knox/recipients.ts`
- Test: `src/__tests__/lib/knox/recipients.test.ts`

**Interfaces:**
- Produces:

```ts
export interface Recipient { id: string; name: string | null; email: string }
export interface Recipients { directors: Recipient[]; stateManagers: Recipient[]; owners: Recipient[]; noDirector: boolean }
export async function resolveRecipients(db: PrismaClient, service: ServiceLite): Promise<Recipients>
```

- [ ] **Step 1: Write failing tests** (prismaMock, `user.findMany` / `user.findUnique` / `userServiceMembership.findMany` routed by `where`):

```ts
it("director = Service.managerId when set and active", …)
it("falls back to active membership whose roleAtService matches /director/i", …)
it("falls back to role member with serviceId = service.id", …)
it("noDirector true and directors empty when nothing resolves", …)
it("state managers filtered by service.state case-insensitively, else all head_office", …)
it("owners = role owner; inactive users (active false) excluded from every bucket; duplicates removed", …)
```

- [ ] **Step 2: Run → FAIL.** **Step 3: Implement** (every query filters `active: true` — the `User` flag is `active`, not `isActive`; select `id, name, email`). **Step 4: Run → PASS.**

- [ ] **Step 5: Commit** `git commit -m "feat(knox): resolveRecipients with director/state/owner fallbacks"`.

---

### Task 7: Teams extension, alert dispatch, escalation

**Files:**
- Modify: `src/lib/teams-notify.ts:28-35,87-118`
- Modify: `src/lib/notification-types.ts` (add `KNOX_ALERT: "knox_alert"`)
- Create: `src/lib/knox/alerts.ts`
- Test: `src/__tests__/lib/knox/alerts.test.ts`, `src/__tests__/lib/teams-notify-knox.test.ts`

**Interfaces:**
- Consumes: `Recipients` (Task 6), `RulesResult`/`TriageSubject` (Task 3), `notifyUsers` (`@/lib/notify-user`).
- Produces:

```ts
// teams-notify.ts additions
interface TeamsNotifyOptions { …; webhookUrl?: string; mentions?: { email: string; name: string }[] }
// alerts.ts
export const ESCALATION = { moderate: [60], serious: [15, 30] } as const;   // minutes, cumulative from level 0 sentAt
export function recordLink(subjectType: TriageSubjectType, subjectId: string, assessmentId: string): string
export async function dispatchLevel(db, args: { assessmentId: string; subject: TriageSubject; rules: RulesResult; recipients: Recipients; level: 0 | 1 | 2; rationale?: string | null }): Promise<void>
export async function runEscalationSweep(db, now: Date): Promise<{ escalated: number }>
export async function postOpsNote(title: string, body: string): Promise<void>
```

- [ ] **Step 1: Teams test** (`teams-notify-knox.test.ts`, stub `global.fetch`): `webhookUrl` override is used instead of `TEAMS_WEBHOOK_URL`; `mentions` produce `<at>Name</at>` in a TextBlock and `msteams.entities[0]` = `{ type: "mention", text: "<at>Name</at>", mentioned: { id: email, name } }`.

- [ ] **Step 2: Alert tests** (`alerts.test.ts`, mock `@/lib/notify-user`, `@/lib/teams-notify`, `@/lib/knox/recipients`):

```ts
it("minor level 0 sends nothing and creates no TriageAlert rows", …)
it("moderate level 0 pushes to directors only (notifyUsers type knox_alert, link = recordLink) and writes one push row per director", …)
it("serious level 0 pushes to directors + state managers and posts one Teams card (channel row recipientUserId null) to TEAMS_KNOX_WEBHOOK_URL, falling back to TEAMS_WEBHOOK_URL", …)
it("serious level 1 posts a Teams card mentioning owners and pushes owners", …)
it("delivered=false on the Teams row when sendTeamsNotification returns false", …)
it("recipients.noDirector → state managers take level 0 for moderate AND serious, and postOpsNote is called once with the service name", …)
it("escalation sweep: serious unacknowledged 16 min after level-0 sentAt → level 1; 14 min → nothing; level 1 exists → level 2 only after 30 min cumulative; acknowledged → nothing; max level reached → nothing", …)
it("escalation sweep: moderate escalates once after 60 min to state managers", …)
it("recordLink: incident → /incidents?knox=<assessmentId>&incident=<id>; complaint → /knox?subject=complaint:<id>; staff_incident → /knox?subject=staff_incident:<id>", …)
```

- [ ] **Step 3: Run → FAIL.** **Step 4: Implement.** Card content per spec §3.7 (tier colour: minor none, moderate `#d97706`, serious `#dc2626`; facts: service, type, when in `Australia/Sydney`, each clock "due HH:mm d MMM" or "OVERDUE", rule hits in plain words via a small label map; actions: Acknowledge → `recordLink`, Open record → same without `knox` param). `runEscalationSweep` loads assessments with `alerted: true`, no acknowledged alert, groups alerts by level, computes the next level from `ESCALATION[tier]` against the level-0 `sentAt`. **Step 5: Run → PASS.**

- [ ] **Step 6: Commit** `git commit -m "feat(knox): alert dispatch, Teams mentions, escalation sweep"`.

---

### Task 8: Model assessment

**Files:**
- Create: `src/lib/knox/prompt.ts`, `src/lib/knox/assess.ts`
- Test: `src/__tests__/lib/knox/assess.test.ts`

**Interfaces:**
- Consumes: `generateStructured` (`@/lib/ai-provider`), `SERIOUS_INCIDENT_CATEGORIES`.
- Produces:

```ts
export const assessmentSchema = z.object({
  severityOpinion: z.enum(["agrees", "understated", "unsure"]),
  rationale: z.string().min(1).max(600),
  missingFields: z.array(z.enum(MISSING_FIELD_LABELS)).max(10),
  suggestedSeverity: z.enum(["moderate", "serious", "reportable"]).optional(),
  suggestedCategory: z.enum(SERIOUS_INCIDENT_CATEGORY_VALUES).optional(),
  followUpTodos: z.array(z.object({ title: z.string().min(3).max(140), dueInDays: z.union([z.literal(1), z.literal(3), z.literal(7)]) })).max(4),
  parentNoticeDraft: z.string().max(2000).optional(),
  regulatorPackDraft: z.string().max(6000).optional(),
});
export type ModelAssessment = z.infer<typeof assessmentSchema>;
export function redactForModel(subject: TriageSubject): Record<string, unknown>   // no surname, no contact fields, witnesses with capitalised words → "[name]"
export async function assessWithModel(subject: TriageSubject, rules: RulesResult, opts?: { timeoutMs?: number }): Promise<
  | { ok: true; data: ModelAssessment; modelId: string; inputTokens: number; outputTokens: number; durationMs: number }
  | { ok: false; error: string }>
```

`MISSING_FIELD_LABELS` is a fixed tuple: `"circumstances" | "actionTaken" | "firstAidDetails" | "witnesses" | "parentNotifiedName" | "parentNotifiedMethod" | "becameAwareAt" | "seriousIncidentCategory" | "location" | "timeOfDay"`.

- [ ] **Step 1: Write failing tests** (mock `@/lib/ai-provider`):

```ts
it("prompt never contains the child surname, complainant email/phone, or raw witness names", () => {
  const s = incident({ childName: "Ali Haddad", witnesses: "Seen by Sarah Lee and a parent" });
  const text = JSON.stringify(redactForModel(s));
  expect(text).not.toMatch(/Haddad|Sarah|Lee/); expect(text).toContain("Ali");
});
it("returns ok with parsed data and token counts", …)
it("returns ok:false on a timeout (generateStructured never resolves; timeoutMs 10)", …)
it("returns ok:false when the provider rejects", …)
it("schema rejects an unknown suggestedCategory and a 5th todo", …)
```

- [ ] **Step 2: Run → FAIL.** **Step 3: Implement.** `KNOX_SYSTEM_PROMPT` states the persona, the three tiers in the spec's words, Regs 86/87/175/176 and s.174, "critique the rules result, do not recompute it", "never propose a lower severity", drafts use `{{child_name}}`, output JSON only. `buildAssessmentPrompt(redacted, rules)` serialises both. Call `generateStructured({ system, prompt, schema: assessmentSchema, maxTokens: 1500, temperature: 0.2 })` raced against `AbortSignal.timeout(timeoutMs ?? 20_000)` (the provider has no signal param; race a timer and ignore the late result). **Step 4: Run → PASS.**

- [ ] **Step 5: Commit** `git commit -m "feat(knox): model assessment with PII redaction and Zod contract"`.

---

### Task 9: Shared update helpers extracted from the PATCH routes

**Files:**
- Create: `src/lib/incidents/update-incident-record.ts`, `src/lib/complaints/update-complaint-record.ts`
- Modify: `src/app/api/incidents/[id]/route.ts`, `src/app/api/compliance/complaints/[id]/route.ts`
- Test: `src/__tests__/lib/knox/update-helpers.test.ts`; existing route tests must stay green.

**Interfaces:**
- Produces:

```ts
// update-incident-record.ts
export const incidentPatchSchema = /* the current patchSchema moved verbatim */;
export type IncidentPatch = z.infer<typeof incidentPatchSchema>;
export async function updateIncidentRecord(db, id: string, patch: IncidentPatch, actor: { id: string }): Promise<IncidentRecord>
// update-complaint-record.ts
export const complaintPatchSchema = /* moved verbatim */;
export type ComplaintPatch = z.infer<typeof complaintPatchSchema>;
export async function updateComplaintRecord(db, id: string, patch: ComplaintPatch, actor: { id: string }, existing: { notifiable: boolean; becameAwareAt: Date | null }): Promise<Pick<ComplaintRecord, "id" | "reference" | "status" | "notificationDueAt" | "regulatorNotifiedAt" | "notifiable" | "severity"> & Record<string, unknown>>
```

The helpers own the `data` construction (the spread blocks), the `shareWithParent` stamping, the `becomingNotifiable` reason rule and `dueAtPatch`, and the `resolving` stamp. Routes keep auth, scope and permission checks.

- [ ] **Step 1: Write failing helper tests**: `updateComplaintRecord` throws `ApiError.badRequest` when becoming notifiable without a reason; stamps `notificationDueAt = becameAwareAt + 24h` when becoming notifiable with no awareness change; `updateIncidentRecord` maps `shareWithParent: true` to `sharedWithParentAt`/`sharedById` and `false` to nulls (match the existing route behaviour — read it first).

- [ ] **Step 2: Run → FAIL.** **Step 3: Move the code** out of the two routes into the helpers; routes call the helper after their checks. Behaviour must not change.

- [ ] **Step 4: Run the whole suite** `npm test` → PASS (existing incident/complaint route tests included).

- [ ] **Step 5: Commit** `git commit -m "refactor: extract incident and complaint update helpers for shared write path"`.

---

### Task 10: Cards (PendingAction) and their executors

**Files:**
- Create: `src/lib/knox/actions.ts`
- Test: `src/__tests__/lib/knox/actions.test.ts`

**Interfaces:**
- Consumes: Task 9 helpers, `ModelAssessment`, `RulesResult`, `TriageSubject`, `Recipients`.
- Produces:

```ts
export const CARD_TTL_MS = 72 * 60 * 60 * 1000;
export type CardKind = "set_severity" | "mark_reportable" | "mark_notifiable" | "create_followup_todos";
export function buildCards(args: { subject: TriageSubject; rules: RulesResult; model: ModelAssessment | null; now: Date }): Array<{ kind: CardKind; payload: Record<string, unknown>; summary: string; rationale: string | null }>
export async function approvePendingAction(db, id: string, actor: { id: string; role: string; serviceIds: string[] | null }, now?: Date): Promise<{ resultId: string }>
export async function dismissPendingAction(db, id: string, actor: { id: string; serviceIds: string[] | null }, reason?: string): Promise<void>
export class PendingActionGone extends Error {}      // expired / committed / dismissed → route maps to 410
export class PendingActionHidden extends Error {}    // not in scope → 404
```

Severity rank for the ratchet: `minor < moderate < serious < reportable` (strings on `IncidentRecord.severity`).

- [ ] **Step 1: Write failing tests**

```ts
it("set_severity only when model says understated AND suggested > stated; never lower", …)
it("mark_reportable when tier serious, not yet reportable, and model gives a valid category; payload { reportableToAuthority: true, seriousIncidentCategory, becameAwareAt: (existing becameAwareAt ?? now) ISO }", …)
it("no mark_reportable without a category", …)
it("mark_notifiable for a complaint_sensitive hit or an understated opinion, when !notifiable; payload { notifiable: true, notifiableReason: suggestedCategory ? 'serious_incident' : 'law_contravention', becameAwareAt: existing ?? now }", …)
it("create_followup_todos with model todos; staff_incident gets ONLY this kind", …)
it("approve: re-validates payload with the helper schema, calls updateIncidentRecord, stamps committedAt/By/resultId, writes ActivityLog knox.approved", …)
it("approve on expired → PendingActionGone; on committed → PendingActionGone; out of scope serviceIds → PendingActionHidden", …)
it("approve create_followup_todos creates one Todo per item: title, dueDate = now + dueInDays, weekOf = Monday of dueDate's week (copy the helper the auto-measurables cron uses), assigneeId = first director else first state manager, serviceId, createdById = actor, status pending", …)
it("dismiss stamps dismissedAt/By/reason and logs knox.dismissed", …)
it("approve of set_severity / mark_reportable / mark_notifiable calls enqueueTriage({ reason: 'updated' }) after the commit and returns its jobId; create_followup_todos does not", …)
```

`approvePendingAction` therefore returns `{ resultId: string; jobId: string | null }`; the approve route (Task 14) runs `runAfter(() => runTriageJob(jobId))` when `jobId` is set, so marking reportable re-assesses and, if the tier rose, alerts (spec §3.10).

- [ ] **Step 2: Run → FAIL.** **Step 3: Implement.** `summary` strings: `"Severity: minor → serious"`, `"Mark reportable to the regulator (serious injury)"`, `"Mark complaint notifiable (serious incident)"`, `"Create 2 follow-up to-dos"`. Expiry = `now + CARD_TTL_MS`. **Step 4: Run → PASS.**

- [ ] **Step 5: Commit** `git commit -m "feat(knox): pending-action cards with approve/dismiss executors"`.

---

### Task 11: Worker

**Files:**
- Create: `src/lib/knox/load-subject.ts`, `src/lib/knox/worker.ts`, `src/lib/knox/index.ts`
- Test: `src/__tests__/lib/knox/worker.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces:

```ts
export async function loadSubject(db, subjectType: TriageSubjectType, subjectId: string): Promise<TriageSubject | null>  // null when missing or deleted; incident childFirstName = first token of childName
export async function runTriageJob(jobId: string, now?: Date): Promise<"done" | "skipped" | "failed" | "retry" | "not_claimed">
export async function sweepJobs(now: Date, limit = 25): Promise<{ processed: number }>
export const STALE_BACKLOG_MS = 24 * 60 * 60 * 1000;
export const MAX_ATTEMPTS = 3;
```

- [ ] **Step 1: Write failing tests** (mock `@/lib/knox/alerts`, `@/lib/knox/assess`, `@/lib/knox/actions`, `@/lib/knox/recipients`, `@/lib/knox/settings`; prismaMock for jobs/assessments):

```ts
it("claim: updateMany where {id,status:pending} count 0 → 'not_claimed' and nothing else runs", …)
it("missing/deleted subject → job skipped", …)
it("dispatches level 0 alerts BEFORE assessWithModel resolves (order of mock calls)", …)
it("model failure → assessment source rules_only with modelError, job done, alerts already sent", …)
it("shadow mode → no dispatch, no cards, alerted:false, assessment still written", …)
it("silent re-triage: prior assessment ≤24h with tier >= new tier and alerted → no dispatch, alerted:false", …)
it("raising re-triage: prior moderate, new serious → dispatch", …)
it("second safety net: rules minor + model understated→serious → moderate dispatch to directors + set_severity card", …)
it("stale backlog: job createdAt older than STALE_BACKLOG_MS → alerted:false regardless", …)
it("exception after claim: attempts<3 → status pending, scheduledFor = now + 2^attempts min; attempts==3 → failed + postOpsNote('Knox could not assess …')", …)
it("recipients.noDirector is passed through to dispatchLevel unchanged (the ops note is dispatch's job, not the worker's)", …)
it("AiUsage row written with section 'knox', userId null, metadata.assessmentId", …)
it("sweepJobs processes at most `limit` pending jobs with scheduledFor <= now, oldest first", …)
```

- [ ] **Step 2: Run → FAIL.** **Step 3: Implement** per spec §3.5 order. Dedupe check: `triageAssessment.findFirst({ where: { subjectType, subjectId, alerted: true, createdAt: { gte: now - 24h } }, orderBy: { createdAt: "desc" } })` and compare `TIER_RANK`. Write assessment + job `done` in one `$transaction`. `index.ts` re-exports `enqueueTriage`, `runTriageJob`, `sweepJobs`, `runEscalationSweep`. **Step 4: Run → PASS.**

- [ ] **Step 5: Commit** `git commit -m "feat(knox): triage worker — claim, rules, alerts, model, cards"`.

---

### Task 12: Wire the writers and the OWNA ratchet

**Files:**
- Modify: `src/app/api/incidents/route.ts` (POST), `src/app/api/incidents/[id]/route.ts` (PATCH), `src/app/api/compliance/complaints/route.ts` (POST), `src/app/api/compliance/complaints/[id]/route.ts` (PATCH), `src/app/api/services/[id]/staff-incidents/route.ts` (POST), `src/app/api/cowork/operations/incidents/route.ts` (POST), `src/lib/owna-sync.ts:612-700`
- Create: `src/__tests__/lib/knox-guards.test.ts`
- Test: extend `src/__tests__/api/incidents.test.ts`; `src/__tests__/lib/owna-sync-knox.test.ts`

**Interfaces:**
- Consumes: `enqueueTriage`, `runTriageJob`, `runAfter`.
- Produces: a module-level helper in `src/lib/knox/trigger.ts`: `triggerTriage(input: Parameters<typeof enqueueTriage>[1], opts?: { immediate?: boolean }): void` — enqueues, and when `immediate`, `runAfter(() => runTriageJob(jobId))`. `incidentTriggerChanged(before, patch): boolean` and `complaintTriggerChanged(before, patch): boolean` in the same file, using the spec §3.1 field lists.

- [ ] **Step 1: Write the guard test** (`knox-guards.test.ts`, same walker as `email-bypass-guard.test.ts`):

```ts
const WRITERS = [
  "app/api/incidents/route.ts", "app/api/incidents/[id]/route.ts",
  "app/api/compliance/complaints/route.ts", "app/api/compliance/complaints/[id]/route.ts",
  "app/api/services/[id]/staff-incidents/route.ts", "app/api/cowork/operations/incidents/route.ts",
  "lib/owna-sync.ts",
];
it("every register writer calls triggerTriage or enqueueTriage", …)          // regex /\b(triggerTriage|enqueueTriage)\s*\(/
it("the two PATCH routes no longer call prisma.incidentRecord.update / prisma.complaintRecord.update directly", …)
it("no file outside src/lib/knox writes triageAssessment or pendingAction rows", …)
```

- [ ] **Step 2: Write the route and sync tests**:

```ts
// incidents.test.ts additions
it("POST returns 201 even when enqueueTriage rejects", …)            // mock @/lib/knox/trigger to throw synchronously inside; route must still 201 → triggerTriage must catch
it("PATCH with only description changed does not trigger; with severity changed triggers immediate", …)
// owna-sync-knox.test.ts
it("update keeps the higher severity (existing serious, mapped moderate → serious)", …)
it("update never sets reportableToAuthority from true to false", …)
it("new incidents are re-read by ownaIncidentId after createMany and enqueued reason 'created'; changed ones enqueued 'updated' only when mapped severity/type rose", …)
```

- [ ] **Step 3: Run → FAIL.** **Step 4: Implement.** In each dashboard route call `triggerTriage({...}, { immediate: true })` right after the create/update, before the response. In `owna-sync.ts` select `severity, incidentType, reportableToAuthority` in the pre-fetch, apply the ratchet in the update `data`, and after `createMany` run `findMany({ where: { ownaIncidentId: { in: createdIds } }, select: { id, serviceId } })` to enqueue. **Step 5: Run `npm test` → PASS.**

- [ ] **Step 6: Commit** `git commit -m "feat(knox): trigger triage from every register writer; OWNA severity ratchet"`.

---

### Task 13: The tick cron

**Files:**
- Create: `src/app/api/cron/knox-tick/route.ts`
- Modify: `vercel.json` (crons array)
- Test: `src/__tests__/api/knox/knox-tick.test.ts`

**Interfaces:**
- Consumes: `verifyCronSecret`, `acquireCronLock(name, "5min")`, `getKnoxSettings`, `sweepJobs`, `runEscalationSweep`.
- Produces: `GET /api/cron/knox-tick` → `{ skipped: true, reason }` or `{ processed, escalated }`; `export const maxDuration = 300`.

- [ ] **Step 1: Tests**: 401 without secret; `{ skipped: true }` when lock not acquired; `{ skipped: true, reason: "knox_disabled" }` when `enabled: false` and neither sweep runs; happy path calls `sweepJobs` then `runEscalationSweep` and returns both counts; lock is completed on the error path (copy the pattern from `morning-briefing`).

- [ ] **Step 2: Run → FAIL. Step 3: Implement** with `withApiHandler`. Add `{ "path": "/api/cron/knox-tick", "schedule": "*/5 * * * *" }` to `vercel.json`. **Step 4: Run → PASS.**

- [ ] **Step 5: Commit** `git commit -m "feat(knox): knox-tick cron — job sweep + escalation every 5 minutes"`.

---

### Task 14: Knox API routes

**Files:**
- Create: `src/app/api/knox/assessments/[id]/ack/route.ts`, `src/app/api/knox/actions/route.ts`, `src/app/api/knox/actions/[id]/approve/route.ts`, `src/app/api/knox/actions/[id]/dismiss/route.ts`, `src/app/api/knox/inbox/route.ts`
- Test: `src/__tests__/api/knox/ack.test.ts`, `actions.test.ts`, `inbox.test.ts`

**Interfaces:**
- All routes: `withApiAuth(handler, { roles: ["owner", "head_office", "admin", "member"] })`; scope via `getCentreScope(session)`.
- `POST /api/knox/assessments/[id]/ack` → 200 `{ acknowledgedAt }`; 404 when the assessment's `serviceId` is outside scope or missing; idempotent; `ActivityLog { action: "knox.acknowledged", entityType: "TriageAssessment", entityId }`.
- `GET /api/knox/actions?serviceId=&status=open|committed|dismissed|expired` → `{ actions: PendingAction[] }` scoped; default `open` = not committed, not dismissed, `expiresAt > now`.
- `POST /api/knox/actions/[id]/approve` → 200 `{ resultId }`; maps `PendingActionHidden` → 404, `PendingActionGone` → 410, Zod failure inside the helper → 400.
- `POST /api/knox/actions/[id]/dismiss` body `{ reason?: string (max 500) }` → 200.
- `GET /api/knox/inbox?subject=<type>:<id>` → `{ awaitingAck: Alert[]; openCards: PendingAction[]; recent: Assessment[] (7 days, max 50); failedJobs: Job[] (admin roles only, else []) ; subject?: { assessments: Assessment[]; cards: PendingAction[] } }`, each list scoped.
- `GET /api/knox/inbox?tiersFor=<type>:<id1>,<id2>,…` (max 200 ids) → `{ tiers: Record<string, TriageTier | null> }` — latest assessment tier per subject, scoped; used by the complaint and staff-incident tables to draw badges with one request per table.
- `POST /api/knox/actions/[id]/approve` also runs `runAfter(() => runTriageJob(jobId))` when the executor returns a `jobId`.

- [ ] **Step 1: Write failing route tests** covering, per route: 401 no session, 403 role `staff`, 404 out of scope (`getCentreScope` → `{ serviceIds: ["other"] }`), 400 bad body (dismiss reason > 500 chars; approve with a tampered payload failing the helper schema), 410 expired, happy path 200. Inbox: `failedJobs` empty for `member`.

- [ ] **Step 2: Run → FAIL. Step 3: Implement.** **Step 4: Run → PASS.**

- [ ] **Step 5: Commit** `git commit -m "feat(knox): ack, actions and inbox API routes"`.

---

### Task 15: UI — hooks, panel, badges, inbox page, nav

**Files:**
- Create: `src/hooks/useKnox.ts`, `src/components/knox/KnoxPanel.tsx`, `KnoxCard.tsx`, `KnoxClock.tsx`, `KnoxBadge.tsx`, `src/app/(dashboard)/knox/page.tsx`
- Modify: `src/app/(dashboard)/incidents/page.tsx` (`IncidentRow` expanded area, line ~579), `src/components/compliance/ComplaintsRegister.tsx` (row, line ~436), `src/components/services/ServiceRegistersTab.tsx` (`StaffIncidentsPanel` rows), `src/lib/nav-config.ts`, `src/lib/role-permissions.ts` (add `"/knox"` to the `AppPage` page list next to `"/incidents"` at line ~180, then to the owner, head_office, admin and member entries of `rolePageAccess` at line ~430; `eos` derives from `allPages`)
- Test: `src/__tests__/lib/knox/use-knox-keys.test.ts` (query keys are primitives), plus the existing nav/page-access guard tests must pass.

**Interfaces:**
- `useKnox.ts`: `useKnoxInbox(subject?: string)`, `useKnoxSubject(type, id)` (reads inbox `subject` slice), `useAcknowledge()`, `useApproveAction()`, `useDismissAction()`; keys `["knox", "inbox", subject ?? ""]`.
- `KnoxPanel({ subjectType, subjectId })`: latest assessment (tier chip, rationale, `KnoxClock` per clock, missing fields, Acknowledge button hidden once acknowledged with "Acknowledged by {name} at {time}"), `KnoxCard` per open card (summary, rationale, Approve / Dismiss with optional reason), drafts with a Copy button (`navigator.clipboard.writeText`, `{{child_name}}` replaced from the record's `childName` first token), "History" collapsible for earlier assessments.
- `KnoxBadge({ tier, href })`: `text-2xs` chip, tier-tinted with dark pairs, links to `href`.
- `/knox` page: `PageHeader` "Knox" with description "Incident triage: alerts, clocks and approvals"; four lists; when `?subject=` is present render `KnoxPanel` for it at the top. Nav item: `{ href: "/knox", label: "Knox", icon: ShieldAlert, section: "Operations", tooltip: "Incident triage: alerts, clocks and approvals", roles: ["owner","head_office","admin","member","eos"], core: ["owner","head_office","admin","member"] }`.

- [ ] **Step 1: Write the key test** asserting the hook module's exported `knoxKeys` helpers return arrays of strings only.
- [ ] **Step 2: Implement hooks, components, page, mounts, nav, page access.** Mount `KnoxPanel` inside `IncidentRow`'s `{expanded && (...)}` block. Badges in the complaint and staff-incident table rows use `useKnoxTiers(type, ids)` over `GET /api/knox/inbox?tiersFor=` (Task 14), one request per table.
- [ ] **Step 2b: Alert deep links land on the row.** `IncidentsPageContent` reads `?incident=<id>&knox=<assessmentId>`; `IncidentRow` accepts `defaultExpanded` and the page passes it for the matching id, then `scrollIntoView({ block: "center" })` once on mount. The URL params are the ones `recordLink` (Task 7) emits.
- [ ] **Step 3: Verify in the browser** (`npm run dev`): log a moderate incident via the form, expand the row, see the panel, acknowledge; open `/knox`.
- [ ] **Step 4: `npm run lint && npx tsc --noEmit`** → clean. **Step 5: Commit** `git commit -m "feat(knox): panel, cards, badges, inbox page and nav"`.

---

### Task 16: Morning briefing signal

**Files:**
- Modify: `src/lib/morning-briefing.ts` (`BriefingSignals`, `totalSignalCount`, `collectBriefingSignals`, `composeFallback`, the AI composer prompt), and the briefing card component that renders `signals` chips (find it with `grep -rl "expiringCertsOnRoster" src/components`).
- Test: extend `src/__tests__/lib/morning-briefing.test.ts` (create if absent).

**Interfaces:**
- `BriefingSignals.knox: { minorYesterday: { serviceName: string; count: number }[]; unacknowledgedAlerts: number; openCards: number; clocksDueWithin24h: { serviceName: string; kind: ClockKind; dueAt: string }[] }`.

- [ ] **Step 1: Tests**: `totalSignalCount` adds `unacknowledgedAlerts + openCards + clocksDueWithin24h.length` and ignores `minorYesterday`; `composeFallback` renders one line per non-empty knox field; member scope limits to their service.
- [ ] **Step 2: Run → FAIL. Step 3: Implement** (queries on `TriageAssessment`/`TriageAlert`/`PendingAction`, scoped like `expiringCertsOnRoster`). **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `git commit -m "feat(knox): morning briefing signal"`.

---

### Task 17: Env, docs, integration test, verification, PR

**Files:**
- Modify: `.env.example`, `src/lib/env-validation.ts` (document `TEAMS_KNOX_WEBHOOK_URL` as optional in the file's comment block or optional list), `CLAUDE.md`
- Create: `tests/integration/knox-triage.test.ts`

- [ ] **Step 1: Integration test** (real local DB via the integration setup): POST `/api/incidents` handler with `ambulanceCalled: true` as a `member` of `svc-1` with Knox `enabled: true, shadowMode: false` (write the org setting first) and `TEAMS_WEBHOOK_URL` unset → a `TriageJob` done, a `TriageAssessment` tier serious with `alerted: true`, push `TriageAlert` rows for the director and state manager, a Teams row with `delivered: false`; call the ack route → `acknowledgedAt` on every row; call `runEscalationSweep(now + 20 min)` → `escalated: 0`.

- [ ] **Step 2: Run** `npm run test:integration -- knox-triage` → PASS.

- [ ] **Step 3: CLAUDE.md** — add a `## Knox incident triage (2026-10-21)` section: what it is, the write rule (cards only, helpers shared with the forms, guard test), the OWNA ratchet, settings location, the tick cron, shadow-mode rollout, and "new register writer → call `triggerTriage` and add it to `knox-guards.test.ts`".

- [ ] **Step 4: Full verification**

Run: `npm run lint && npm test && npx tsc --noEmit && npm run build`
Expected: lint zero errors (warnings allowed), all tests pass, build succeeds.

- [ ] **Step 5: Commit and open the PR**

```bash
git add -A
git commit -m "docs(knox): CLAUDE.md section, env example, integration test"
git push -u origin feat/knox-incident-triage
gh pr create --title "Knox: live incident triage agent (slice 1)" --body-file <(printf '%s\n' "Spec: docs/superpowers/specs/2026-10-20-knox-incident-triage-design.md" "Plan: docs/superpowers/plans/2026-10-20-knox-incident-triage.md" "" "Ships OFF (knox.enabled=false, shadowMode=true). Needs TEAMS_KNOX_WEBHOOK_URL (optional) and the migration." "" "🤖 Generated with [Claude Code](https://claude.com/claude-code)")
```

Deploy notes for the PR body: migration applies via `scripts/vercel-build.sh` on production; enable Knox in Settings → Organisation after merge; shadow for two weeks per spec §8; test-day checklist in spec §7.
