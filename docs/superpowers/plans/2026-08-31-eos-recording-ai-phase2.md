# EOS Meeting Recording + AI Review (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record L10 meeting audio (browser mic) or upload a Teams/Zoom file → Deepgram diarized transcription (webhook callback) → Claude structured review (summary, decisions, proposed action items, missed items) with a human accept/dismiss queue — per spec §2 (`docs/superpowers/specs/2026-08-31-eos-meetings-todos-ai-design.md`).

**Architecture:** New `MeetingRecording` model; a recording-context upload lane (separate allow-list + 500 MB ceiling, always direct-to-Blob + verify); `POST /api/meetings/[id]/recordings` requests Deepgram transcription with a `?secret=`-authed callback; the webhook stores the transcript, deletes the audio blob, and runs `generateMeetingReview()` inline; accept/dismiss endpoints mutate the `aiReview` Json transactionally and mint real Todos/Issues. Builds on Phase 1 (branch `feature/eos-meetings-ai`); ships as a stacked PR.

**Tech Stack:** Deepgram nova-3 prerecorded API (callback mode), `generateStructured()` (showcase default), Vercel Blob, Vitest.

**Environment rules:** same as Phase 1 — never run migrations against `.env.local`'s DATABASE_URL; author migration SQL via offline schema-to-schema `migrate diff`. `DEEPGRAM_API_KEY` + `DEEPGRAM_WEBHOOK_SECRET` are already in `.env.local`; Jayden adds them to Vercel before deploy.

---

## Chunk 1: Schema + upload lane

### Task 1: `MeetingRecording` schema + migration

**Files:** Modify `prisma/schema.prisma`; Create `prisma/migrations/<ts>_meeting_recordings/migration.sql`

- [ ] Add enums `MeetingRecordingStatus { uploaded transcribing transcribed complete failed }`, `MeetingRecordingSource { live_mic upload }` and model `MeetingRecording` exactly per spec §2.1 (fields: meetingId FK Cascade, source, status, audioBlobUrl?, durationSeconds?, deepgramRequestId?, transcript Json?, transcriptText? @db.Text, aiReview Json?, error?, createdById? SetNull → User relation `"RecordingCreator"`, timestamps; indexes `[meetingId]`, `[status, createdAt]`, plus `[deepgramRequestId]` for webhook lookup). Add `recordings MeetingRecording[]` to Meeting and the back-relation on User.
- [ ] Author migration via `git show HEAD:prisma/schema.prisma` → scratchpad → `npx prisma migrate diff --from-schema-datamodel <old> --to-schema-datamodel prisma/schema.prisma --script`. Verify additive-only. `npx prisma generate`.
- [ ] Commit.

### Task 2: Recording upload lane

**Files:** Modify `src/lib/upload-strategy.ts`, `src/lib/file-validation.ts`, `src/lib/upload-client.ts`, `src/app/api/upload/blob-token/route.ts`, `src/app/api/upload/verify/route.ts`; Test `src/__tests__/lib/file-validation.test.ts` (extend), `src/__tests__/api/upload-verify.test.ts` (extend if exists, else create for the context switch)

- [ ] **Tests first**: `detectFileType` recognises EBML (`1A 45 DF A3` → `"video/webm"` container result), MP4 `ftyp` non-HEIC brands (`isom`,`mp42`,`M4A ` → `"video/mp4"` container result), MP3 (`ID3` and `FF FB`/`FF F3`/`FF F2` sync → `audio/mpeg`), WAV (`RIFF....WAVE` → `audio/wav`); `validateFileContent` accepts container↔declared pairs (webm container for `audio/webm`+`video/webm`; mp4 container for `audio/mp4`+`video/mp4`+`audio/x-m4a`); existing behaviours unchanged (RIFF+WEBP still webp, HEIC brands still heic).
- [ ] **upload-strategy**: add

```ts
export const RECORDING_ALLOWED_MIMES = [
  "audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-m4a",
  "video/mp4", "video/webm",
] as const;
export const RECORDING_MAX_UPLOAD = 500 * 1024 * 1024;
export type UploadContext = "default" | "recording";
```

  (`ABSOLUTE_MAX_UPLOAD` untouched; `describeOversizeError(sizeBytes, context?)` gains the recording ceiling branch with recording-specific copy.)
- [ ] **file-validation**: EBML/ftyp-brand/MP3/WAV signatures in `detectFileType` (webm returns container type `"video/webm"`; mp4 non-HEIC brands return `"video/mp4"`; comment that both cover audio+video variants of the container — do not split in a future refactor). `validateFileContent` container-mapping sets `WEBM_CONTAINER_MIMES`/`MP4_CONTAINER_MIMES`.
- [ ] **blob-token route**: reads `clientPayload` (the `@vercel/blob` client passes it through `handleUpload`) — `{ context: "recording" }` switches `allowedContentTypes` to `RECORDING_ALLOWED_MIMES` and `maximumSizeInBytes` to `RECORDING_MAX_UPLOAD`. Default behaviour byte-identical.
- [ ] **verify route**: body gains optional `context: z.enum(["default","recording"]).optional()`; when `"recording"`, `mimeType` is validated against `RECORDING_ALLOWED_MIMES` instead. Same range-read + sniff + delete-on-mismatch.
- [ ] **upload-client**: `uploadFileSmart(input, opts?: { context?: UploadContext })` — recording context skips compression, uses the recording oversize check, **always** takes direct-to-Blob (+`clientPayload: JSON.stringify({ context })`) + verify (passing `context`), regardless of size.
- [ ] Tests pass; commit.

## Chunk 2: Pipeline (lib + routes + webhook + janitor)

### Task 3: Deepgram client lib

**Files:** Create `src/lib/deepgram.ts`; Test `src/__tests__/lib/deepgram.test.ts`

- [ ] `requestTranscription({ audioUrl, callbackUrl })`: POST `https://api.deepgram.com/v1/listen?model=nova-3&diarize=true&smart_format=true&utterances=true&callback=<encoded>&callback_method=post`, headers `Authorization: Token ${DEEPGRAM_API_KEY}`, body `{ url: audioUrl }`; returns `{ requestId }` from `request_id`; throws with response text on non-2xx. `buildDeepgramCallbackUrl()` = `${siteUrl()}/api/webhooks/deepgram?secret=${DEEPGRAM_WEBHOOK_SECRET}`. `extractUtterances(payload)`: reads `results.utterances[]` → `{ speaker, start, end, text }[]`, plus `payload.metadata.duration`; `buildTranscriptText(utterances)` → `"Speaker N: text"` lines, coalescing consecutive same-speaker utterances.
- [ ] Tests: happy request (fetch mocked, assert URL/query/headers/body), non-2xx throws, utterance extraction incl. missing-utterances fallback (`results.channels[0].alternatives[0].transcript` → single speaker 0 utterance), coalescing.

### Task 4: Recording routes

**Files:** Create `src/app/api/meetings/[id]/recordings/route.ts` (POST+GET), `src/app/api/meetings/[id]/recordings/[recordingId]/regenerate/route.ts`; Test `src/__tests__/api/meeting-recordings.test.ts`

- [ ] **POST** (`withApiAuth`, roles = meeting PATCH roles, rateLimit 10/min): Zod `{ url: z.string().url(), source: z.enum(["live_mic","upload"]), durationSeconds: z.number().int().positive().optional(), mimeType: z.string().optional() }`; url host must end `.blob.vercel-storage.com` (400 otherwise); meeting must exist (404). Create row (`status:"uploaded"`) → `requestTranscription` → update `deepgramRequestId`, `status:"transcribing"` → 201 row. On Deepgram throw: `status:"failed"` + error, delete blob (best-effort, log), 502.
- [ ] **GET** (same GET semantics as meeting): list recordings for the meeting, `select` everything EXCEPT `transcript` (keep `transcriptText`, `aiReview`, statuses), order createdAt desc.
- [ ] **regenerate POST** (`withApiAuth`, meeting roles, rateLimit 5/min): row must belong to meeting (404), must have `transcript` and status `complete|failed` (409 otherwise); set `status:"transcribed"`, run summarise (Task 5) inline (timeoutMs 120_000 on the route), store `aiReview` + `status:"complete"`; on failure `failed`+error.
- [ ] Tests: auth/role, bad host 400, meeting 404, happy path (deepgram lib mocked) stores requestId + transcribing, deepgram failure → failed + blob delete + 502, GET excludes transcript field, regenerate guards.

### Task 5: `meeting-review` summarisation lib

**Files:** Create `src/lib/meeting-review.ts`; Test `src/__tests__/lib/meeting-review.test.ts`

- [ ] Zod schema per spec §2.5 (`MeetingAiReview`): summary; decisions `{text, quote}[]` (max 10); actionItems `{ title, suggestedAssigneeUserId nullable, suggestedAssigneeName nullable, suggestedDueDate nullable, quote }[]` (max 20 — `id` + `status:"proposed"` minted server-side AFTER validation, not model-supplied); missedItems `{ kind enum, text, quote }[]` (max 10, `status:"proposed"` minted); speakerMap `{ speaker, name nullable, confidence enum }[]`.
- [ ] `generateMeetingReview(recordingId)`: load recording + meeting + attendees (userIds+names) + meeting-scope open issues/rocks (reuse the scoping shape from `l10-prep.ts`); build utterance text (coalesced; if > ~150k chars drop timestamps and truncate oldest-first keeping the tail); `generateStructured({ system, prompt, schema, maxTokens: 4096 })` with the showcase default. **Defensive post-validation**: null any `suggestedAssigneeUserId` not in the attendee set; enforce caps; mint uuids (`crypto.randomUUID`) + `status:"proposed"`; stamp `generatedAt`, `modelId`. System prompt rules: only commitments actually spoken; ambiguous owner → `unowned_commitment` missed item, never a guessed assignee; compare against provided open-issues list for `uncaptured_issue`; rocks mentioned but not statused → `unstatused_rock`.
- [ ] Tests: assignee-id validation drops unknown ids (mock `generateStructured`), caps enforced, ids+statuses minted, truncation kicks in, throws propagate.

### Task 6: Deepgram webhook

**Files:** Create `src/app/api/webhooks/deepgram/route.ts`; Test `src/__tests__/api/webhooks-deepgram.test.ts`

- [ ] `withApiHandler`; `?secret=` timing-safe compare vs `DEEPGRAM_WEBHOOK_SECRET` (Brevo pattern; 500 if unconfigured, 401 on mismatch). Parse json (malformed → 200 ack). `request_id` from `payload.metadata.request_id` (fallback `payload.request_id`); unknown → 200 ack + `logger.warn`. Idempotency: `updateMany({ where: { deepgramRequestId, status: "transcribing" }, data: { status: "transcribed" } })` → count 0 ⇒ 200 duplicate no-op. Then: store `transcript` (utterances Json) + `transcriptText` + `durationSeconds` (if row lacks it); **delete blob + null `audioBlobUrl`** (failure: log, continue); run `generateMeetingReview` inline → `aiReview` + `complete`; on summarise failure → `failed` + error (transcript retained). Route `timeoutMs: 120_000`.
- [ ] Tests: 401 bad secret, 200-ack unknown id, duplicate no-op (updateMany count 0 → no further writes), happy path (transcript stored, deleteFile called, audioBlobUrl nulled, review stored, complete), summarise-throw → failed with transcript intact, blob-delete failure continues.

### Task 7: Accept / dismiss endpoints

**Files:** Create `src/app/api/meetings/[id]/recordings/[recordingId]/action-items/[itemId]/route.ts` (POST accept / dismiss via body `{ decision: "accept"|"dismiss", title?, assigneeId?, dueDate? }`), `.../missed-items/[itemId]/route.ts` (`{ decision: "action"|"dismiss" }`); Test `src/__tests__/api/meeting-review-decisions.test.ts`

- [ ] Both `withApiAuth` (meeting PATCH roles). Inside ONE interactive `$transaction`: re-read the recording row, locate the item in `aiReview` Json, 409 unless `status === "proposed"`; **accept** → create Todo (`title`/`assigneeId`/`dueDate` from body-overrides falling back to suggestion; `weekOf: getWeekStart()`, `meetingId`, `createdById: session user`) and write item `status:"accepted"`, `todoId`; **dismiss** → `status:"dismissed"`. Missed-item `action` on `kind === "uncaptured_issue"` → create Issue (short_term, medium, `raisedById` actor, serviceId when meeting has exactly one) + `status:"actioned"`, `issueId`; other kinds only dismiss (400 for action). Assignee suggestion null and no override → 400 "assignee required".
- [ ] Tests: accept creates todo with meetingId + marks accepted, double-accept 409, dismiss, missed-item issue creation, action on non-issue kind 400, role gate.

### Task 8: Janitor sweep

**Files:** Modify `src/app/api/cron/email-janitor/route.ts` (new section at the end, same lock); Test extend its test file (or create `src/__tests__/api/cron/email-janitor-recordings.test.ts`)

- [ ] Sweep 1: recordings `status in [uploaded, transcribing]` AND `updatedAt < now-2h` → `failed`, error "transcription timed out", delete blob when `audioBlobUrl` set + null it. Sweep 2: `status: "transcribed"` older than 2h → try `generateMeetingReview` once → complete, else failed (transcript kept). Counts added to the janitor's response json. Note in comment: daily cadence means up to ~24h detection latency — accepted in spec.
- [ ] Tests: stuck rows swept + blob deleted; transcribed retries summarise.

## Chunk 3: Client

### Task 9: Recorder hook + capture UI

**Files:** Create `src/hooks/useMeetingRecorder.ts`, `src/hooks/useMeetingRecordings.ts`; Modify `src/components/meetings/ActiveMeetingView.tsx`

- [ ] `useMeetingRecorder({ onRecorded })`: `getUserMedia({ audio: true })` → `MediaRecorder` with best-supported mime (`audio/webm;codecs=opus` → `audio/webm` → `audio/mp4`), `audioBitsPerSecond: 32_000`, `timeslice 30_000`, chunks in a ref; `stop()` → File from chunks (`l10-recording-<ts>.<ext>`) → `onRecorded(file, durationSeconds)`; exposes `{ isRecording, elapsedSeconds, error, start, stop }`; mic-denied → error message (toast at call site); `beforeunload` guard while recording; cleanup tracks on stop/unmount.
- [ ] `useMeetingRecordings(meetingId)`: React Query list of `GET /api/meetings/[id]/recordings`, `retry: 2`, `staleTime: 10_000`, `refetchInterval` 10s while any row is non-terminal (`uploaded|transcribing|transcribed`). `useCreateRecording(meetingId)` (upload already done; POSTs url/source/duration), `useRegenerateReview`, `useActionItemDecision`, `useMissedItemDecision` — all `onError` destructive toasts, invalidate `["meeting-recordings", meetingId]` (+ `["todos"]` on accept).
- [ ] `ActiveMeetingView` header (in-progress only): Record/Stop button + red pulsing `● REC mm:ss` indicator (consent surface); on stop → `uploadFileSmart(file, { context: "recording" })` → `useCreateRecording` → toast "Recording uploaded — transcribing". Roles: render only when session role ∈ meeting PATCH roles (mirror server).
- [ ] Commit.

### Task 10: Upload path + `MeetingAiReviewPanel`

**Files:** Create `src/components/meetings/MeetingAiReviewPanel.tsx`; Modify `ActiveMeetingView.tsx`

- [ ] Panel rendered below `MeetingOutcomesPanel` on completed meetings AND on in-progress when recordings exist. Per recording: status strip (uploaded → transcribing → summarising(=transcribed) → complete / failed+error with Regenerate via `useRegenerateReview`); when `complete`: Summary, Decisions (expandable quotes), **Proposed action items** — accept flow opens inline editable row (title / assignee select from attendees+users / due date defaulting suggestion-or-+7d) → `useActionItemDecision`; dismiss link; accepted rows show "✓ To-do created"; **Missed items** grouped by kind — `uncaptured_issue` gets "Raise as Issue", all get Dismiss; **Transcript** collapsible `<details>`, speaker names substituted from high-confidence `speakerMap` entries. "Upload recording" button (file input accepting the recording MIMEs) on completed + in-progress meetings → same upload→create flow (`source:"upload"`).
- [ ] Design tokens + `Button` component; icon-only buttons get `aria-label`.
- [ ] Commit.

### Task 11: Env, verification, PR

- [ ] `.env.example`: `DEEPGRAM_API_KEY=`, `DEEPGRAM_WEBHOOK_SECRET=` with one-line comments.
- [ ] `npm test` green; `npm run build` clean; lint no new issues in touched files.
- [ ] Adversarial code-review subagent pass; fix findings.
- [ ] Push; open stacked PR (base: `feature/eos-meetings-ai` if #259 unmerged, else main). Body notes: Vercel env vars required before merge-deploy; audio deleted after transcription; verbal-announcement consent convention.
