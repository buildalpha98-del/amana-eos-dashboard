# EOS Execution Layer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement spec `docs/superpowers/specs/2026-08-31-eos-execution-layer-design.md` — meeting series, scorecard watchdog, meeting insights, post-review digest, cascade reach, projects/todo completion. One PR on `feature/eos-execution-layer`.

**Architecture:** One additive migration (MeetingSeries, Meeting.seriesId, MeetingRecording.digestSentAt, Issue.measurableId, Project.rockId, Todo.completionNote); two crons; notification fan-outs on the `creative-request/notify.ts` createFor pattern; Intl-based Sydney wall-clock maths (no date lib).

**Environment rules:** identical to prior phases — migration SQL authored via offline schema-to-schema `migrate diff`; never touch the prod DB from local except explicitly-approved data scripts.

---

## Review amendments (binding)

1. **Task 8** Suspense precedent = `src/app/(dashboard)/todos/page.tsx` (Suspense-wrapped inner component + Skeleton fallback) — NOT services/[id] (that one has no boundary and only builds because it's a dynamic route). Add tests for the remind rate limit (3/hr) and `?tab=` behaviour. Cascade coverage is NET-NEW (communication.test.ts covers announcements only); the meeting-completion fan-out asserts in meetings.test.ts.
2. **Task 5** the existing-issue skip query MUST filter `deleted: false` (Issue soft-deletes leave status untouched — a deleted open policing issue would suppress re-raising forever). Test it.
3. **Task 9** `api/projects.test.ts` is net-new (full auth/validation/happy-path per house standards). Drop `_count` from `ProjectSummary` in the same commit as the route change; add `rockId` to `useUpdateProject`'s body type.
4. **Task 6** the page fetches `useMeetings({ limit: 100 })` — sufficient for 12 snapshot-bearing completed meetings; keep the strip's two visibility conditions (series exist AND meeting-role user) in Task 4.

## Task 1: Schema + migration

Modify `prisma/schema.prisma`: `MeetingSeries` model + `User.meetingSeries` back-relation (`"SeriesCreator"`); `Meeting.seriesId` (+index, `"SeriesMeetings"`); `MeetingRecording.digestSentAt DateTime?`; `Issue.measurableId` (+index, SetNull) + `Measurable.issues`; `Project.rockId` (+index, SetNull) + `Rock.projects`; `Todo.completionNote String? @db.Text`.

- [ ] Edit schema → offline `migrate diff` (git show HEAD baseline → scratchpad) → verify additive-only SQL → `prisma generate` → commit.

## Task 2: `src/lib/meeting-series.ts` (occurrence maths) — TESTS FIRST

```ts
export interface SeriesTiming { dayOfWeek: number; minuteOfDay: number; timezone: string }
export function nextOccurrence(s: SeriesTiming, from: Date): Date
export function sameLocalDayRange(occ: Date, timezone: string): { start: Date; end: Date }
```

Implementation approach: step forward from `from` in hour increments is fragile — instead compute per candidate calendar day: use `Intl.DateTimeFormat(en-AU, { timeZone, hour/minute/weekday/year/month/day, hourCycle: "h23" })` to get the zone's wall-clock parts for a UTC instant, and a `zonedTimeToUtc`-style inverse via the offset trick (`offset = utcTime - asUTCOfParts(partsInZone(utcTime))`, iterate twice for DST edges). Tests pin: pre-DST Tuesday 13:30 Sydney → 03:30Z; post-2026-10-04 → 02:30Z; `from` later same day rolls a week; `sameLocalDayRange` spans exactly Sydney midnight→midnight in UTC.

- [ ] Failing tests (`src/__tests__/lib/meeting-series.test.ts`) → implement → pass → commit.

## Task 3: Series API + cron — TESTS FIRST

- `src/app/api/meetings/series/route.ts` (GET any-auth list incl. `_count.meetings`; POST meeting-PATCH roles, Zod name/dayOfWeek 0-6/minuteOfDay 0-1439/timezone default/isLeadership/serviceIds/scorecardId/attendeeUserIds) and `series/[id]/route.ts` (PATCH same fields + `active`; DELETE hard, owner/admin).
- `POST /api/meetings` gains optional `seriesId` (validated exists) stamped on create.
- `src/app/api/cron/meeting-series/route.ts` per spec (window ≤7d, same-local-day idempotency via `sameLocalDayRange`, create meeting + active-filtered attendees + ActivityLog). `vercel.json` `"0 18 * * *"`.
- [ ] Tests: `api/meeting-series.test.ts` (roles, zod bounds) + `api/cron/meeting-series.test.ts` (auth/lock, creates in window, skips outside window, skips existing same-day ANY status, inactive skipped, attendee active filter) → implement → pass → commit.

## Task 4: Series UI

- `src/hooks/useMeetingSeries.ts` (list/create/update/delete, house mutation conventions).
- `StartMeetingDialog`: "Repeat weekly at this time" checkbox (only when schedule-later on); `onStart` gains `repeatWeekly: boolean`; `meetings/page.tsx` creates series first (derive dayOfWeek/minuteOfDay from the picked local datetime, tz "Australia/Sydney", name from meeting type, roster = selected attendees), then the meeting with `seriesId`; meeting-POST failure surfaces normally (orphan series harmless).
- `MeetingListView`: "Recurring" strip (series list, Every <Day> <HH:mm>, Pause/Resume via PATCH active, Delete w/ confirm, Button component) + ↻ marker on upcoming rows with `seriesId`.
- [ ] Typecheck + commit.

## Task 5: Scorecard watchdog — TESTS FIRST

- `org-settings-shared.ts`: top-level `eos` block w/ OBJECT-level `.default({})`, `ORG_SETTINGS_DEFAULTS.eos`, merge branch; Organisation settings UI field; extend `org-settings-shared.test.ts` (legacy parse, default 3, range, merge).
- `notification-types.ts`: register all four new types (do it once here for D/E too).
- `src/app/api/cron/scorecard-watchdog/route.ts` per spec (weekly measurables, latest-N entries all `onTrack===false`, skip <N entries, skip existing open/in_discussion issue with measurableId, create high/short_term issue w/ description of last N values vs goal, owner notification via inline createFor helper, ActivityLog). `vercel.json` `"30 21 * * 0"`.
- [ ] Tests `api/cron/scorecard-watchdog.test.ts` (trigger matrix per spec §Testing) → implement → pass → commit.

## Task 6: Meeting insights

- `src/components/meetings/MeetingInsightsCard.tsx`: last 12 snapshot-bearing completed meetings (oldest→newest), three hand-rolled SVG sparklines (rating, completionPct, issuesSolved count) + latest value + delta arrow; render in `MeetingListView` below stats when ≥3 snapshots. Tokens only; no recharts.
- [ ] Typecheck + commit.

## Task 7: Post-review digest — TESTS FIRST

- `src/lib/meeting-digest.ts`: `sendMeetingDigest(recordingId)` — guarded claim on `digestSentAt` (updateMany where null); load meeting + attendees + aiReview + cascades; email via `sendEmail` + `baseLayout`/`buttonHtml`/`escapeHtml` (recipients: active + !notificationsMuted); in-app createFor to ALL active attendees (muted included — in-app is kept by design), type `meeting_review_ready`; swallow-and-log wrapper `sendMeetingDigestSafe` for callers.
- Callers (fire-and-forget): deepgram webhook success path, regenerate success, janitor retry success.
- [ ] Tests `lib/meeting-digest.test.ts` (claim idempotency, recipient gating email vs in-app, escapes title, zero recipients no-op) + caller assertions added to existing webhook/regenerate/janitor tests → implement → pass → commit.

## Task 8: Cascade reach — TESTS FIRST

- `src/lib/cascade-notify.ts`: `notifyCascadePublished(db, {meetingTitle, count})` — ONE notification per active user per publish batch (`cascade_published`, link `/communication?tab=cascade`), createFor pattern.
- Call sites: `POST /api/communication/cascade` + meeting-completion split in `/api/meetings/[id]`.
- `POST /api/communication/cascade/[id]/remind` (owner/head_office/admin, rateLimit 3/hr): notify active users lacking an ack row (`cascade_reminder`); returns `{reminded}`.
- `/communication` page: `?tab=` read/write via `useSearchParams` + Suspense boundary (services/[id] precedent).
- `CascadeBoardTab`: admin gate includes head_office; expandable "Who's acknowledged" (names from `[id]` GET) + un-acked remainder (team minus ackers); "Remind un-acknowledged" button (admin, Button component).
- [ ] Tests: extend `api/communication.test.ts` (publish fan-out both sites, remind targets only non-ackers + role gate) → implement → pass → commit.

## Task 9: Projects & todo completion — TESTS FIRST

- `GET /api/projects`: replace per-project counts with one `todo.groupBy(["projectId","status"])`; drop `_count.todos` include; response shape unchanged.
- `Project.rockId`: create/PATCH schemas (validated rock exists when provided); `CreateProjectModal` + `ProjectDetailPanel` rock select (current-quarter rocks via `useRocks(getCurrentQuarter())` + "None"); chip display on card/panel.
- Auto-forward: in `PATCH /api/todos/[id]`, after update, if `todo.projectId` && new status ∈ {complete,in_progress} → `project.updateMany({ where: { id, status: "not_started" }, data: { status: "in_progress" } })`.
- "All done" banner in `ProjectDetailPanel` (100% && status!=complete → one-click mark complete).
- `Todo.completionNote`: `updateTodoSchema` + PATCH (clears when status set away from complete); `TodoDetailPanel` outcome textarea (visible while complete, saved on blur); 📝 title-marker in meeting To-Do Review for completed todos with a note.
- [ ] Tests: `api/projects.test.ts` extensions (groupBy derivation, rockId validation), todos tests (auto-forward guard, completionNote set/clear) → implement → pass → commit.

## Task 10: Verification + PR + post-merge script

- [ ] `npm test` green; `npm run build` clean; `npx eslint` on all touched files (no new issues vs baseline).
- [ ] Adversarial code-review subagent on the full diff; fix findings.
- [ ] Push; open PR to main (body: feature summary per spec, crons added, migration additive, post-merge step).
- [ ] AFTER merge+deploy: one-off script (explicit Jayden-approved prod write, same pattern as the meeting scheduling) — create Leadership series (Tue 13:30 Australia/Sydney, isLeadership, current 7-person roster, createdBy Jayden) and stamp meeting `cmth5ywwq00028nptww3x1gtw` with its id.
