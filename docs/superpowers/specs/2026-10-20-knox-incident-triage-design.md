# Knox — Live Incident Triage Agent — Design

**Date:** 2026-10-20
**Status:** Approved in brainstorming, awaiting written-spec review
**Branch:** `feat/knox-incident-triage` (off `origin/main` @ `5b63502d`)
**Scope:** Slice 1 of the Amana operations agent ("Knox"). Live triage only.

---

## 1. Problem

The dashboard holds three incident registers with the regulatory fields already
modelled: `IncidentRecord` (Reg 86 parent-notification clock, Reg 176 regulator
clock), `ComplaintRecord` (s.174(2)(b) 24-hour deadline, stamped at intake) and
`StaffIncidentReport` (SafeWork flag).

Records enter by three paths — the dashboard forms, the OWNA sync
(`/api/cron/owna-sync`, every 30 min in centre hours) and the cowork API
(`/api/cowork/operations/incidents`). **None of the three notifies anyone when a
serious or reportable record lands.** The weekly `incident-digest` email is
paused behind the service-alerts pause flag, and `auto-escalation` covers todos,
rocks and issues only. A serious incident can sit unseen until someone opens the
register.

Knox closes that gap: every new or materially changed record is assessed within
minutes, the right people are alerted on a defined ladder, the regulatory clocks
are computed and shown, and every follow-on change to a record is proposed as a
card a named human approves.

## 2. Decisions made in brainstorming

| # | Decision | Why |
|---|---|---|
| 1 | **Live triage first.** Follow-through (chasing to closure) and reporting are later slices. | Alerts are the foundation the other two build on. |
| 2 | **Notify and propose.** Staff alerts are automatic. Every write to a register is a `PendingAction` card a human approves. Knox never writes to a register itself. | Matches the "model proposes, human commits" rule in `2026-09-26-amana-ai-second-brain-design.md` §3.7. |
| 3 | **Push + Teams only. No SMS at any tier.** | Owner decision 2026-10-20. |
| 4 | **Accept the 30-minute OWNA lag.** No extra OWNA poll. Staff are told: serious incidents go in the dashboard first, OWNA second. | Keeps OWNA load and cron count flat. |
| 5 | **Approach 1:** triage jobs inside the dashboard, rules first then Claude, immediate trigger on dashboard writes plus a 5-minute sweep. No workflow runtime for the first agent. | Fits a repo that runs on crons + Prisma; revisit a durable runtime when there is a second agent. |
| 6 | **Rules decide the tier and send the alerts. The model never gates an alert.** | A model outage or timeout can never silence a serious incident. |
| 7 | **The model can raise a human's attention a tier, never lower it.** Knox never proposes reducing severity. | One-way ratchet. |
| 8 | **Drafts are shown, not gated.** Parent notice and regulator pack are attached to the assessment with a copy button. Cards exist only for writes. | The family call and the NQA ITS lodgement happen outside the dashboard. |
| 9 | **Shadow mode first.** Two weeks assessing and recording with no alerts and no cards, then one state, then all. | Alert fatigue is the real risk. |

## 3. Architecture

### 3.1 Scope and triggers

**Subjects:** `IncidentRecord`, `ComplaintRecord`, `StaffIncidentReport`.
`IllnessRecord` is out of scope.

**Trigger events** (each enqueues a `TriageJob`):

| Subject | On create | On update when any of these change |
|---|---|---|
| IncidentRecord | always | `severity`, `incidentType`, `reportableToAuthority`, `seriousIncidentCategory`, `ambulanceCalled`, `medicalPersonnelContacted` (empty → non-empty) |
| ComplaintRecord | always | `notifiable`, `notifiableReason`, `category`, `status → escalated` |
| StaffIncidentReport | always | — (no per-record update route exists on `main`; update triggers are added when one is) |

Tier ordering for every comparison in this spec is `minor < moderate < serious`.

A `deleted: true` incident is never triaged; a job whose subject is deleted or
missing finishes as `skipped`.

### 3.2 Data model

```prisma
enum TriageSubjectType {
  incident
  complaint
  staff_incident
}

enum TriageJobStatus {
  pending
  running
  done
  failed
  skipped
}

enum TriageTier {
  minor
  moderate
  serious
}

model TriageJob {
  id           String            @id @default(cuid())
  subjectType  TriageSubjectType
  subjectId    String
  serviceId    String
  /// created | updated | sweep
  reason       String
  status       TriageJobStatus   @default(pending)
  attempts     Int               @default(0)
  lastError    String?           @db.Text
  scheduledFor DateTime          @default(now())
  startedAt    DateTime?
  finishedAt   DateTime?
  createdAt    DateTime          @default(now())
  updatedAt    DateTime          @updatedAt

  assessment TriageAssessment?

  @@index([status, scheduledFor])
  @@index([subjectType, subjectId])
}

model TriageAssessment {
  id          String            @id @default(cuid())
  jobId       String            @unique
  job         TriageJob         @relation(fields: [jobId], references: [id], onDelete: Cascade)
  subjectType TriageSubjectType
  subjectId   String
  serviceId   String
  service     Service           @relation("ServiceTriageAssessments", fields: [serviceId], references: [id], onDelete: Cascade)

  // ── Rules layer (always present) ──
  tier     TriageTier
  /// Rule ids that fired, e.g. ["ambulance_called", "reportable_flag"].
  ruleHits String[]
  /// [{ kind: "parent_24h" | "regulator" | "complaint_regulator", dueAt, basis, dueDescription }]
  clocks   Json
  /// True when alerts were actually dispatched for this assessment
  /// (false in shadow mode, or when suppressed as a non-raising re-triage).
  alerted  Boolean @default(false)

  // ── Model layer (null when rules_only) ──
  /// rules_only | rules_and_model
  source                 String
  modelId                String?
  /// agrees | understated | unsure
  severityOpinion        String?
  rationale              String?  @db.Text
  missingFields          String[]
  suggestedSeverity      String?
  suggestedCategory      String?
  parentNoticeDraft      String?  @db.Text
  regulatorPackDraft     String?  @db.Text
  aiUsageId              String?
  modelError             String?

  alerts         TriageAlert[]
  pendingActions PendingAction[]

  createdAt DateTime @default(now())

  @@index([subjectType, subjectId, createdAt])
  @@index([serviceId, createdAt])
  @@index([tier, createdAt])
}

model TriageAlert {
  id               String           @id @default(cuid())
  assessmentId     String
  assessment       TriageAssessment @relation(fields: [assessmentId], references: [id], onDelete: Cascade)
  serviceId        String
  tier             TriageTier
  recipientUserId  String?
  recipient        User?            @relation("TriageAlertRecipient", fields: [recipientUserId], references: [id], onDelete: SetNull)
  /// push | teams
  channel          String
  /// 0 = initial, 1 = first escalation, 2 = second escalation
  escalationLevel  Int              @default(0)
  sentAt           DateTime         @default(now())
  /// Channel-level delivery result (webhook 2xx / notifyUsers count > 0).
  delivered        Boolean          @default(false)
  acknowledgedAt   DateTime?
  acknowledgedById String?
  acknowledgedBy   User?            @relation("TriageAlertAcknowledger", fields: [acknowledgedById], references: [id], onDelete: SetNull)

  @@index([assessmentId])
  @@index([acknowledgedAt, tier, sentAt])
  @@index([recipientUserId, acknowledgedAt])
}

/// First specified in 2026-09-26-amana-ai-second-brain-design.md §3.7 for the
/// chat assistant (unmerged branch feat/amana-ai-second-brain-spec). Built here
/// first. Two additions for Knox: `proposedBy` and `assessmentId`; `turnId` is
/// optional because Knox has no chat turn. The assistant slice reuses this model
/// unchanged.
model PendingAction {
  id           String            @id @default(cuid())
  /// knox | assistant
  proposedBy   String
  /// The user the card is addressed to (null = anyone with scope may act).
  userId       String?
  serviceId    String?
  /// set_severity | mark_reportable | mark_notifiable | create_followup_todos
  /// (assistant kinds added later: reflection | hazard | leave | incident)
  kind         String
  subjectType  TriageSubjectType?
  subjectId    String?
  /// Already validated against the target schema at propose time.
  payload      Json
  /// Human-readable "from → to" shown on the card.
  summary      String
  rationale    String?           @db.Text
  turnId       String?
  assessmentId String?
  assessment   TriageAssessment? @relation(fields: [assessmentId], references: [id], onDelete: SetNull)
  expiresAt    DateTime
  committedAt  DateTime?
  committedById String?
  committedBy  User?             @relation("PendingActionCommitter", fields: [committedById], references: [id], onDelete: SetNull)
  dismissedAt  DateTime?
  dismissedById String?
  dismissedBy  User?             @relation("PendingActionDismisser", fields: [dismissedById], references: [id], onDelete: SetNull)
  dismissReason String?
  resultId     String?
  createdAt    DateTime          @default(now())

  @@index([serviceId, createdAt])
  @@index([subjectType, subjectId])
  @@index([expiresAt])
}
```

**Other schema changes**

- `OrgSettings.knoxEnabled Boolean @default(false)` and
  `OrgSettings.knoxShadowMode Boolean @default(true)`.
- `AiUsage.userId` becomes optional (`String?`, and its `user` relation
  `User?`) so Knox can log usage with `section: "knox"` and no user. If `feat/amana-ai-second-brain-spec` lands
  first with the same relaxation, the migration is a no-op and the usage
  route's "System" bucket already covers it.
- Back-relations added on `Service` and `User` for the relations above.
- Migration is hand-checked with `prisma migrate diff` before commit (the
  repo's CLAUDE.md notes expected index noise).

### 3.3 Intake

One helper, `src/lib/knox/enqueue.ts`:

```ts
enqueueTriage(db, { subjectType, subjectId, serviceId, reason }): Promise<string | null>
```

- Swallow-and-log. It never throws into the caller; an incident save must
  return 201 even if Knox is down.
- Dedupe: if a `pending` job exists for the same subject, return its id and do
  nothing. A `running` job does not block a new `pending` one (the edit may
  have arrived after the running job read the record).
- Returns the job id so dashboard routes can run it immediately.

**Writers that call it** (and the guard test enumerates exactly these files):

| Writer | Trigger | Immediate run? |
|---|---|---|
| `POST /api/incidents` | create | yes, via `runAfter(() => runTriageJob(jobId))` |
| `PATCH /api/incidents/[id]` | update, only if a trigger field changed | yes |
| `POST /api/compliance/complaints` | create | yes |
| `PATCH /api/compliance/complaints/[id]` | update, only if a trigger field changed | yes |
| `POST /api/services/[id]/staff-incidents` | create | yes |
| `POST /api/cowork/operations/incidents` | create | yes |
| `src/lib/owna-sync.ts` incidents block | create; update when mapped severity/type changed | no — the sweep picks them up |

The OWNA block enqueues after its batched write, one job per new/changed id,
using `createMany` with the dedupe query done once up front.

"Trigger field changed" is decided in the route by comparing the pre-update
row to the parsed patch, not by diffing after the fact.

### 3.4 Sweep cron

`GET /api/cron/knox-tick` — `vercel.json` schedule `*/5 * * * *`, every day.
No hours gate: a tick with nothing pending is one cheap query, and an incident
logged at 20:00 still needs its escalation ladder to run. (A UTC hour range
cannot express Sydney centre hours across DST without two entries, and a
code-side gate would only save that one query.) Auth `verifyCronSecret`;
lock `acquireCronLock("knox-tick", <5-minute period>)` — see §3.4a.
`maxDuration = 300`.

**§3.4a Lock.** `CronPeriod` in `cron-guard.ts` has `15min` as its finest
grain. A `5min` period is added to `getPeriodKey` (floor of the minute to a
multiple of five, same formatting as `15min`), with a table test. The lock
key is `knox-tick`. Because the worker's atomic claim (§3.5 step 1) already
prevents double-processing, the lock's job is only to keep two overlapping
ticks from both scanning; a missed tick is harmless.

Order inside a tick:

1. If `knoxEnabled` is false → return `{ skipped: true }` without touching
   jobs. (Jobs still accumulate; enabling Knox later triages the backlog at
   `reason: "sweep"` with `alerted: false` forced for anything older than
   24 h, so a backlog never pings anyone.)
2. **Job sweep:** claim up to 25 `pending` jobs with `scheduledFor <= now`,
   oldest first; run each with per-job error isolation.
3. **Escalation sweep** (§3.8).

### 3.5 Worker — `runTriageJob(jobId)`

`src/lib/knox/worker.ts`. Steps, in order:

1. **Claim atomically.** `updateMany({ where: { id, status: "pending" }, data: { status: "running", startedAt, attempts: { increment: 1 } } })`; if `count === 0`, return (another runner has it).
2. **Load the subject** with service (name, state, managerId) and, for incidents, the child's first name only. Missing/deleted → `skipped`.
3. **Rules** (§3.6) → `tier`, `ruleHits`, `clocks`.
4. **Decide whether to alert.** Alert unless (a) shadow mode, or (b) a prior assessment for this subject in the last 24 h has `tier >= this tier` and `alerted: true`. Record the decision on `assessment.alerted`.
5. **Dispatch alerts** (§3.7) if alerting. This step runs before the model and does not await it.
6. **Model** (§3.9). 20-second timeout via `AbortSignal.timeout`. On any failure: `source: "rules_only"`, `modelError` set, continue.
7. **Second safety net.** If rules said `minor` and the model says `understated` with `suggestedSeverity ∈ {serious, reportable}`, dispatch a **moderate** push to the Director (not serious — the human decides) and mark `alerted: true`.
8. **Cards** (§3.10), unless shadow mode.
9. Write `TriageAssessment` (steps 3–8 accumulate into one create inside a transaction with the job update to `done`).
10. On exception anywhere after claim: `attempts < 3` → `status: pending`, `scheduledFor = now + 2^attempts minutes`, `lastError`; else `status: failed` and one Teams ops card ("Knox could not assess …") to the Knox channel.

Model usage is logged to `AiUsage` (`section: "knox"`, `metadata: { assessmentId, subjectType, subjectId, serviceId }`) and linked via `aiUsageId`.

### 3.6 Rules and clocks — `src/lib/knox/rules.ts`

Pure functions, no I/O, table-tested.

**Tier rules** (first matching row wins, evaluated serious → moderate):

| Rule id | Subject | Condition | Tier |
|---|---|---|---|
| `ambulance_called` | incident | `ambulanceCalled` | serious |
| `missing_child` | incident | `incidentType === "missing_child"` | serious |
| `stated_serious` | incident | `severity ∈ {serious, reportable}` | serious |
| `reportable_flag` | incident | `reportableToAuthority` or `seriousIncidentCategory` set | serious |
| `complaint_notifiable` | complaint | `notifiable` | serious |
| `complaint_escalated` | complaint | `status === "escalated"` | serious |
| `staff_notifiable` | staff_incident | `severity ∈ {serious, notifiable}` or `reportableToAuthority` | serious |
| `medical_contacted` | incident | `medicalPersonnelContacted` non-empty | moderate |
| `medication_error` | incident | `incidentType === "medication_error"` | moderate |
| `stated_moderate` | incident | `severity === "moderate"` | moderate |
| `complaint_sensitive` | complaint | `category ∈ {child_safety, supervision, staff_conduct}` | moderate |
| `staff_moderate` | staff_incident | `severity === "moderate"` | moderate |
| — | any | nothing matched | minor |

`ruleHits` records **every** matching rule, not just the first, so the card
and the Teams message can say why.

**Clocks:**

| kind | Subject | dueAt | basis |
|---|---|---|---|
| `parent_24h` | incident, when `!parentNotified` | `incidentDate + 24h` | Reg 86 |
| `regulator` | incident, when `reportableToAuthority` | `(becameAwareAt ?? createdAt) + window(seriousIncidentCategory)` | Reg 176(2)(a) |
| `complaint_regulator` | complaint, when `notifiable && !regulatorNotifiedAt` | `notificationDueAt` (already stamped) | s.174(2)(b) |

`window(category)` is a single exported map in `rules.ts`, default 24 h. The
7-day categories are confirmed against Reg 175–176 and the schema comment on
`IncidentRecord.seriousIncidentCategory` during planning and recorded in that
map with a citation comment — the spec does not guess the list. Clocks already
past due are still emitted with `overdue: true`.

### 3.7 Recipients and alert dispatch — `src/lib/knox/recipients.ts`, `src/lib/knox/alerts.ts`

**Recipient resolution per service** (deduplicated, active users only):

- **Director of Service:** `Service.managerId` → else active
  `UserServiceMembership` whose `roleAtService` matches `/director/i` → else
  users with `role: "member"` and `serviceId === service.id`.
- **State Manager:** `role: "head_office"` with `state` equal to
  `service.state` (case-insensitive) → else all `head_office`.
- **Owners:** `role: "owner"`.
- No director resolved → the State Managers take level 0 and a one-line ops
  card is posted to the Knox Teams channel ("No Director of Service configured
  for {service}").

**Dispatch table:**

| Tier | Level 0 | Level 1 | Level 2 |
|---|---|---|---|
| minor | none (morning briefing only) | — | — |
| moderate | push → Director | after **60 min**: push → State Manager | — |
| serious | push → Director + State Manager; Teams card → Knox channel | after **15 min**: Teams card mentioning Owners + push → Owners | after **30 min**: Teams card mentioning Owners again, then stop |

- **Push** = `notifyUsers(db, userIds, { type: "knox_alert", title, body, link })`.
  `knox_alert` is added to `notification-types.ts`. `link` is the record's
  detail page with `?knox=<assessmentId>` so the panel scrolls into view.
- **Teams** = `sendTeamsNotification` extended with an optional `webhookUrl`
  override and an optional `mentions: { email, name }[]`. Knox passes
  `process.env.TEAMS_KNOX_WEBHOOK_URL ?? process.env.TEAMS_WEBHOOK_URL`.
  Mentions are emitted as `msteams.entities` on the adaptive card with
  `<at>Name</at>` in the body; if the Power Automate flow strips entities, the
  fallback is the bold name (test-day check, §7).
- Card content: tier colour band, service, subject type, when, the record's
  key facts, each clock with its due time, `ruleHits` in plain words, the
  model's one-line rationale when present, and two OpenUrl actions:
  **Acknowledge** (deep link, same as push) and **Open record**.
- One `TriageAlert` row per recipient per channel per level. Teams rows have
  `recipientUserId: null`.
- Knox ignores `skipIfServiceAlertsPaused` — that flag was built for digest
  emails.

### 3.8 Acknowledgement and escalation

- `POST /api/knox/assessments/[id]/ack` — `withApiAuth`, roles
  `owner | head_office | admin | member`, centre scope enforced via
  `getCentreScope`. Sets `acknowledgedAt/By` on **every** alert row of the
  assessment. Idempotent (200 on repeat). Writes an `ActivityLog`
  (`action: "knox.acknowledged"`).
- Opening a notification or marking it read does **not** acknowledge.
- **Escalation sweep** (inside `knox-tick`): for each assessment with
  `alerted: true`, no acknowledgement, and whose latest level is below the
  table's maximum for its tier, if `now - latestLevel.sentAt >= threshold`,
  dispatch the next level. Thresholds: moderate 60 min; serious 15 min then
  30 min cumulative. The sweep is idempotent because it only ever creates the
  next integer level.
- Acknowledgement by any recipient at any level stops further escalation.

### 3.9 Model call — `src/lib/knox/assess.ts`

Through `generateStructured` (`src/lib/ai-provider`) with the default Anthropic
model. Never the Groq bulk model: this is judgment over sensitive records.

**System prompt:** Knox persona (Amana OSHC operations, Australian English,
National Law / Regulations 86, 87, 175, 176, s.174), the tier definitions,
and the output contract. Lives in `src/lib/knox/prompt.ts`.

**Input context:** service name and state; subject type; all record fields
**except** the child's surname, contact details and any free-text witness
names (witness text is passed with names replaced by `[name]` via a simple
capitalised-word heuristic — it is an aid, not a guarantee, and matches what
the existing assistant tools already send); child first name and stamped age;
the rules result (tier, ruleHits, clocks) so the model critiques rather than
recomputes.

**Output schema (Zod):**

```ts
{
  severityOpinion: "agrees" | "understated" | "unsure",
  rationale: string (≤ 80 words),
  missingFields: string[],              // field labels from a fixed enum list
  suggestedSeverity?: "moderate" | "serious" | "reportable",
  suggestedCategory?: SeriousIncidentCategory,
  followUpTodos: { title: string; dueInDays: 1 | 3 | 7 }[] (≤ 4),
  parentNoticeDraft?: string,           // serious + moderate only; uses {{child_name}}
  regulatorPackDraft?: string,          // serious only; NQA ITS field headings
}
```

`suggestedSeverity` lower than the stated severity is discarded by the
executor (decision 7). Drafts carry `{{child_name}}`, which the UI fills at
render time from the record; the surname never leaves the database.

### 3.10 Approval cards and the write path — `src/lib/knox/actions.ts`

**Card kinds** (all `proposedBy: "knox"`, `expiresAt = now + 72h`):

| kind | Subject | Proposed when | Payload | Commit helper |
|---|---|---|---|---|
| `set_severity` | incident | model `understated` and `suggestedSeverity` > stated | `{ severity }` | `updateIncidentRecord` |
| `mark_reportable` | incident | tier serious, `!reportableToAuthority`, model gives a category | `{ reportableToAuthority: true, seriousIncidentCategory, becameAwareAt }` | `updateIncidentRecord` |
| `mark_notifiable` | complaint | rules `complaint_sensitive` or model `understated`, `!notifiable` | `{ notifiable: true, notifiableReason, becameAwareAt }` | `updateComplaintRecord` |
| `create_followup_todos` | any | model returned ≥ 1 todo | `{ items: [{ title, dueInDays }] }` | `createTodosForService` (assignee = Director, falls back to State Manager) |

Staff incidents get `create_followup_todos` only in this slice — there is no
per-record update route to share a helper with.

**Helpers are extracted, not duplicated.** `updateIncidentRecord(db, id,
patch, actorId)` is pulled out of `PATCH /api/incidents/[id]` (including its
Zod schema) and `updateComplaintRecord` out of `PATCH
/api/compliance/complaints/[id]` (including the notifiable-reason rule and the
`notificationDueAt` stamp). Both routes then call the helper. Form and Knox
share one write path; the guard test asserts neither route calls
`prisma.<model>.update` directly.

**Routes:**

- `GET /api/knox/actions?serviceId=&status=` — list, centre-scoped.
- `POST /api/knox/actions/[id]/approve` — 404 if not visible to the caller's
  scope (no existence leak); 410 if expired, committed or dismissed;
  re-validates `payload` with the helper's Zod schema; calls the helper;
  stamps `committedAt/By/resultId`; `ActivityLog`
  (`action: "knox.approved"`, `details: { kind, summary, assessmentId }`).
  A card's write re-enqueues triage like any other update, which is correct:
  marking reportable should re-assess and, if the tier rose, alert.
- `POST /api/knox/actions/[id]/dismiss` — body `{ reason?: string }`, same
  visibility rules, `ActivityLog` (`knox.dismissed`).
- Roles for all three: `owner | head_office | admin | member`, scoped with
  `getCentreScope`.

Rate limits and request IDs come from `withApiAuth` as everywhere else.

## 4. UI

- **Knox inbox** — `src/app/(dashboard)/knox/page.tsx`, nav item in the
  Operations section, `core: ["owner", "head_office", "admin", "member"]`,
  badge = unacknowledged alerts + open cards in scope. Four lists, each a
  `useQuery` with `retry: 2`, `staleTime: 30_000`, primitive query keys:
  awaiting acknowledgement, pending cards, recent assessments (7 days),
  failed jobs (admin roles only). Every mutation has an `onError` destructive
  toast.
- **Knox panel** — `src/components/knox/KnoxPanel.tsx`, mounted on the
  incident, complaint and staff-incident detail views. Shows the latest
  assessment: tier chip, rationale, clocks as countdowns (overdue in the
  destructive token), missing fields, **Acknowledge** (hidden once
  acknowledged, showing who/when), cards inline with Approve / Dismiss, and
  the drafts with a copy button. Earlier assessments collapse under "History".
- **Voice:** "Knox suggests…", "Knox flagged…". A small `Knox` badge token.
  No avatar, no chat surface.
- **Settings → Organisation:** two toggles, Knox enabled and Shadow mode,
  owner/admin only, with a sentence explaining shadow mode.
- Design tokens only, `Button` component, `PageHeader`, `text-2xs` for chips,
  per the repo's design system rules.

## 5. Morning briefing

`collectBriefingSignals` gains a `knox` signal for users in `BRIEFING_ROLES`
within their centre scope: `minorYesterday: { serviceName, count }[]`,
`unacknowledgedAlerts`, `openCards`, `clocksDueWithin24h: { serviceName,
kind, dueAt }[]`. `composeFallback` and the AI composer prompt both render it.
`totalSignalCount` counts unacknowledged alerts, open cards and due clocks
(not minor counts). This is the only surface for the minor tier.

## 6. Settings, env and config

- `TEAMS_KNOX_WEBHOOK_URL` (new, optional; falls back to `TEAMS_WEBHOOK_URL`).
  Added to `env-validation.ts` as optional and to `.env.example`.
- `vercel.json`: one new cron entry (§3.4).
- `OrgSettings.knoxEnabled` / `knoxShadowMode` (§3.2). Defaults ship Knox off
  and shadow on.
- No new model key; the provider wrapper's existing Anthropic configuration is
  used.

## 7. Testing

Vitest unit tests under `src/__tests__/lib/knox/`:

- `rules.test.ts` — table test over every rule id, tier boundaries, multiple
  hits, every clock kind including overdue and the category window map.
- `recipients.test.ts` — each fallback branch, deduplication, inactive users
  excluded, no-director ops note.
- `enqueue.test.ts` — pending dedupe, running does not block, swallow on DB
  error.
- `worker.test.ts` — atomic claim (second claim no-ops), shadow mode records
  but `alerted: false`, silent re-triage, raising re-triage alerts, model
  timeout → `rules_only` with alerts already sent, second safety net, retry
  back-off then `failed` + ops card, suggested-lower-severity discarded.
- `escalation.test.ts` — thresholds per tier, idempotent levels, stops at max,
  acknowledgement stops it.
- `actions.test.ts` — card generation per kind and condition, 72-hour expiry,
  staff incidents only get todos.
- `assess.test.ts` — Zod schema accepts/rejects fixtures; surname and contact
  fields never appear in the prompt string.

Route tests under `src/__tests__/api/knox/` for ack, actions list, approve,
dismiss, and `knox-tick`: 401, 403 (out of scope), 400, 404, 410, happy path,
cron lock skip. Plus `POST /api/incidents` returns 201 when `enqueueTriage`
rejects.

Guard tests (`src/__tests__/lib/knox-guards.test.ts`, grep-based like the
repo's email-bypass guard): every writer in §3.3 imports and calls
`enqueueTriage`; the two PATCH routes call the shared helpers and not
`prisma.*.update` directly.

One integration test (`npm run test:integration`): incident POST → job →
assessment → alert rows → ack → tick → no new level.

Manual test-day checklist: Teams card renders in the Knox channel; mentions
resolve through the Power Automate flow (else fallback confirmed); push lands
on a subscribed phone; Acknowledge deep link opens the panel.

Mocks use input-based `mockImplementation`, never `mockResolvedValueOnce`
chains; in-memory state cleared in `beforeEach`.

## 8. Rollout

1. Merge with `knoxEnabled = false`. Migration applies; nothing runs.
2. Enable with `knoxShadowMode = true` in production. Two weeks. Each Friday,
   compare Knox tiers with what humans did on the same records; adjust the
   rules table and the category window map by PR.
3. Shadow off for one state (State Managers of that state are told first),
   then all.
4. Post-launch: the test-day checklist, then watch `failed` jobs and
   `AiUsage` for the first week.

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Alert fatigue | Minor never pings; silent re-triage; shadow calibration; dedupe of pending jobs. |
| A rules false negative on a genuinely serious record | Model second net raises a moderate push; shadow review catches patterns; rules table is a PR away. |
| Model outage or slowness | Alerts dispatch before the model; 20 s timeout; rules-only assessments are first-class. |
| Double alerts from the sweep and the immediate run | Atomic claim on `TriageJob.status`. |
| OWNA lag | Accepted (decision 4); staff instruction documented in the staff handbook entry. |
| PII to the model | Surname and contact fields excluded; `{{child_name}}` placeholder; same provider and handling as the existing assistant. |
| Teams mentions stripped by the flow | Bold-name fallback; verified on test day. |
| Cron count | One tick does both sweeps. |

## 10. Out of scope (this slice)

- Follow-through: chasing open clocks to closure, nagging on overdue parent
  notification or regulator lodgement, recording the NQA ITS reference. (Slice 2.)
- Reporting: weekly and board incident narratives, trend detection. (Slice 3;
  `incident-trends` and `incident-digest` crons untouched.)
- Illness records; medication administration records.
- Any outbound message to a family or the regulator.
- Voice, chat, or avatar surfaces for Knox.
- A durable workflow runtime.

## 11. Relationship to the Amana AI second-brain spec

`2026-09-26-amana-ai-second-brain-design.md` (branch
`feat/amana-ai-second-brain-spec`, unmerged) specifies `PendingAction` for the
chat assistant's write contract. Knox builds that model first with two
additive fields (§3.2). When the assistant slice lands it reuses the table and
the approve/dismiss semantics; its 10-minute expiry is a per-`proposedBy`
default, not a schema constraint. The `AiUsage.userId` relaxation is shared
the same way. Neither branch blocks the other.

## 12. File structure

```
prisma/schema.prisma                          TriageJob, TriageAssessment, TriageAlert, PendingAction, OrgSettings, AiUsage
prisma/migrations/<ts>_knox_incident_triage/  hand-checked migration
src/lib/knox/
  enqueue.ts        enqueueTriage
  rules.ts          tier rules, clocks, category window map (pure)
  recipients.ts     resolveRecipients(serviceId)
  alerts.ts         dispatchLevel, buildTeamsCard, escalation sweep
  assess.ts         model call + Zod schema + PII filter
  prompt.ts         Knox system prompt
  actions.ts        card generation, approve/dismiss executors
  worker.ts         runTriageJob, sweepJobs
  index.ts          public surface
src/lib/incidents/update-incident-record.ts   extracted helper + schema
src/lib/complaints/update-complaint-record.ts extracted helper + schema
src/lib/teams-notify.ts                        webhookUrl override, mentions
src/lib/notification-types.ts                  knox_alert
src/lib/morning-briefing.ts                    knox signal
src/app/api/cron/knox-tick/route.ts
src/app/api/knox/assessments/[id]/ack/route.ts
src/app/api/knox/actions/route.ts
src/app/api/knox/actions/[id]/approve/route.ts
src/app/api/knox/actions/[id]/dismiss/route.ts
src/app/api/knox/inbox/route.ts                inbox lists
src/app/(dashboard)/knox/page.tsx
src/components/knox/KnoxPanel.tsx, KnoxCard.tsx, KnoxClock.tsx, KnoxBadge.tsx
src/hooks/useKnox.ts
src/lib/nav-config.ts                          Operations → Knox
src/app/(dashboard)/settings/…                 two toggles
vercel.json                                    knox-tick
.env.example, src/lib/env-validation.ts        TEAMS_KNOX_WEBHOOK_URL
src/__tests__/lib/knox/*, src/__tests__/api/knox/*, src/__tests__/lib/knox-guards.test.ts
CLAUDE.md                                      Knox section
```
