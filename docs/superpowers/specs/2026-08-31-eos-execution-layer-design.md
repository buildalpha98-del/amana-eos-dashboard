# EOS Execution Layer — L10 Autopilot, Scorecard Watchdog, Cascade Reach, Projects & Todo Completion

**Date:** 2026-08-31
**Status:** Approved direction by Jayden ("spec batch 1 and lets go … also think of how we complete these tasks and how we cascade messages and how we manage projects and todos not only the meetings")
**Branch:** `feature/eos-execution-layer`

## Overview

The meetings layer (PRs #259/#260/#261) is live. This batch builds the
**execution layer around it** — the work between meetings:

- **A. Meeting series** — the weekly L10 schedules itself.
- **B. Scorecard watchdog** — an off-track measurable can't hide; it lands in IDS automatically.
- **C. Meeting insights** — the outcome snapshots become a trend view.
- **D. Post-review digest** — attendees get the AI review + cascades by email; nothing dies in a tab nobody opens.
- **E. Cascade reach & accountability** — cascades notify people and un-acknowledgers are visible/remindable.
- **F. Projects & todo completion** — projects link to rocks, progress computes cheaply, status moves itself forward, and completing a todo can carry an outcome note.

One additive migration; two new crons; ships as ONE PR (each piece is small and
they share schema/plumbing).

### Non-goals (YAGNI)

- No configurable agenda sections (post-Tuesday batch).
- No cascade audience targeting model (cascades stay org-wide; `Announcement`
  already covers targeted comms).
- No todo comment threads (completion note only).
- No auto-completing projects (auto-forward to `in_progress` only — a human
  declares done).
- No staff web-push (in-app + email only; push stays parent-facing).
- No per-section meeting timing analytics.

---

## A. Meeting series (recurring L10)

### Schema

```prisma
/// Recurring meeting template (Phase: execution layer, 2026-08-31).
/// A daily cron materialises the next occurrence as a `scheduled` Meeting
/// (which the morning-briefing cron then auto-preps on the day).
model MeetingSeries {
  id              String   @id @default(cuid())
  name            String   // e.g. "Leadership L10"
  /// 0=Sunday … 6=Saturday, in the series' local timezone
  dayOfWeek       Int
  /// Minutes from local midnight (13:30 → 810)
  minuteOfDay     Int
  /// IANA zone the wall-clock time is anchored to (DST-safe)
  timezone        String   @default("Australia/Sydney")
  isLeadership    Boolean  @default(false)
  serviceIds      String[]
  scorecardId     String?
  attendeeUserIds String[]
  active          Boolean  @default(true)
  createdById     String?
  createdBy       User?    @relation("SeriesCreator", fields: [createdById], references: [id], onDelete: SetNull)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  meetings Meeting[] @relation("SeriesMeetings")
  @@index([active])
}

model Meeting {
  // new:
  seriesId String?
  series   MeetingSeries? @relation("SeriesMeetings", fields: [seriesId], references: [id], onDelete: SetNull)
  @@index([seriesId])
}
```

### Occurrence maths — `src/lib/meeting-series.ts`

`nextOccurrence(series, from: Date): Date` — the next wall-clock
(dayOfWeek, minuteOfDay) in `series.timezone` strictly after `from`, returned
as a UTC `Date`. Implemented with `Intl.DateTimeFormat(timeZone)` part
extraction (no date lib in the repo); MUST be unit-tested across the
2026-10-04 AEST→AEDT transition (a 13:30 Sydney meeting is 03:30Z before DST,
02:30Z after).

### Cron — `/api/cron/meeting-series` (daily, `"0 18 * * *"` ≈ 4–5am Sydney)

Standard cron shape (CRON_SECRET + `acquireCronLock("meeting-series",
"daily")`). For each `active` series:

1. `occ = nextOccurrence(series, now)`; skip unless `occ − now ≤ 7 days`
   (one-week materialisation window).
2. Idempotency: skip if a meeting with `seriesId = series.id` AND `date`
   within the SAME LOCAL DAY as `occ` (Sydney midnight-to-midnight window)
   already exists — any status: a cancelled occurrence stays cancelled.
   Day-window, NOT exact-timestamp, matching — an edited occurrence time or
   a millisecond drift between `scheduledFor` and `nextOccurrence()` must
   never spawn a duplicate meeting.
3. Create the Meeting exactly as `POST /api/meetings` does for `scheduledFor`
   (status `scheduled`, `startedAt: null`, `date: occ`,
   title `"<series.name> — DD/MM/YYYY"` via the en-AU/Sydney format the page
   uses, `isLeadership`, `serviceIds`, `scorecardId`, `createdById` = series
   creator, `seriesId`), plus `MeetingAttendee` rows for `attendeeUserIds`
   filtered to still-active users.
4. ActivityLog (`action: "create"`, `details: { seriesId, auto: true }`).

Response reports `{created, skipped}`. Schedule added to `vercel.json`.

### API — `/api/meetings/series` (+`/[id]`)

- `GET` list (meeting GET roles), `POST` create, `PATCH` (active toggle +
  field edits), `DELETE` (hard delete — meetings keep `SetNull` history).
  Roles for writes: meeting PATCH roles. Zod: `dayOfWeek 0–6`,
  `minuteOfDay 0–1439`, name required.

### UI

- **StartMeetingDialog**: when "Schedule for later" is on, a second checkbox
  — "Repeat weekly at this time". On submit with it checked, the page first
  creates the series (name auto-derived: "Leadership L10" / "L10 Meeting"),
  then creates this week's meeting as usual stamped with the new `seriesId`
  (POST /api/meetings gains optional `seriesId`, validated to exist).
- **MeetingListView**: a compact "Recurring" strip above Upcoming (visible to
  meeting-role users, only when series exist): each series shows
  "Every <Day> <time>" + Pause/Resume + Delete (confirm). Upcoming rows from
  a series carry a small ↻ marker.
- Tomorrow's manually-created meeting (`cmth5ywwq00028nptww3x1gtw`) is
  retro-adopted: after deploy a one-off script stamps it with the new
  Leadership series so next week chains automatically. Script also creates
  the series itself (Tue 13:30 Australia/Sydney, leadership, the current
  7-person roster).

## B. Scorecard watchdog (auto-IDS)

### Schema

```prisma
model Issue {
  // new: the off-track measurable this issue polices. SetNull — deleting a
  // measurable never deletes discussion history.
  measurableId String?
  measurable   Measurable? @relation(fields: [measurableId], references: [id], onDelete: SetNull)
  @@index([measurableId])
}
// + back-relation `issues Issue[]` on Measurable
```

### Config

`orgSettingsConfigSchema` gains a NEW top-level `eos` block:
`eos: z.object({ measurableOffTrackWeeks: z.number().int().min(2).max(6).default(3) }).default({})`
— the OBJECT-level `.default({})` is mandatory (PATCH is a strict
full-replace; every legacy stored config lacks the block and must still
parse). Plus `ORG_SETTINGS_DEFAULTS.eos`, a hand-rolled merge branch for the
new field, a Settings → Organisation field ("Weeks off-track before a
measurable auto-raises an Issue"), and shared-schema tests — per the
`marketingWeeklyCap` precedent.

### Cron — `/api/cron/scorecard-watchdog` (weekly, `"30 21 * * 0"` — Sunday
21:30 UTC, after auto-measurables 20:30 and marketing-measurables 20:45)

For each `weekly`-frequency Measurable (hard-deleted model — no `deleted` filter exists):

1. Load its most recent N entries by `weekOf desc` (N = configured weeks).
   Trigger only when there are ≥N entries AND all N have `onTrack === false`.
   (Missing weeks don't count as misses — `scorecard-missing` already chases
   gaps; this watchdog polices *filled-but-failing*.)
2. Skip if an Issue with `measurableId = m.id` and status `open|in_discussion`
   already exists (the standing issue keeps policing; solving it re-arms).
3. Create Issue: title `"Scorecard off-track ${N}w: ${m.title}"`, description
   with the last N values vs goal, `priority: "high"`,
   `category: "short_term"`, `ownerId: m.ownerId`, `serviceId: m.serviceId`,
   `measurableId: m.id`, `raisedById: null` (system).
4. In-app `UserNotification` to the measurable owner (new type
   `scorecard_watchdog`, link `/issues`).

It lands in IDS automatically (short_term + open). Response
`{scanned, raised}`; ActivityLog per raised issue. `vercel.json` entry.

## C. Meeting insights

`MeetingInsightsCard` on `/meetings` (below the stats cards, only when ≥3
completed meetings carry an `outcomes` snapshot — pre-snapshot history can't
trend honestly, so it's simply excluded):

- Three inline SVG sparklines over the last 12 snapshot-bearing completed
  meetings (oldest→newest): **rating**, **todo completion %**,
  **issues solved per meeting** — each with the latest value + delta vs the
  previous meeting.
- Pure client-side compute from the already-fetched meetings list (snapshots
  ride on the row). Design tokens; hand-rolled `<svg>` polyline (no recharts
  outside `src/components/charts/`).

## D. Post-review digest (email + in-app)

New lib `src/lib/meeting-digest.ts` — `sendMeetingDigest(recordingId)`:

- Idempotent: `MeetingRecording.digestSentAt DateTime?` (new column,
  same migration); status-guarded `updateMany({ where: { id, digestSentAt:
  null }, data: { digestSentAt: now } })` claims it BEFORE sending — count 0
  ⇒ already sent, return.
- Email recipients: the meeting's attendees, `active: true`,
  `notificationsMuted: false` (this is work output for people who were in the
  room — the `receivesNudges` gate does NOT apply; suppression is enforced
  inside `sendEmail` as always). The IN-APP fan-out goes to all active
  attendees INCLUDING muted users — `notificationsMuted` means "no external
  pings; in-app kept" per its schema comment.
- Email (Resend via `sendEmail`, `baseLayout` + `buttonHtml`, every dynamic
  string through `escapeHtml`): meeting title/date, AI summary, decisions,
  counts of proposed/accepted action items ("X proposed action items are
  waiting for review"), the meeting's cascade messages, CTA → `/meetings`.
- In-app fan-out to the same recipients: new notification type
  `meeting_review_ready` ("AI review ready — <meeting title>", link
  `/meetings`), via a `createFor`-style helper mirroring
  `creative-request/notify.ts` (swallow-and-log, never throws).
- Callers: the Deepgram webhook's success path, the regenerate route's
  success path, and the janitor's successful retry — all fire-and-forget
  (`.catch(log)`); the digest claim makes multi-caller safe. Regenerating a
  review does NOT re-send (digestSentAt survives).

## E. Cascade reach & accountability

1. **Notify on publish** — shared helper `notifyCascadePublished(db,
   cascadeIds, meetingTitle)` in `src/lib/cascade-notify.ts` (createFor
   pattern): one in-app `UserNotification` per active user (type
   `cascade_published`, title "New cascade message from <meeting>", link
   `/communication?tab=cascade`) — ONE notification per publish batch, not
   per line. Called from both creation sites: `POST
   /api/communication/cascade` and the meeting-completion split in
   `/api/meetings/[id]`.
2. **URL-driven tab** — `/communication` reads `?tab=announcements|cascade|
   pulse` (default announcements) and writes it on tab click, so the
   notification link lands on the board.
3. **Ack accountability** — in `CascadeBoardTab`, for admin-tier viewers
   (owner/head_office/admin — also FIXES the client gate that omits
   `head_office` while the API allows it): an expandable "Who's acknowledged"
   under each card via the existing `[id]` GET (names already returned,
   never rendered), plus the un-acknowledged remainder (team list minus
   ackers).
4. **Remind un-acknowledged** — admin-only button per cascade → new `POST
   /api/communication/cascade/[id]/remind`: in-app notification (type
   `cascade_reminder`) to active users without an ack row for that cascade.
   Rate-limited 3/hour per endpoint; response reports `{reminded}`.

## F. Projects & todo completion

1. **Project ↔ Rock link** — `Project.rockId String?` (SetNull FK, indexed,
   `projects Project[]` back-relation on Rock). Settable in
   `CreateProjectModal` + `ProjectDetailPanel` (rock select, current quarter
   via `getCurrentQuarter()` + `useRocks`); shown as a chip on the project
   card/panel. Rock detail surfacing is out of scope.
2. **Progress without the N+1** — `GET /api/projects` replaces the
   two-counts-per-project loop with ONE
   `todo.groupBy(by: ["projectId", "status"], where: { projectId: { in:
   ids }, deleted: false }, _count: true)` and derives `{total, completed,
   percent}` per project from the grouped rows. Response shape unchanged.
3. **Auto-forward status** — in `PATCH /api/todos/[id]`, when a todo status
   changes and the todo has a `projectId`: if the project's status is
   `not_started` and the todo became `complete` or `in_progress`, flip the
   project to `in_progress` (guarded `updateMany where status:
   "not_started"`). Forward-only; nothing ever auto-completes or reopens.
   When ALL project todos are complete, `ProjectDetailPanel` shows a
   "All tasks done — mark project complete?" banner with a one-click status
   change (human declares done).
4. **Todo completion notes** — `Todo.completionNote String? @db.Text`.
   `updateTodoSchema` accepts `completionNote` (nullable, ≤2000 chars);
   setting status away from `complete` clears it server-side. UI: in
   `TodoDetailPanel`, when marking complete (and while complete) an optional
   "Outcome / what was done" textarea saved on blur; the meeting To-Do
   Review shows a small 📝 marker (title attribute = note) on completed
   todos that carry one. The AI-review accept flow is untouched (notes are
   human, post-completion).

---

## Cross-cutting conventions

- All four new notification types (`scorecard_watchdog`,
  `meeting_review_ready`, `cascade_published`, `cascade_reminder`) are
  registered in `NOTIFICATION_TYPES` (`src/lib/notification-types.ts`) per
  that file's header mandate.
- `/communication`'s `?tab=` uses `useSearchParams` — wrap in the usual
  Suspense boundary (copy the services/[id] `?tab=&sub=` precedent) so the
  build doesn't bail.
- Series-create is two sequential client POSTs (series, then meeting); if
  the meeting POST fails, the orphan series is harmless (the cron creates
  next week's occurrence) but the dialog surfaces the meeting error as
  usual.
- The projects `GET` change also removes the now-redundant `_count.todos`
  include.

## Error handling & edge cases

| Case | Behaviour |
|---|---|
| Series with all attendees deactivated | Meeting still created; attendee rows only for active users |
| DST transition week | `nextOccurrence` anchors to Sydney wall clock (tested) |
| Series occurrence manually cancelled | Stays cancelled — idempotency matches on any status |
| Watchdog: measurable with an already-open policing issue | Skipped (re-arms when solved) |
| Watchdog: fewer than N entries | Skipped (no false alarm on young measurables) |
| Digest double-trigger (webhook + janitor race) | digestSentAt claim — one send |
| Digest with zero eligible recipients | No-op, logged |
| Remind with everyone acked | `{reminded: 0}` |
| groupBy with zero projects | Skip the query entirely |

## Testing (vitest, house patterns)

- `lib/meeting-series`: nextOccurrence across DST (before/after 2026-10-04),
  same-day-later-time, wrap-around week.
- `cron/meeting-series`: auth/lock, creates within window, idempotent on
  existing occurrence (incl. cancelled), inactive series skipped, attendees
  filtered to active.
- `cron/scorecard-watchdog`: N-consecutive trigger, fewer-than-N skip, open
  policing issue skip, re-arm after solved, config N respected, notification
  fan-out.
- `lib/meeting-digest`: claim idempotency, recipient gating
  (inactive/muted excluded), escapeHtml on titles, callers fire-and-forget.
- `cascade`: publish fan-out (both sites), remind endpoint (targets only
  non-ackers, role gate, rate limit), tab param.
- `projects`: groupBy progress derivation, auto-forward guard
  (not_started→in_progress only), rockId validation.
- `todos`: completionNote accepted/cleared on un-complete.
- `org-settings-shared`: eos block default/range/merge branch.

## Rollout

1. One PR. Migration additive. Both crons inert until `vercel.json` deploys
   them (same PR).
2. Post-merge script (run once): create the Leadership series (Tue 13:30
   Australia/Sydney, current roster) and stamp meeting
   `cmth5ywwq00028nptww3x1gtw` with its id.
3. No env changes.
