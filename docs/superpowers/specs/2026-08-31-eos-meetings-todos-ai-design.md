# EOS Meetings & Todos Upgrade — Foundation + AI Meeting Layer

**Date:** 2026-08-31
**Status:** Approved by Jayden (brainstorming session 2026-08-31)
**Branch:** `feature/eos-meetings-ai`

## Overview

Two-phase upgrade to the EOS component (L10 meetings + todos), bringing it toward
Stredy/Ninety-class capability:

- **Phase 1 — Foundation**: meeting↔todo linkage, meeting scheduling, per-meeting
  outcome snapshots, To-Do Review as a capture surface, AI-prep consolidation, and
  five confirmed bug fixes.
- **Phase 2 — AI meeting layer**: record meeting audio (browser mic or uploaded
  Teams/Zoom file) → Deepgram transcription (diarized) → Claude-generated structured
  review (summary, decisions, proposed action items, "things you may have missed")
  with a human accept/dismiss queue.

Each phase ships as its own PR. Phase 2 depends on Phase 1's schema.

### Decisions locked during brainstorming

| Decision | Choice |
|---|---|
| Meeting mode | Mixed — in-person (browser mic) AND video calls (upload recording path) |
| Scope | Foundation + AI, phased |
| Transcription provider | Deepgram (nova-3, diarization on) |
| Raw audio retention | **Delete from Blob immediately after successful transcription**; transcript is the durable record |
| Action items | Never auto-created — human accept/dismiss queue creates real Todos |
| Pipeline shape | Webhook-driven (Deepgram callback), no polling cron, no long-running functions |

### Non-goals (YAGNI)

- No configurable agendas (sections stay hardcoded in `sections.ts` for now).
- No structured headlines records.
- No live/streaming transcription — post-hoc processing only.
- No Teams/Zoom bot integration — video-call meetings use the manual upload path.
- No re-listening UI — audio is deleted after transcription by design.
- No changes to Issues/Rocks/Scorecard/V-TO beyond what the items below require.

---

## Phase 1 — Foundation

### 1.1 Schema changes (one migration, backwards-compatible)

```prisma
model Meeting {
  // new:
  outcomes Json?   // completion-time snapshot, see 1.4
  // NOTE: no scheduledAt column — the existing required `Meeting.date`
  // DateTime carries the scheduled datetime (see 1.2).
}

model Todo {
  // new:
  meetingId String?
  meeting   Meeting? @relation(fields: [meetingId], references: [id], onDelete: SetNull)
  @@index([meetingId])
}
```

Migration authored via schema-to-schema `prisma migrate diff` (NEVER `migrate dev`
against `.env.local`'s DATABASE_URL — it is the shared prod DB). Applied in
production by the existing `vercel.json` buildCommand.

### 1.2 Meeting scheduling

- `POST /api/meetings` gains an optional `scheduledFor` body field (ISO
  datetime, must be future-or-today). When present: `status: "scheduled"`,
  `startedAt: null`, and **`date = scheduledFor`** (the existing required
  `Meeting.date` DateTime carries the scheduled moment — no new column).
  When absent: current behaviour unchanged (`in_progress` + `startedAt: now`,
  `date: now`). Because the morning-briefing cron already matches scheduled
  meetings on `date` within today, setting `date = scheduledFor` is what makes
  its auto-prep branch reachable — no cron changes needed.
- New endpoint behaviour on `PATCH /api/meetings/[id]`: accepts
  `action: "start"` → guarded `updateMany where status: "scheduled"` flips to
  `in_progress`, stamps `startedAt` (409 if already started — protects against
  double-click/two devices).
- `StartMeetingDialog` final step gets a "Start now / Schedule for later"
  choice with a datetime picker (default: now → start-now path).
- `MeetingListView` shows an "Upcoming" group (scheduled meetings, soonest first)
  above the history list, each with a **Start** button (roles: same as meeting
  PATCH roles) and a cancel option (sets `status: "cancelled"`).
- The existing `Meeting.date` ordering on the list page keeps upcoming meetings
  sorted naturally; no query changes beyond the status filter for the
  "Upcoming" group.

### 1.3 Meeting↔Todo linkage + carry-over visibility

- Every todo created **from inside a meeting** stamps `meetingId`:
  - IDS "Create To-Do from this Issue" (existing flow in `ActiveMeetingView`).
  - New To-Do Review quick-add (1.5).
- `createTodoSchema` gains optional `meetingId` (validated: meeting must exist;
  no role change — the meeting-runner roles already gate the meeting UI).
- `TodoDetailPanel` shows a "Created in: <meeting title, date>" link when present.
- To-Do Review section shows a "from last meeting" badge on todos whose
  `meetingId` points at the most recent prior completed meeting of the same
  type (leadership flag + service scope). This is display-only — the section's
  candidate list logic is unchanged.

### 1.4 Outcome snapshots

- On completion (`PATCH status: "completed"`), the route computes and stores
  `Meeting.outcomes` **once** (skip if already set):

```ts
type MeetingOutcomes = {
  todosCompleted: number;      // todos completed during the meeting window
  todosTotal: number;          // candidate todos at completion time
  completionPct: number;
  issuesSolvedIds: string[];   // issues with status "solved" + solvedAt within the meeting window
  rocksOnTrack: number;
  rocksTotal: number;
  avgRating: number | null;    // = Meeting.rating (server-computed average of
                               //   present attendees' MeetingAttendee.rating)
  capturedAt: string;          // ISO
};
```

- "Meeting window" = `startedAt..completedAt`.
- `MeetingOutcomesPanel` renders from `meeting.outcomes` when present; falls back
  to the current live computation for legacy meetings (no backfill).

### 1.5 To-Do Review becomes a capture surface

`TodoReviewSection` gains, alongside the existing complete-toggle list:

- **Quick-add row**: title input + assignee select (defaults: present attendees
  listed first) + due date (default: +7 days). Creates via existing
  `useCreateTodo` with `meetingId`, `weekOf: getWeekStart(now)`.
- **Inline reassign + re-date** on each row (assignee select + date input,
  PATCH via existing `useUpdateTodo`).
- All mutations use existing hooks (which already carry `onError` toasts and
  optimistic completion toggles).

### 1.6 AI prep consolidation

- The `MeetingListView` "AI Prep" button stops using the ephemeral
  `AiButton templateSlug="meetings/l10-prep"` path. It calls the existing
  `usePrepareMeeting` mutation (`POST /api/meetings/[id]/prepare`) for the
  **next upcoming/in-progress meeting** and renders the persisted
  `aiAgendaDraft` via the existing `AiAgendaPanel` presentation.
  If no upcoming meeting exists, the button prompts to schedule/start one.
- Remove: the 5 client-side markdown-blob variable builders in
  `MeetingListView.tsx`, and deactivate the `meetings/l10-prep`
  `AiPromptTemplate` seed (set `active: false` in seed so existing DB rows are
  deactivated on next deploy; the generate route already 410s inactive slugs).

### 1.7 Bug fixes (each with a regression test)

1. **`isPrivate` enforcement**: private todos are visible only to (a) primary
   assignee, (b) any `TodoAssignee`, (c) `createdById`, (d) roles
   `owner|head_office|admin`. Implemented as a shared helper
   `privateTodoWhere(session)` in `src/lib/todos/private-filter.ts` returning a
   `TodoWhereInput` clause, applied at **every** route that queries
   `prisma.todo` for read (apply-100% rule): `GET /api/todos`,
   `GET /api/todos/[id]`, `GET /api/search` (which today leaks private todos to
   all non-staff roles), and `GET /api/services/[id]/today` (no private filter
   at all today). An implementation-time grep for `prisma.todo.find` confirms
   no other read surface is missed; any found are included in the sweep.
2. **Bulk delete → soft delete** (`POST /api/todos/bulk-actions`): `delete`
   becomes `updateMany { deleted: true }` + one ActivityLog entry (action
   `bulk_delete`, ids in metadata) — matching the single-route semantics.
3. **Bulk complete recomputes rocks**: after `updateMany`, collect distinct
   `rockId`s of affected todos and recompute each rock's `percentComplete`
   (same formula as the single-todo PATCH; extract that logic into a shared
   helper `src/lib/todos/recompute-rock-progress.ts` so the two paths cannot
   diverge).
4. **Recurring-todos due dates match the rule** (`/api/cron/recurring-todos`):
   `dueDate = nextRunAt + period` where period is daily→1d, weekly→7d,
   fortnightly→14d, monthly→1mo, quarterly→3mo (previously always +7d).
5. **L10 digest recipients** (`/api/cron/l10-prep-digest`): role filter becomes
   `[owner, head_office, admin, member, eos, eos_implementer]`
   (adds `head_office`, `eos`, `eos_implementer`; still excludes
   `marketing`, `staff`, `eos_viewer` — viewers are read-only and staff don't
   own EOS items).

---

## Phase 2 — Recording → Transcript → AI review

### 2.1 Schema

```prisma
enum MeetingRecordingStatus {
  uploaded      // blob stored, transcription requested
  transcribing  // Deepgram accepted the request
  transcribed   // transcript stored, audio deleted, summarisation running
  complete      // aiReview stored
  failed        // error recorded; audio deleted if still present
}

enum MeetingRecordingSource {
  live_mic
  upload
}

model MeetingRecording {
  id               String   @id @default(cuid())
  meetingId        String
  meeting          Meeting  @relation(fields: [meetingId], references: [id], onDelete: Cascade)
  source           MeetingRecordingSource
  status           MeetingRecordingStatus @default(uploaded)
  audioBlobUrl     String?  // nulled after deletion
  durationSeconds  Int?
  deepgramRequestId String? // request_id from Deepgram, for webhook correlation
  transcript       Json?    // utterances: [{ speaker: Int, start: Float, end: Float, text: String }]
  transcriptText   String?  @db.Text  // flat "Speaker N: ..." rendering
  aiReview         Json?    // MeetingAiReview, see 2.5
  error            String?
  createdById      String?
  createdBy        User?    @relation(fields: [createdById], references: [id], onDelete: SetNull)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([meetingId])
  @@index([status, createdAt])
}
```

Multiple recordings per meeting are allowed (e.g. a mic session plus an uploaded
Teams file). Each is processed independently; the meeting page lists all of them.

### 2.2 Audio capture (live mic)

- `useMeetingRecorder` hook (new, `src/hooks/useMeetingRecorder.ts`):
  `MediaRecorder` with `audio/webm;codecs=opus` at ~32 kbps
  (`audioBitsPerSecond: 32_000`), `timeslice: 30_000` — chunks buffered in
  memory, concatenated into one Blob on stop. 90 min ≈ 20 MB.
  Falls back to the browser's default audio mime when opus/webm is unsupported
  (Safari → `audio/mp4`); the chosen mime flows through to upload validation.
- UI in `ActiveMeetingView` header: Record button → prominent red pulsing
  "● Recording" indicator with elapsed time + Stop. Visible to all attendees on
  screen (this is the consent surface). Recording available to the same roles
  that can PATCH the meeting.
- `beforeunload` handler warns while recording (buffered audio would be lost —
  accepted limitation, documented in the UI copy).
- On stop: upload via the existing `uploadFileSmart` path (files >4 MB already
  go direct-to-Blob with verify), then `POST /api/meetings/[id]/recordings`
  with `{ url, source: "live_mic", durationSeconds }`.
- **Upload-strategy additions**: add `audio/webm`, `audio/mp4`, `audio/mpeg`,
  `audio/wav`, `audio/x-m4a`, `video/mp4`, `video/webm` to a **new, separate**
  allow-list `RECORDING_ALLOWED_MIMES` in `src/lib/upload-strategy.ts`, with
  matching magic-byte signatures added to `detectFileType` in
  `src/lib/file-validation.ts` (webm/EBML `1A45DFA3`, mp4/m4a `ftyp` box,
  mp3 `ID3`/`FFF*` frame sync, wav `RIFF..WAVE`).
- **Size ceilings** (the general `ABSOLUTE_MAX_UPLOAD` is 10 MB and stays
  untouched): a new `RECORDING_MAX_UPLOAD = 500 MB` applies only to the
  recording context. `uploadFileSmart` gains an optional
  `{ context: "recording" }` argument; the `/api/upload/blob-token` and
  `/api/upload/verify` routes accept the same context flag and switch to the
  recording allow-list + ceiling when set. Default context behaviour is
  byte-for-byte unchanged. A 90-min mic recording (~22 MB) and typical
  Teams/Zoom mp4 exports both fit. Recording-context uploads **always** take
  the direct-to-Blob + verify path regardless of size (a short mic clip could
  be under the 4 MB serverless threshold, and `/api/upload` deliberately does
  NOT learn the context flag — one gate, not two).

### 2.3 Upload-a-recording path

- On completed (and in-progress) meetings: an "Upload recording" action opens a
  file picker (accept: the audio MIMEs above + video containers Deepgram accepts:
  `video/mp4`, `video/webm` — Teams/Zoom exports are often mp4). Same
  `uploadFileSmart` → `POST /api/meetings/[id]/recordings` with
  `{ url, source: "upload" }`.

### 2.4 Processing pipeline

**`POST /api/meetings/[id]/recordings`** (`withApiAuth`, meeting-PATCH roles,
rate limit 10/min):

1. Validate body (Zod): `url` must pass the existing Blob-host allowlist
   validation (`safeAttachmentUrl` pattern), `source` enum, optional
   `durationSeconds`.
2. Create `MeetingRecording` row (`status: uploaded`).
3. Call Deepgram pre-recorded API
   (`POST https://api.deepgram.com/v1/listen?model=nova-3&diarize=true&smart_format=true&utterances=true&callback=<APP_URL>/api/webhooks/deepgram?secret=<DEEPGRAM_WEBHOOK_SECRET>&callback_method=post`)
   with JSON body `{ url: <blobUrl> }`, auth `Token ${DEEPGRAM_API_KEY}`.
4. Store `deepgramRequestId` from the response, set `status: transcribing`.
5. On Deepgram request failure: `status: failed`, `error` stored, **delete the
   Blob audio**, return 502 with the error message.

**`POST /api/webhooks/deepgram`** (`withApiHandler`, no session; auth =
`?secret=` query param constant-time-compared to `DEEPGRAM_WEBHOOK_SECRET` —
same pattern as the Brevo webhook):

1. Look up the recording by `metadata.request_id` (Deepgram echoes it).
   Unknown id → 200 (ack, log warn) so Deepgram doesn't retry forever.
2. Idempotency: guarded `updateMany where status: "transcribing"` → if 0 rows,
   this is a duplicate delivery; return 200.
3. Extract utterances (`results.utterances[]` → `{speaker,start,end,text}`)
   and build `transcriptText` (`"Speaker 0: ..."` lines). Store both,
   `status: transcribed`, and `durationSeconds` from `metadata.duration` when
   the row has none.
4. **Delete the audio Blob** (`del()` from `@vercel/blob`) and null
   `audioBlobUrl`. Deletion failure: log error, continue (janitor sweeps it).
5. Run summarisation (2.5) inline; on success store `aiReview`,
   `status: complete`. On failure: `status: failed` + `error` — transcript is
   retained so "Regenerate" can retry without re-transcribing.
6. Route timeout: 120s (matches `/prepare`). Sonnet call is the long pole.

**Stuck-recording janitor**: extend the existing `email-janitor` daily cron with
a sweep — recordings in `uploaded`/`transcribing` older than 2 h →
`status: failed`, `error: "transcription timed out"`, delete Blob if
`audioBlobUrl` still set. Recordings in `transcribed` older than 2 h → retry
summarisation once, else fail. Because the janitor is daily, a stuck recording
may sit up to ~24 h before being swept — acceptable: the UI's status strip
shows "still processing" honestly, and Regenerate/re-upload remain available
after the sweep.

**`POST /api/meetings/[id]/recordings/[recordingId]/regenerate`**
(`withApiAuth`, same roles, rate limit 5/min): re-runs summarisation from the
stored transcript for `complete`/`failed`-with-transcript rows. 409 otherwise.

### 2.5 Summarisation

New module `src/lib/meeting-review.ts` (mirrors `l10-prep.ts` conventions):

- `generateMeetingReview(recordingId)`:
  - Gathers context: meeting (title, date, isLeadership, notes fields),
    attendees (names + userIds — the model maps "Speaker N" to attendee names
    from segue introductions/addressing, and every mapping is marked with a
    confidence so the UI can show "unmatched" instead of a bad guess), the
    meeting's candidate todos, open issues and rocks in the meeting's scope
    (same scoping rules as `l10-prep.ts`), transcript utterances (truncated to
    fit budget: keep all, but if projected input exceeds ~150k chars, drop
    utterance timestamps and coalesce consecutive same-speaker lines).
  - Calls `generateStructured()` with the `showcase` default provider-model
    (same as `l10-prep.ts` — `DEFAULT_PROVIDER_MODEL.showcase`, an
    `{ provider, modelId }` object; no hardcoded model literal in the new
    module), `maxTokens: 4096`, Zod-validated output:

```ts
type MeetingAiReview = {
  summary: string;                       // 150-300 word narrative
  decisions: { text: string; quote: string }[];
  actionItems: {
    id: string;                          // stable uuid minted server-side post-validation
    title: string;
    suggestedAssigneeUserId: string | null;  // validated against attendee userIds, else null
    suggestedAssigneeName: string | null;    // what the model heard, for the UI
    suggestedDueDate: string | null;     // ISO date if a deadline was spoken
    quote: string;
    status: "proposed" | "accepted" | "dismissed";  // starts "proposed"
    todoId?: string;                     // set on accept
  }[];
  missedItems: {
    kind: "uncaptured_issue" | "unowned_commitment" | "unstatused_rock";
    text: string;
    quote: string;
    status: "proposed" | "actioned" | "dismissed";
    issueId?: string;                    // set when raised as an Issue
  }[];
  speakerMap: { speaker: number; name: string | null; confidence: "high" | "low" }[];
  generatedAt: string;
  modelId: string;
};
```

  - **Defensive validation** (copied from `l10-prep.ts`): drop/null any
    `suggestedAssigneeUserId` not in the attendee set; cap actionItems at 20,
    missedItems at 10, decisions at 10.
  - System prompt instructs: extract only commitments actually spoken; when
    ownership is ambiguous, put it in `missedItems` as `unowned_commitment`
    rather than guessing an assignee; compare discussion against the provided
    open-issues list to find `uncaptured_issue`s; compare rocks mentioned
    against the provided rock list for `unstatused_rock`.

### 2.6 Review UI

New `MeetingAiReviewPanel` (`src/components/meetings/MeetingAiReviewPanel.tsx`),
rendered on completed meetings (below `MeetingOutcomesPanel`) and on the
in-progress view once a recording reaches `complete`:

- **Status strip** per recording: uploaded → transcribing → summarising →
  complete/failed (with error + "Regenerate"/retry affordances). Poll the
  recording list every 10 s while any recording is non-terminal (React Query
  `refetchInterval`).
- **Summary** + **Decisions** (each with an expandable source quote).
- **Proposed action items** — accept/dismiss queue. Accept opens an inline
  editable row (title, assignee select pre-filled from suggestion, due date
  pre-filled or +7d) → `POST /api/meetings/[id]/recordings/[recordingId]/action-items/[itemId]/accept`
  creates a real Todo (`meetingId` stamped, `issueId` absent) and marks the
  item `accepted` + `todoId` in `aiReview`. Dismiss marks `dismissed`.
  Both are single-item PATCH-style endpoints (`withApiAuth`, meeting roles)
  that mutate the `aiReview` Json via read-modify-write **inside one
  interactive `$transaction`**: re-read the row inside the transaction, 409 if
  the item's status is no longer `proposed`, create the Todo/Issue, write the
  updated Json — so a double-accept race cannot create two todos.
- **Things you may have missed** — same accept/dismiss pattern;
  `uncaptured_issue` accept creates an Issue (short_term, priority medium,
  raisedById = actor, serviceId from meeting scope when unambiguous) and marks
  `actioned`; the other kinds are informational with dismiss only.
- **Transcript** — collapsible viewer of `transcriptText` with speaker names
  substituted from `speakerMap` (high-confidence only; low/unmatched stay
  "Speaker N").

New hook `src/hooks/useMeetingRecordings.ts`: `useMeetingRecordings(meetingId)`
(list + poll), `useCreateRecording`, `useRegenerateReview`,
`useActionItemDecision`, `useMissedItemDecision` — all with `retry: 2`,
`staleTime`, `onError` destructive toasts per house standards.

`GET /api/meetings/[id]/recordings` (`withApiAuth`, same GET roles as the
meeting) returns rows **without** `transcript` Json (list payload keeps
`transcriptText` + `aiReview` + status only; utterance Json is internal).

### 2.7 Environment / config

- `DEEPGRAM_API_KEY` — already in `.env.local`; **must be added to Vercel env
  by Jayden before Phase 2 deploys**.
- `DEEPGRAM_WEBHOOK_SECRET` — generated, in `.env.local`; add to Vercel.
- Both added to `.env.example` with placeholder values.
- Callback base URL: `NEXTAUTH_URL` (already required env).
- Cost note: ≈ $0.35 per 90-min meeting (Deepgram ~$0.25 + Sonnet ~$0.10).
  Every Sonnet call logs to the existing cost tracking via
  `generateStructured()`'s returned token counts (logged via `logger.info`,
  matching `l10-prep.ts`).

### Error handling summary

| Failure | Behaviour |
|---|---|
| Mic permission denied | Toast with guidance; meeting continues unrecorded |
| Upload fails | `uploadFileSmart`'s existing error surface; nothing persisted |
| Deepgram request rejected | Recording `failed`, blob deleted, toast |
| Deepgram never calls back | Janitor fails it at 2 h, blob deleted |
| Webhook duplicate delivery | Status-guarded updateMany → no-op 200 |
| Summarisation fails | `failed` but transcript retained; Regenerate retries |
| Blob delete fails | Logged; janitor retries deletion on sweep |
| Double accept of an action item | Transactional status re-check → 409 |

---

## Testing

Vitest, in `src/__tests__/` per house patterns (prisma-mock with
`$transaction`, `mockImplementation` input routing, `_clearUserActiveCache()`).

**Phase 1**
- `api/meetings`: scheduling (POST with `scheduledFor` → scheduled; `action: "start"` happy/409), outcomes snapshot written once on completion, completion still splits cascades.
- `api/todos`: `isPrivate` filtering matrix (assignee sees, co-assignee sees, creator sees, admin sees, unrelated member does NOT), `meetingId` create/validation.
- `api/todos/bulk-actions`: delete is soft + logged; complete recomputes rock progress (shared helper unit-tested directly).
- `cron/recurring-todos`: per-rule due dates.
- `cron/l10-prep-digest`: new role filter.

**Phase 2**
- `api/meetings/[id]/recordings`: auth/roles, Blob-host URL validation, Deepgram failure → failed+deleted.
- `webhooks/deepgram`: bad secret 401, unknown request_id 200-ack, happy path stores transcript + deletes blob + sets status, duplicate delivery no-op, summarisation failure leaves `failed` with transcript.
- `lib/meeting-review`: Zod schema, assignee-id validation drops unknown ids, caps enforced, transcript coalescing.
- `action-items/accept`: creates todo with meetingId, marks accepted, double-accept 409; dismiss; missed-item issue creation.
- `cron` janitor sweep: stuck uploaded/transcribing → failed + blob delete.

Build (`npm run build`), `npm test`, lint must pass before each PR.

## Rollout

1. Phase 1 PR → merge. Migration is additive; existing meetings/todos unaffected.
2. Jayden adds `DEEPGRAM_API_KEY` + `DEEPGRAM_WEBHOOK_SECRET` to Vercel env.
3. Phase 2 PR → merge. Feature is inert until someone records/uploads.
4. Socialise: recording indicator = on-screen consent surface, **plus** a house
   convention that the meeting runner verbally announces recording at the start
   of the Segue (Australian states, incl. NSW, require all-party consent for
   recording private conversations — an on-screen badge alone is thin).
   Audio is never retained.
