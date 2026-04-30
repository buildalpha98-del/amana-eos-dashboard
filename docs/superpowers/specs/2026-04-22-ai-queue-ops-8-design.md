# Sub-project 8 — AI / Queue / Onboarding / Meetings / Issues / Report Issue inbox

**Date**: 2026-04-22
**Status**: Approved (pre-written for parallel execution — brainstorming skipped by user preference)
**Parent roadmap**: [`2026-04-20-dashboard-bugfix-roadmap.md`](./2026-04-20-dashboard-bugfix-roadmap.md)
**Predecessors**: #1 P0 Bugs, #2 Hygiene Sweep, #3a/3b Staff, #5 Documents, #7 Portal/Enrolment, #9 Leadership, #4a Services

## Overview

Six-module sub-project focused on **admin visibility + test hygiene** across the back-of-house surfaces. Each module already exists and functions; this sub-project closes visibility gaps, ships the missing Report Issue admin inbox, and brings test coverage to zero-test modules. Lighter schema footprint than 4a/4b — most work is UI + routing.

### Priorities (roadmap-ordered)

1. **Report Issue admin inbox** (Tier 1 critical gap — roadmap investigation #0 flagged this as "silent black hole"). Staff submit feedback via the existing floating `FeedbackWidget`; today it saves to `InternalFeedback` but there's no admin UI to triage, no notifications, no status workflow. Build the inbox.
2. **AI draft admin dashboard** — AI task drafts are currently only visible per-task (inside the source task's review panel). Admin needs a single dashboard to see all pending drafts across todos / marketing tasks / cowork / tickets / issues; approve / dismiss / edit in bulk.
3. **Zero-test modules** — queue, onboarding, meetings, issues, internal-feedback all have 0 test files. Ship the minimum "happy path + auth + validation" route tests for each (these modules have been in production for 3+ months; untested surfaces are a reliability bet).
4. **Minor module polish** (from roadmap + 3a/3b reviewer feedback):
   - Meetings page is 105 KB — decompose into sections (agenda, headlines, scorecard review, rocks review, todos, issues, conclude/cascade).
   - Onboarding page is 85 KB — extract each tab into its own component.
   - Queue: add an "All Queues" filter to let admin see ops reports across all services at once.
   - Issues: surface `spawnedTodos` count on the Kanban card (currently hidden).

## Baseline

- 1617+ tests, 0 tsc errors (after 4a merge)
- `InternalFeedback` model exists with full status workflow (new/acknowledged/in_progress/resolved) — unused today
- `FeedbackWidget` component renders globally (bottom-right float)
- `AiTaskDraft` model polymorphic (todo/marketingTask/cowork/ticket/issue)
- Queue page renders per-service ops reports
- Meetings page is 105 KB (~2500 lines) single-file
- Onboarding page is 85 KB (~2000 lines) single-file
- 0 tests across queue / onboarding / meetings / issues / internal-feedback

## In scope — stacked commits

| # | Commit subject | Category | Files (approx.) |
|---|---|---|---|
| 1 | `feat(feedback): /admin/feedback inbox page + list API` | Feature | ~5 |
| 2 | `feat(feedback): detail panel + status workflow + admin notes` | Feature | ~4 |
| 3 | `feat(feedback): Slack notification on new feedback submission` | Feature | 2 |
| 4 | `test(feedback): coverage for InternalFeedback GET/POST + new PATCH route` | Testing | 2 |
| 5 | `feat(ai): /admin/ai-drafts dashboard — all drafts one view` | Feature | ~5 |
| 6 | `feat(ai): bulk approve/dismiss on dashboard` | Feature | 2 |
| 7 | `refactor(meetings): decompose page.tsx into section components` | Hygiene | ~8 |
| 8 | `test(meetings): route + hook + section-component coverage` | Testing | ~5 |
| 9 | `refactor(onboarding): decompose page.tsx into tab components` | Hygiene | ~6 |
| 10 | `test(onboarding): packs + assignments + LMS route coverage` | Testing | ~4 |
| 11 | `feat(queue): All Queues filter for admin-wide view` | Feature | 2 |
| 12 | `test(queue): report + todo route coverage` | Testing | 2 |
| 13 | `feat(issues): surface spawnedTodos count on Kanban card` | UI | 2 |
| 14 | `test(issues): route + hook coverage` | Testing | 2 |

~14 commits. Larger than 4a/4b/6 in commit count but smaller per-commit (mostly ~100-200 line changes).

## Key design decisions

### Report Issue admin inbox (Commits 1–4)

**Location**: `/admin/feedback` (new route under existing `(dashboard)/admin/` namespace). Admin-only via `rolePageAccess` (owner/head_office/admin).

**List page** (`src/app/(dashboard)/admin/feedback/page.tsx`):
- Filters: status (new / acknowledged / in_progress / resolved), category (bug / feature_request / question / general), author
- Columns: date, author, category badge, status badge, page (click to open), preview of message (first 80 chars)
- Pagination: 50 per page

**Detail panel** (right-side slide-in):
- Author info (name + role + service)
- Full message + screenshot (if present)
- Page URL (click to open)
- Status dropdown (with optimistic update + audit log entry)
- Admin notes textarea (autosaves, 2s debounce)
- "Resolve" + "Mark in-progress" buttons
- Activity: status change timeline

**New PATCH route** (`/api/internal-feedback/[id]`):
- Validates `status` enum + `adminNotes` string
- Admin-only (owner/head_office/admin)
- On status change: records to `activityLog` with `actor = session.user.id`
- Returns updated feedback

**Slack notification** (Commit 3):
- On `POST /api/internal-feedback` (existing route): after creating, fire-and-forget webhook to `SLACK_INTERNAL_FEEDBACK_WEBHOOK_URL` env var.
- Message format: `🐛 New {category} from {authorName} ({role}): "{first 100 chars of message}…" — /admin/feedback/{id}`
- No-op if env var absent (local dev).
- Opt-in: env var is optional; graceful degrade.

Tests: 10+ cases covering list (filters, pagination, auth), detail PATCH (auth, status enum, notes max-length, optimistic ID mismatch 404), Slack webhook call format.

### AI drafts admin dashboard (Commits 5–6)

**Location**: `/admin/ai-drafts` (new page, admin-only).

**List view**:
- Columns: created date, task type (badge), title, source (todo / marketing / etc. with link to source), reviewer (if any), status (ready / accepted / edited / dismissed), preview (truncated content)
- Filter by: status, task type, source type
- Default filter: `status=ready` (only drafts awaiting review)

**Bulk operations** (Commit 6):
- Checkbox column
- "Approve selected" / "Dismiss selected" buttons
- Confirmation modal on bulk action
- Transactional: `prisma.$transaction([...updates])` so either all-or-nothing

**Re-uses** existing `AiDraftReviewPanel` component (slide-in) for per-row detail/edit.

### Meetings decomposition (Commit 7)

Source: `src/app/(dashboard)/meetings/page.tsx` (~105 KB).

Extract to `src/components/meetings/`:
- `MeetingHeader.tsx` (title, date, attendees)
- `SegueSection.tsx` (headlines + personal/business check-in)
- `ScorecardReview.tsx` (measurables grid)
- `RocksReview.tsx`
- `TodosReview.tsx`
- `IssuesReview.tsx` (IDS — identify/discuss/solve)
- `ConcludeSection.tsx` (cascade messages, ratings)
- `MeetingTimer.tsx` (existing timer logic)

Parent reduces to ~400 lines of orchestration. Preserve every existing behaviour; pre-existing manual test flows confirm parity.

### Onboarding decomposition (Commit 9)

Source: `src/app/(dashboard)/onboarding/page.tsx` (~85 KB).

Extract to `src/components/onboarding/`:
- `OnboardingPacksTab.tsx`
- `AssignmentsTab.tsx`
- `LMSCoursesTab.tsx`
- `ExitSurveyTab.tsx`
- `WelcomeTourTab.tsx` (if separate)

Parent reduces to ~250 lines of tab routing.

### Queue "All Queues" filter (Commit 11)

On `/queue` page, add a toggle at top: "My Queue" (default — scoped to user's service) vs "All Queues" (admin only — shows reports across all services). Already exists per 3/26 session notes; this commit extends the admin view with a per-service column for grouping.

### Issues Kanban polish (Commit 13)

On `IssueCard.tsx`, add a small pill below title showing `{N} spawned todos` if `spawnedTodos.length > 0`. Click pill → opens detail panel with `spawnedTodos` list visible. Minor UX improvement.

### Test strategy

Per-module test file outline (bare minimum — more is welcome):
- **Route tests**: auth (401), validation (400), happy path (200/201), not-found (404), role-based (403)
- **Hook tests**: existing ones in `src/hooks/*.test.ts` if any — extend; otherwise skip
- **Component tests**: the decomposed children (MeetingHeader, ScorecardReview, etc.) — smoke tests confirm render + key interactions

Target: ~80 new tests across these 5 modules. Meetings + onboarding get deepest coverage (10+ tests each) since they're the largest surfaces.

## Schema changes

**None.** All commits consume existing models:
- `InternalFeedback` (unchanged — status workflow already declared)
- `AiTaskDraft` (unchanged)
- `Meeting` / `OnboardingPack` / `StaffOnboarding` / etc. (unchanged)

No migration needed. Zero-risk rollback at DB layer.

## Implementation notes (spec-reviewer tightenings)

- **Split into two PRs.** 14 commits is too big for one review. Ship as **PR-8a** (Commits 1-4: Report Issue admin inbox — the P0 gap) + **PR-8b** (Commits 5-14: AI dashboard + decompositions + test coverage). Both can queue in parallel; 8a is smaller + time-critical (roadmap flagged it as "silent black hole").
- **Slack webhook error mode.** Use `AbortController` with 3-second timeout + single retry → then log and drop. No blocking the response. Example:
  ```ts
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 3000);
  try { await fetch(url, { method: "POST", body, signal: ctrl.signal }); }
  catch (err) { logger.warn("Slack feedback webhook failed", { err }); }
  finally { clearTimeout(t); }
  ```
- **Rate limit on POST /api/internal-feedback.** Explicit Commit 3 requirement (not a "risk"): `withApiAuth({ rateLimit: { max: 5, windowMs: 60_000 } })`. Tested via rapid-fire requests → 6th returns 429.
- **Bulk AI draft cap.** Zod validation `z.array(z.object(...)).max(20)`; over-cap submissions get 400 "Max 20 drafts per batch". Tested.
- **E2E test for feedback flow.** Add one Playwright test to Commit 4: submit via widget → admin visits inbox → status transitions to resolved → audit log entry exists. Catches integration regressions the unit tests miss.
- **Decomposition discipline (Commits 7, 9).** For each extracted section: run the full test suite before/after, and record before/after line counts in the commit body. Any diff > 1000 lines per commit should split further.
- **Naming.** Route: `/admin/feedback`. Sidebar label: "Feedback Inbox". Page title: "Report Issue Inbox". Roadmap text "Report Issue" refers to the end-user button; route/label/title reflect the admin side.
- **Test count**: ~100 new tests → 1617 baseline + 100 ≈ 1720. Acceptance criterion updated to match the math below.

## Out of scope (defer)

- **Individual user-pulse notifications** for the feedback inbox — belongs in communication sub-project
- **Feedback-to-ticket conversion** — if a bug report should become a Jira / internal ticket, build that link later
- **AI drafts automatic email digest** — admin-daily summary could ship later
- **Meetings template editor** — separate sub-project
- **Onboarding pack template wizard** — separate sub-project
- **AI-generated meeting notes** — separate sub-project
- **Issues AI suggestions** — defer to AI sub-project
- **Queue cross-org rollup dashboard** — exists in sub-project 9 (Leadership)

## Acceptance criteria

- [ ] 14 commits land in two PRs (8a = commits 1-4, 8b = commits 5-14)
- [ ] 1617+ baseline → ~1720 tests (~100 new — largest test addition of any sub-project)
- [ ] 0 tsc errors
- [ ] No Prisma migration needed
- [ ] `/admin/feedback` inbox renders list + detail + status workflow
- [ ] Slack notification fires on new feedback (when env var set)
- [ ] `/admin/ai-drafts` dashboard lists all drafts; bulk approve works
- [ ] Meetings page decomposed into ≥7 section components; parent ≤ 400 lines
- [ ] Onboarding page decomposed; parent ≤ 250 lines
- [ ] Queue "All Queues" admin toggle works across services
- [ ] Issues Kanban shows `spawnedTodos` pill
- [ ] Every previously-zero-test module has ≥10 tests
- [ ] PR body includes before/after table

## Risks

- **Decomposition regressions** — meetings + onboarding are the largest single files in the codebase. Decomposition bugs could quietly break flows. Mitigation: manual smoke-test every section after decomposition; write new tests per section as it's extracted.
- **Slack webhook misconfiguration** — wrong URL logs errors in prod. Mitigation: env var absent = no-op; webhook wrapped in `try/catch` + `logger.warn`; fire-and-forget (doesn't block the response).
- **Bulk AI draft operations** — if 100 drafts are "approved" at once, each writes to its source task. Volume could be high. Mitigation: cap bulk batch at 20 drafts per operation; transaction ensures atomicity.
- **Admin inbox spam** — if a user mashes the feedback button, the admin inbox fills fast. Mitigation: rate-limit `POST /api/internal-feedback` to 5/min/user. Not a new limit — check existing rate-limit config and extend if absent.
- **Test debt backload** — adding 100+ tests is slow. Break up if needed: ship inbox tests with Commit 4; meetings/onboarding/queue/issues test commits can merge in sequence without blocking the features.

## Rollback

No schema changes → worst case is whole-PR revert: inbox route disappears, decomposed files go back to monolith, tests vanish. Everything else keeps working. Each feature commit is independently revert-safe.

---

*Plan target: `docs/superpowers/plans/2026-04-22-ai-queue-ops-8-plan.md`.*
