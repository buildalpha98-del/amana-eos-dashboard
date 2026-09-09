# EOS Foundation (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Meeting↔todo linkage, meeting scheduling, per-meeting outcome snapshots, To-Do Review capture surface, AI-prep consolidation, and five confirmed bug fixes — per the approved spec `docs/superpowers/specs/2026-08-31-eos-meetings-todos-ai-design.md`.

**Architecture:** Additive Prisma migration (`Todo.meetingId`, `Meeting.outcomes`), a shared private-todo visibility helper applied at 100% of todo read routes, a shared rock-progress recompute helper used by both single and bulk todo completion, and scheduling that reuses the existing `Meeting.date` column (no new datetime column). All API work stays inside the existing `withApiAuth` route files.

**Tech Stack:** Next.js 16 App Router, Prisma 5.22, Zod, React Query, Vitest (prisma-mock/auth-mock/createRequest helpers).

**CRITICAL environment rules:**
- `.env.local`'s `DATABASE_URL` is the **shared prod DB**. NEVER run `prisma migrate dev`, `migrate deploy`, or `db push` locally. Migration SQL is authored with schema-to-schema `prisma migrate diff` (no DB connection).
- Work in the worktree `/Users/jaydenkowaider/Developer/amana-eos-dashboard/.claude/worktrees/eos-meetings-ai`, branch `feature/eos-meetings-ai`.

---

## Chunk 1: Schema + server-side bug fixes

### Task 1: Schema migration (Todo.meetingId + Meeting.outcomes)

**Files:**
- Modify: `prisma/schema.prisma` (Meeting model ~line 3031, Todo model ~line 1113)
- Create: `prisma/migrations/20260831??????_meeting_todo_link_and_outcomes/migration.sql`

- [ ] **Step 1: Edit `prisma/schema.prisma`.** In `model Meeting`, after the `aiAgendaDraftAt` field add:

```prisma
  /// Completion-time snapshot of meeting outcomes (todos done, issues
  /// solved, rock statuses). Written ONCE when the meeting completes so
  /// past meetings stop mutating as live data changes. Null = legacy
  /// meeting; the UI falls back to live computation.
  outcomes Json?

  todos Todo[]
```

In `model Todo`, after `surveyId`/`survey` fields add:

```prisma
  /// Meeting this todo was created in (IDS create-todo, To-Do Review
  /// quick-add). SetNull so deleting a mis-started meeting never
  /// destroys todos.
  meetingId String?
  meeting   Meeting? @relation(fields: [meetingId], references: [id], onDelete: SetNull)
```

Add `@@index([meetingId])` alongside Todo's existing indexes.

- [ ] **Step 2: Author the migration WITHOUT touching any DB.**

```bash
cd /Users/jaydenkowaider/Developer/amana-eos-dashboard/.claude/worktrees/eos-meetings-ai
git show HEAD:prisma/schema.prisma > /tmp/schema-before.prisma
mkdir -p prisma/migrations/$(date -u +%Y%m%d%H%M%S)_meeting_todo_link_and_outcomes
npx prisma migrate diff --from-schema-datamodel /tmp/schema-before.prisma --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/<that-dir>/migration.sql
```

Expected SQL: `ALTER TABLE "Todo" ADD COLUMN "meetingId" TEXT;`, `ALTER TABLE "Meeting" ADD COLUMN "outcomes" JSONB;`, a `CREATE INDEX "Todo_meetingId_idx"`, and an `ADD CONSTRAINT "Todo_meetingId_fkey" ... ON DELETE SET NULL`. Verify by reading the file — nothing destructive, no other tables.

- [ ] **Step 3: Regenerate the client and typecheck.**

Run: `npx prisma generate && npx tsc --noEmit 2>&1 | head -30`
Expected: generate succeeds; no NEW type errors (pre-existing errors, if any, noted and left alone).

- [ ] **Step 4: Commit** — `git add -A prisma && git commit -m "feat(schema): Todo.meetingId link + Meeting.outcomes snapshot"`

### Task 2: Shared rock-progress helper + bulk-actions fixes

**Files:**
- Create: `src/lib/todos/recompute-rock-progress.ts`
- Modify: `src/app/api/todos/[id]/route.ts:89-103` (use helper)
- Modify: `src/app/api/todos/bulk-actions/route.ts` (soft delete + log + recompute)
- Test: `src/__tests__/lib/recompute-rock-progress.test.ts`, extend `src/__tests__/api/todos-bulk-actions.test.ts` (create if absent)

- [ ] **Step 1: Write failing tests** for the helper (given a prisma client mock: computes `round(completed/total*100)` over non-deleted todos of the rock, 0 when none, updates the rock; `recomputeRocksProgress` handles multiple distinct rock ids) and for bulk-actions (delete → `updateMany` with `{deleted: true}` + one ActivityLog row with ids in details; complete → recompute called for the distinct rockIds of affected todos).

- [ ] **Step 2: Run tests, verify fail** (`npx vitest run src/__tests__/lib/recompute-rock-progress.test.ts src/__tests__/api/todos-bulk-actions.test.ts`).

- [ ] **Step 3: Implement the helper:**

```ts
import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Recompute a Rock's percentComplete from its linked, non-deleted todos.
 * The ONLY place this derivation lives — used by the single-todo PATCH
 * and the bulk complete action so the two paths cannot diverge.
 */
export async function recomputeRockProgress(db: Db, rockId: string): Promise<void> {
  const linked = await db.todo.findMany({
    where: { rockId, deleted: false },
    select: { status: true },
  });
  const total = linked.length;
  const completed = linked.filter((t) => t.status === "complete").length;
  const percentComplete = total > 0 ? Math.round((completed / total) * 100) : 0;
  await db.rock.update({ where: { id: rockId }, data: { percentComplete } });
}

export async function recomputeRocksProgress(db: Db, rockIds: Array<string | null>): Promise<void> {
  const distinct = [...new Set(rockIds.filter((id): id is string => !!id))];
  for (const rockId of distinct) {
    await recomputeRockProgress(db, rockId);
  }
}
```

- [ ] **Step 4: Swap `src/app/api/todos/[id]/route.ts` lines 90-103** to `if (parsed.data.status !== undefined && todo.rockId) await recomputeRockProgress(prisma, todo.rockId);` (import the helper; delete the inline block).

- [ ] **Step 5: Fix `src/app/api/todos/bulk-actions/route.ts`.** Change the validation select to `select: { id: true, rockId: true }`. Then:
  - `complete`: after the `updateMany`, `await recomputeRocksProgress(prisma, todos.map((t) => t.rockId));`
  - `delete`: replace `deleteMany` with `updateMany({ where: { id: { in: validIds } }, data: { deleted: true } })` and add an ActivityLog entry `{ userId: session!.user.id, action: "bulk_delete", entityType: "Todo", entityId: validIds[0], details: { ids: validIds, count: validIds.length } }`. Also change the initial findMany to filter `deleted: false` so already-deleted rows aren't re-processed.

- [ ] **Step 6: Run tests → pass; run `npx vitest run src/__tests__/api/todos.test.ts` too** (the [id] route refactor must not break existing tests).

- [ ] **Step 7: Commit** — `fix(todos): bulk delete soft-deletes + logs; bulk complete recomputes rock progress`

### Task 3: `isPrivate` enforcement (shared helper, applied 100%)

**Files:**
- Create: `src/lib/todos/private-filter.ts`
- Modify: `src/app/api/todos/route.ts` (GET), `src/app/api/todos/[id]/route.ts` (GET), `src/app/api/search/route.ts` (todo query), `src/app/api/services/[id]/today/route.ts` (todosToday query)
- Test: `src/__tests__/lib/private-todo-filter.test.ts` + extend `src/__tests__/api/todos.test.ts`

- [ ] **Step 1: Sweep for other read surfaces first:** `grep -rn "todo.findMany\|todo.findUnique\|todo.findFirst" src/app/api --include=*.ts | grep -v __tests__`. Classify each hit: routes that already filter to the caller (`assigneeId: userId`) or are non-session surfaces (cron with CRON_SECRET, cowork with API key, internal libs) are exempt — private-todo visibility is a *session-user* concern. Any additional session-scoped org-wide read found joins the list below. Record the sweep result in the commit message.

- [ ] **Step 2: Write failing tests.** Helper unit test: admin roles → `{}` (no clause); non-admin → the OR clause below. Route tests: unrelated `member` role user does NOT receive another user's private todo from GET /api/todos (assert the where clause passed to findMany contains the private AND-clause); assignee/creator/admin variants DO pass a permissive clause.

- [ ] **Step 3: Implement:**

```ts
import type { Prisma } from "@prisma/client";
import type { Session } from "next-auth";

const PRIVATE_EXEMPT_ROLES = new Set(["owner", "head_office", "admin"]);

/**
 * Visibility clause for private todos. Private todos are visible only to
 * the primary assignee, any co-assignee, the creator, and admin-tier
 * roles. Compose with AND into every session-scoped todo read query —
 * never hand-roll this per route (spec 1.7.1).
 */
export function privateTodoWhere(session: Session): Prisma.TodoWhereInput {
  const role = (session.user.role as string) ?? "";
  if (PRIVATE_EXEMPT_ROLES.has(role)) return {};
  const userId = session.user.id as string;
  return {
    OR: [
      { isPrivate: false },
      { assigneeId: userId },
      { assignees: { some: { userId } } },
      { createdById: userId },
    ],
  };
}
```

- [ ] **Step 4: Apply.** In `todos/route.ts` GET, the existing centre filter already uses `where.OR` — compose via `AND` to avoid clobbering: build `const privateClause = privateTodoWhere(session!);` and change the final query construction to `const finalWhere = Object.keys(privateClause).length ? { AND: [where, privateClause] } : where;` (use `finalWhere` in findMany + count). In `todos/[id]/route.ts` GET, after fetching, apply the same rule imperatively: if `todo.isPrivate` and role not exempt and user is not assignee/co-assignee/creator → 404 (include `assignees: { select: { userId: true } }` in the fetch). In `search/route.ts`, spread `...privateTodoWhere(session)` conflicts with its own OR — wrap: `AND: [ { deleted: false, title: filter, ... }, privateTodoWhere(session) ]`. In `services/[id]/today/route.ts`, same `AND` composition on the todosToday query.

- [ ] **Step 5: Run tests → pass. Full todo-related suite:** `npx vitest run src/__tests__/api/todos.test.ts src/__tests__/api/search*.test.ts src/__tests__/lib/private-todo-filter.test.ts` (plus any services-today test file found).

- [ ] **Step 6: Commit** — `fix(todos): enforce isPrivate visibility via shared privateTodoWhere at all read routes`

### Task 4: Recurring-todos due dates match the rule

**Files:**
- Modify: `src/app/api/cron/recurring-todos/route.ts:55-57`
- Test: `src/__tests__/api/cron/recurring-todos.test.ts` (extend or create)

- [ ] **Step 1: Failing test** — a `daily` template produces `dueDate = nextRunAt + 1 day`; `weekly` +7; `monthly` +1 month.
- [ ] **Step 2: Implement** — extract the existing switch into a small pure fn in the route file:

```ts
function addRecurrencePeriod(from: Date, rule: string): Date {
  const d = new Date(from);
  switch (rule) {
    case "daily": d.setDate(d.getDate() + 1); break;
    case "weekly": d.setDate(d.getDate() + 7); break;
    case "fortnightly": d.setDate(d.getDate() + 14); break;
    case "monthly": d.setMonth(d.getMonth() + 1); break;
    case "quarterly": d.setMonth(d.getMonth() + 3); break;
    default: d.setDate(d.getDate() + 7);
  }
  return d;
}
```

Use it for BOTH `dueDate` (`addRecurrencePeriod(template.nextRunAt, template.recurrence)`) and the `nextRun` advance (replacing the inline switch).
- [ ] **Step 3: Tests pass; commit** — `fix(cron): recurring-todo due dates follow the recurrence rule (daily was +7d)`

### Task 5: L10 digest recipient roles

**Files:**
- Modify: `src/app/api/cron/l10-prep-digest/route.ts:247`
- Test: extend the digest's existing test file (find via `ls src/__tests__/api/cron | grep -i l10`; create if absent)

- [ ] **Step 1: Failing test** asserting the user findMany where-role list equals `["owner", "head_office", "admin", "member", "eos", "eos_implementer"]`.
- [ ] **Step 2: Change line 247** to `role: { in: ["owner", "head_office", "admin", "member", "eos", "eos_implementer"] },` with a comment: `// 2026-08-31: head_office/eos/eos_implementer added — the old list predated those roles. eos_viewer (read-only) + marketing + staff stay excluded.`
- [ ] **Step 3: Tests pass; commit** — `fix(cron): include head_office/eos/eos_implementer in L10 prep digest`

## Chunk 2: Meetings — linkage, scheduling, snapshots

### Task 6: `meetingId` on todo create

**Files:**
- Modify: `src/lib/schemas/todo.ts`, `src/app/api/todos/route.ts` (POST), `src/hooks/useTodos.ts` (`useCreateTodo` arg + `TodoData`), `src/components/meetings/ActiveMeetingView.tsx:325-340` (IDS create), `src/components/todos/TodoDetailPanel.tsx` (display)
- Test: extend `src/__tests__/api/todos.test.ts`

- [ ] **Step 1: Failing tests** — POST with valid `meetingId` stores it; POST with unknown `meetingId` → 400.
- [ ] **Step 2:** Schema: add `meetingId: z.string().optional().nullable(),`. POST route: before create, `if (parsed.data.meetingId) { const m = await prisma.meeting.findUnique({ where: { id: parsed.data.meetingId }, select: { id: true } }); if (!m) return 400 "Meeting not found"; }` then `meetingId: parsed.data.meetingId || null` in create data. Hook: add `meetingId?: string | null` to `useCreateTodo`'s arg type and `meetingId: string | null` + `meeting?: { id: string; title: string; date: string } | null` to `TodoData`. GET include: add `meeting: { select: { id: true, title: true, date: true } }` to the shared `include` in `todos/route.ts` and `todos/[id]/route.ts`.
- [ ] **Step 3:** `ActiveMeetingView.handleCreateTodoFromIssue`: add `meetingId: meeting.id` to the `createTodo.mutate` payload.
- [ ] **Step 4:** `TodoDetailPanel`: where rock/issue links render, add a "Created in" row when `todo.meeting` present, linking to `/meetings` and showing `meeting.title · formatDateAU(meeting.date)`.
- [ ] **Step 5: Tests pass; commit** — `feat(todos): meetingId linkage on create + surfaced in detail panel`

### Task 7: Meeting scheduling

**Files:**
- Modify: `src/app/api/meetings/route.ts` (POST), `src/app/api/meetings/[id]/route.ts` (PATCH `action: "start"`), `src/hooks/useMeetings.ts`, `src/components/meetings/StartMeetingDialog.tsx`, `src/components/meetings/MeetingListView.tsx`, `src/app/(dashboard)/meetings/page.tsx`
- Test: `src/__tests__/api/meetings.test.ts` (extend/create)

- [ ] **Step 1: Failing route tests** — POST with `scheduledFor` → 201 `status: "scheduled"`, `startedAt: null`, `date` = scheduledFor; POST without → unchanged in_progress behaviour; PATCH `{ action: "start" }` on scheduled → in_progress + startedAt (assert status-guarded `updateMany` used); PATCH start on already-started → 409.
- [ ] **Step 2: POST route:** schema gains `scheduledFor: z.string().datetime().optional()` — reject past dates (before today 00:00) with 400. Create data becomes:

```ts
const scheduledFor = parsed.data.scheduledFor ? new Date(parsed.data.scheduledFor) : null;
// ...
date: scheduledFor ?? new Date(parsed.data.date),
status: scheduledFor ? "scheduled" : "in_progress",
startedAt: scheduledFor ? null : new Date(),
```

- [ ] **Step 3: PATCH route:** add `"marketing"` to the PATCH roles array (`["owner", "head_office", "admin", "marketing", "eos_implementer"]`) with a comment — POST has allowed marketing since 2026-06-03 because the marketing pod runs its own L10, but PATCH never did, so today they can create a meeting they cannot save progress on, and with scheduling they could create a meeting they can never start. Schema gains `action: z.literal("start").optional()`. When present, handle FIRST and return early:

```ts
if (parsed.data.action === "start") {
  const claimed = await prisma.meeting.updateMany({
    where: { id, status: "scheduled" },
    data: { status: "in_progress", startedAt: new Date() },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ error: "Meeting already started or not scheduled" }, { status: 409 });
  }
  const started = await prisma.meeting.findUnique({ where: { id }, include: /* same include as GET */ });
  return NextResponse.json(started);
}
```

- [ ] **Step 4: Hooks:** `useCreateMeeting` data type gains `scheduledFor?: string`; add `useStartMeeting()` mutation (PATCH `{ action: "start" }`, invalidates meetings, `onError` destructive toast, success toast "Meeting started").
- [ ] **Step 5: StartMeetingDialog:** on the attendees step footer, replace the single Start button with a Start-now button plus a "Schedule for later" toggle revealing `<input type="datetime-local">`; `onStart` signature gains `scheduledFor: string | null` (ISO from the picker or null). Wire through `meetings/page.tsx` → `useCreateMeeting`. When scheduling, do NOT auto-open the meeting (stay on the list, toast "Meeting scheduled").
- [ ] **Step 6: MeetingListView:** add an "Upcoming" card above the history list: `meetings.filter(m => m.status === "scheduled")` sorted by date asc, each row showing title/date/creator + a **Start** button (`useStartMeeting`; on success `onSelect(startedMeeting)`) + a Cancel button (`useUpdateMeeting` → `status: "cancelled"`, confirm first). Exclude `scheduled` from the history list filter (it already excludes only `in_progress`; add `scheduled`).
- [ ] **Step 7: Tests pass; typecheck; commit** — `feat(meetings): schedule-for-later + guarded start action`

### Task 8: Outcome snapshots

**Files:**
- Modify: `src/app/api/meetings/[id]/route.ts` (completion branch), `src/components/meetings/MeetingOutcomesPanel.tsx`, `src/hooks/useMeetings.ts` (`MeetingData.outcomes`)
- Test: extend `src/__tests__/api/meetings.test.ts`

- [ ] **Step 1: Failing tests** — completing a meeting writes `outcomes` (todosCompleted from todos completed in window, issuesSolvedIds from issues with solvedAt in window, rock counts, completionPct, avgRating = computed rating, capturedAt); completing an already-completed meeting does NOT overwrite `outcomes`.
- [ ] **Step 2: Implement in the PATCH completion branch** (`parsed.data.status === "completed" && existing.status !== "completed"`), after the rating computation, before the update: compute the snapshot and add `updateData.outcomes = snapshot`:

```ts
const windowStart = existing.startedAt ?? existing.createdAt;
const windowEnd = new Date();
const scope = existing.serviceIds.length > 0 ? { serviceId: { in: existing.serviceIds } } : {};
const attendeeRows = await prisma.meetingAttendee.findMany({ where: { meetingId: id }, select: { userId: true } });
const attendeeIds = attendeeRows.map((a) => a.userId);
const todoWhere = attendeeIds.length > 0
  ? { deleted: false, assigneeId: { in: attendeeIds } }
  : { deleted: false, ...scope };
const [todosCompleted, todosOpen, solvedIssues, rocks] = await Promise.all([
  prisma.todo.count({ where: { ...todoWhere, status: "complete", completedAt: { gte: windowStart, lte: windowEnd } } }),
  prisma.todo.count({ where: { ...todoWhere, status: { in: ["pending", "in_progress"] } } }),
  prisma.issue.findMany({ where: { deleted: false, status: "solved", solvedAt: { gte: windowStart, lte: windowEnd }, ...scope }, select: { id: true } }),
  prisma.rock.findMany({ where: { deleted: false, quarter: getCurrentQuarter(), ...scope }, select: { status: true } }),
]);
const todosTotal = todosCompleted + todosOpen;
updateData.outcomes = {
  todosCompleted,
  todosTotal,
  completionPct: todosTotal > 0 ? Math.round((todosCompleted / todosTotal) * 100) : 0,
  issuesSolvedIds: solvedIssues.map((i) => i.id),
  rocksOnTrack: rocks.filter((r) => r.status === "on_track" || r.status === "complete").length,
  rocksTotal: rocks.length,
  avgRating: (updateData.rating as number | undefined) ?? existing.rating ?? null,
  capturedAt: windowEnd.toISOString(),
};
```

Guard the whole block with `&& !existing.outcomes` (the status-transition check alone is NOT write-once — a meeting PATCHed back to `in_progress` and re-completed would overwrite the snapshot). `todoWhere` deliberately mirrors the in-meeting candidate list (`ActiveMeetingView`'s memo): attendee filter when attendees exist, service-scope fallback otherwise — do NOT also AND service scope onto the attendee branch; the UI doesn't. Import `getCurrentQuarter` from `@/lib/utils`.
- [ ] **Step 3: Panel:** add `outcomes?: MeetingOutcomes | null` to `MeetingData` (type the shape). In `MeetingOutcomesPanel`, when `meeting.outcomes` exists use its numbers (todosDone/todosTotal/rocksOnTrack/rocksTotal/`issuesSolvedIds.length`/avgRating); else keep the current live fallback.
- [ ] **Step 4: Tests pass; commit** — `feat(meetings): write-once outcome snapshot on completion`

## Chunk 3: UI capture + AI prep consolidation

### Task 9: To-Do Review capture surface

**Files:**
- Modify: `src/components/meetings/TodoReviewSection.tsx`, `src/components/meetings/ActiveMeetingView.tsx` (props wiring)

- [ ] **Step 1:** Extend `TodoReviewSection` props: `attendees` (`MeetingAttendee[] | undefined`), `users` (fallback assignee list, same `users` already fetched in ActiveMeetingView), `onQuickAdd?: (data: { title: string; assigneeId: string; dueDate: string }) => void`, `onReassign?: (id: string, assigneeId: string) => void`, `onRedate?: (id: string, dueDate: string) => void`, `isCompleted: boolean`, `lastMeetingId?: string | null`.
- [ ] **Step 2:** Quick-add row (hidden when `isCompleted`): title input + assignee `<select>` (present attendees first, then remaining users) + date input defaulting to +7 days + Add button (disabled without title/assignee). Calls `onQuickAdd`.
- [ ] **Step 3:** Each row (when not completed): swap the static assignee name for a compact `<select>` (onChange → `onReassign`) and add a date input (defaultValue from `todo.dueDate`, onChange → `onRedate`). Keep the complete-toggle as is. Add a `from last meeting` `text-2xs` badge when `todo.meetingId && todo.meetingId === lastMeetingId`.
- [ ] **Step 4:** In `ActiveMeetingView`: `lastMeetingId` needs the previous completed meeting — compute from a lightweight `useMeetings({ status: "completed", limit: 20 })` already-cached list is NOT available here; instead pass it down from `meetings/page.tsx` (it holds the full list): previous completed meeting matching `isLeadership` flag AND overlapping `serviceIds` (both empty counts as overlap — org-wide), most recent by date. Wire handlers: `handleQuickAddTodo` → `createTodo.mutate({ title, assigneeId, dueDate, weekOf: getWeekStart().toISOString(), meetingId: meeting.id, serviceId: meetingServiceIds.length === 1 ? meetingServiceIds[0] : undefined })`; `handleReassign` / `handleRedate` → `updateTodo.mutate`. `TodoData` needs `meetingId` (added in Task 6).
- [ ] **Step 5:** Typecheck + manual smoke via dev server (start meeting → add todo in section 5 → appears with meetingId; reassign; re-date). Commit — `feat(meetings): To-Do Review becomes a capture surface`

### Task 10: AI prep consolidation

**Files:**
- Modify: `src/components/meetings/MeetingListView.tsx` (remove AiButton path), `prisma/seed.ts:~2355` (deactivate template)

- [ ] **Step 1:** In `MeetingListView`: delete the `aiPrep` state, the `aiPrepVariables` memo, the `useTodos/useRocks/useScorecard/useIssues` imports+hooks (now unused there), the `AiButton` import/usage and the purple render block. Replace the PageHeader child with a plain Button "AI Prep" that: picks `activeMeeting ??` soonest upcoming scheduled meeting; if none → toast "Start or schedule a meeting first, then AI Prep can brief it."; else `prepareMeeting.mutate(meeting.id)` (`usePrepareMeeting`) and `onSelect(meeting)` on success (the persisted draft renders via the existing `AiAgendaPanel` inside the meeting). Show pending state on the button.
- [ ] **Step 2:** In `prisma/seed.ts`, find the `meetings/l10-prep` template upsert and set `active: false` in BOTH create and update payloads, comment: `// 2026-08-31: superseded by the persisted aiAgendaDraft path (POST /api/meetings/[id]/prepare). Deactivated, not deleted — the generate route 410s inactive slugs.`
- [ ] **Step 3:** `grep -rn "meetings/l10-prep" src/` → only seed + none in components. Typecheck. Commit — `refactor(meetings): single persisted AI-prep path; deactivate ephemeral template`

### Task 11: Verification + PR

- [ ] **Step 1:** `npm run lint` → no new warnings in touched files.
- [ ] **Step 2:** `npm test` → full unit suite green (4,200+ tests).
- [ ] **Step 3:** `npm run build` → succeeds (pre-existing prerender bailouts on `/settings/seed`, `/admin/ai-drafts`, `/roster/swaps` are known and acceptable).
- [ ] **Step 4:** Dev-server smoke of the meeting flow (schedule → start → quick-add todo → complete → outcomes snapshot renders).
- [ ] **Step 5:** Push branch, open PR titled `feat(eos): meetings/todos foundation — linkage, scheduling, snapshots, isPrivate + bulk fixes` with spec link. Body lists the 5 bug fixes explicitly.
