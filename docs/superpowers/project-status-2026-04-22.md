# Amana EOS Dashboard — Project Status

**Snapshot taken:** 2026-04-22
**Branch under review:** `main` (origin at `6fefa69`)
**Snapshot author:** Codebase review after Sub-project 6 merge

---

## Executive summary

The April 2026 dashboard bug-fix + feature-completion roadmap is **~95% complete**. 9 of 10 original sub-projects have merged. Only **Sub-project 8b** (AI drafts dashboard + meetings/onboarding decomposition + zero-test module coverage) remains outstanding.

### Headline numbers

| Metric | Snapshot | Since 2026-04-20 |
|---|---|---|
| Tests passing | **1823** (+ 3 skipped) | +525 new tests (+40%) |
| tsc errors | **0** | 0 |
| Commits on main | 156 since 2026-04-20 | — |
| PRs merged | 25 (feature PRs: 21–25 post-P0) | — |
| Build (`npm run build`) | Clean | — |
| ESLint on new code | Clean | — |

---

## Original roadmap — completion status

Roadmap doc: [`docs/superpowers/specs/2026-04-20-dashboard-bugfix-roadmap.md`](./specs/2026-04-20-dashboard-bugfix-roadmap.md)

| # | Sub-project | PR | Merge commit | Status |
|---|---|---|---|---|
| 0 | Investigation | — | — | ✅ Done (pre-session) |
| 1 | P0 Visible Bug Batch | — | `dd0a1d9` | ✅ Shipped |
| 2 | Hygiene Sweep | — | `2ca8289` | ✅ Shipped |
| 3a | Staff — Profile + Compliance | — | `39164df` | ✅ Shipped |
| 3b | Staff — Rostering | — | `38fd0b2` | ✅ Shipped |
| 5 | Documents / Policies / Compliance | #16 | `c3cf585` | ✅ Shipped |
| 7 | Portal & Enrolment Flow (OWNA CSV + E2E) | #15 | — | ✅ Shipped |
| 9 | Scorecard / Contact Centre / Leadership / Pulse | — | — | ✅ Shipped |
| 4a | Services / Daily Ops Part 1 (OWNA-depth rebuild) | #21 | `884ef6b` | ✅ Shipped |
| 8a | Report Issue admin inbox (P0 roadmap gap) | #22 | `07bfc03` | ✅ Shipped |
| 4b | Services / Daily Ops Part 2 (enforcement + filters + inline edit) | #23 | `e1b5642` | ✅ Shipped |
| — | UTC date-parse follow-up fix | #24 | `b336ad0` | ✅ Shipped |
| 6 | Contracts + Recruitment Rebuild | #25 | `6fefa69` | ✅ Shipped |
| **8b** | AI drafts dashboard + decompositions + zero-test coverage | — | — | **🚧 Outstanding** |

---

## What shipped in the most recent wave (PRs #21–#25)

### #21 — Sub-project 4a (Services Part 1)
OWNA-depth rebuild for Services module. 13 stacked commits covering: Service approval numbers + session times + casual-booking-settings schema, Child Medicare/vaccination schema, Overview tab display + decomposition (1467 → 7 focused children, parent 246 lines), Roll Call daily/weekly/monthly URL-synced toggle, 3 new roll-call APIs, editable weekly grid with sign-in/out + add-child dialog (memoized 300-cell grid), monthly calendar with per-day drill-down, new full-page `/children/[id]` with 5 tabs (Details / Room-Days / Relationships / Medical / Attendances + CSV export), children list filters + parent display + CCS badge, Casual Bookings settings tab (settings-only), Today promoted to default-landing tab. **+319 tests**.

### #22 — Sub-project 8a (Report Issue admin inbox)
Closed the "silent black hole" roadmap P0. New `/admin/feedback` route with list + detail + status workflow + admin notes. Slack webhook notification on new submission (AbortController + 3s timeout + fire-and-forget). `POST /api/internal-feedback` rate-limited to 5/min/user. Playwright E2E proves submit → inbox → resolve round-trip. **+44 tests**.

### #23 — Sub-project 4b (Services Part 2)
Follow-ups flagged during 4a. 9 commits: Child.ccsStatus + room + tags schema (with indexes), `/api/children` filters wired end-to-end, `getServiceScope` widened to cover coordinator + marketing (with 21-route audit decision table in `2026-04-22-services-daily-ops-4b-scope-audit.md`), casual booking enforcement in parent-portal POST routes (5 failure modes + serializable transaction race test), `POST /api/attendance/roll-call/bulk` transactional multi-row endpoint, AddChildDialog switched to bulk, inline edit on RelationshipsTab (secondary + emergency + pickup, admin/coord only), `authorisedPickupSchema` hoisted + max-range guard on child-attendances. **+80 tests**.

### #24 — Attendance UTC date-parse fix
Small follow-up: roll-call routes parse YYYY-MM-DD as UTC (not local TZ) so Australian timezone + Neon UTC storage don't drift a day on DST boundaries.

### #25 — Sub-project 6 (Contracts + Recruitment)
10 commits: `contracts/page.tsx` decomposed (1148 → 208 lines) into 9 focused components with smoke-snapshot zero-drift lock, signed contract PDF upload via Vercel Blob, contract acknowledge → onboarding seed wire-up (config-mapped with 3-step fallback and duplicate-safe unique constraint), Contracts tab on `/staff/[id]` (admin-only, double-gated), sidebar feature gate for `/contracts` via new `filterNavItems` helper, AI candidate screening (`vi.mock("@/lib/ai")` test seam, 5/min/admin rate limit), CandidateDetailPanel with optimistic stage updates + 2s-debounced notes auto-save, Staff Referrals tab + Mark Bonus Paid workflow at `/recruitment?tab=referrals`, role-enforcement wiring for `contracts.edit` + `recruitment.view/edit/candidates.manage` on 13 mutation routes. **+74 tests**.

---

## What's left

### 🚧 Sub-project 8b — AI / Queue / Onboarding / Meetings / Issues (follow-up)

**Spec:** [`docs/superpowers/specs/2026-04-22-ai-queue-ops-8-design.md`](./specs/2026-04-22-ai-queue-ops-8-design.md) (covers both 8a and 8b; 8a shipped)
**Plan:** Not yet written (8a plan exists at `2026-04-22-ai-queue-ops-8a-plan.md`)
**Est. commits:** 10 (Commits 5–14 per the shared spec)

**Scope:**

1. **AI drafts admin dashboard** (`/admin/ai-drafts`) — single view of all pending drafts across todos / marketing / cowork / tickets / issues, bulk approve/dismiss, reuses existing `AiDraftReviewPanel`
2. **Meetings page decomposition** — extract `meetings/page.tsx` (currently **2706 lines**) into ~8 section components (MeetingHeader, SegueSection, ScorecardReview, RocksReview, TodosReview, IssuesReview, ConcludeSection, MeetingTimer)
3. **Onboarding page decomposition** — extract `onboarding/page.tsx` (currently **1667 lines**) into ~5 tab components (OnboardingPacksTab, AssignmentsTab, LMSCoursesTab, ExitSurveyTab, WelcomeTourTab)
4. **Queue "All Queues" filter** — admin-wide view toggle
5. **Issues Kanban polish** — surface `spawnedTodos` count on cards
6. **Test coverage for zero-test modules** — queue, onboarding, meetings, issues, internal-feedback all have 0 tests today. Target: ~80 new tests across these 5 modules (401 / 400 / 403 / 404 / 200 matrix per API + smoke tests per decomposed component).

**No schema changes.** Entirely additive feature work + refactor + tests.

**Biggest risks:**
- Meetings decomposition from 2706 lines is the largest single-file change in the roadmap. Risk of subtle regressions in L10-meeting flow (headlines, rocks review, IDS, cascade). Mitigation: smoke snapshot before extraction + run full test suite after each section extracted.
- Onboarding decomposition similar scope.

**Ready to kick off.** Same session prompt pattern as before; spec exists.

---

## Deferred / catalogued for future roadmap

These surfaced during 4a–6 execution as "out of scope" or flagged risks. **None block 8b.** They form the backlog for a potential "Post-Roadmap Stabilization + OWNA Retirement" roadmap.

### From 4a's out-of-scope list
- Incidents tab on Services (new surface)
- Photo gallery / parent daily feed
- SSE / real-time updates on roll-call grid
- Further decomposition of `ProgramTab` / `AttendanceTab` / `BudgetTab`

### From 6's out-of-scope list
- DocuSign / Adobe Sign integration (currently manual PDF upload)
- Candidate video interview scheduling
- Applicant-facing portal (candidate login + status tracking)
- Interview kit / scoring rubric
- Background check integration (state police API)
- Contract auto-renewal reminders
- Recruitment offer-letter generation from templates

### From 8's out-of-scope list (post-8b)
- Feedback-to-ticket conversion (Jira / internal ticket link)
- AI drafts daily email digest
- Meetings template editor
- Onboarding pack template wizard
- AI-generated meeting notes
- Issues AI suggestions

### Strategic / non-sub-project items
- **OWNA retirement migration** — the overarching long-term goal. Post-4a/4b, the dashboard has enough depth (rolls, children, attendance, enrolment, casual bookings with enforcement) to start cutting over services one-by-one. Needs its own multi-phase plan.
- **Decisions logging system** — already running via daily cron (9am)
- **AI Task Agent** — running via hourly cron

### Cron jobs deferred
- `StaffReferral` expiry cron (6 follow-up, explicitly deferred per spec Implementation notes)

### Hygiene debt surfaced but not in 8b
- 128+ API routes still bypass `parseJsonBody()` (original hygiene audit finding; Sub-project 2 covered the highest-traffic routes)
- 6 crons lack `acquireCronLock()` (same)
- 11 mutations missing `onError` toasts (surfaced in original investigation; partial fix in Sub-project 2)
  - Note: much of this was addressed during 4a–6 execution for touched files

---

## Codebase snapshot

### Test distribution
- **1823 tests** across ~170 test files
- Zero-test modules (all targets for 8b): `queue/`, `onboarding/`, `meetings/`, `issues/`
- Playwright E2E: 7 specs including new `weekly-roll-call.spec.ts` (4a) + `feedback-widget.spec.ts` (8a)

### Schema state
- 8 new Service + Child columns from 4a (approval numbers, session times, casual settings, Medicare, vaccination)
- 3 new Child columns from 4b (ccsStatus, room, tags)
- 1 new StaffReferral column from 6 (lastReminderAt)
- All additive; no destructive migrations in roadmap

### Architectural invariants (preserved across roadmap)
- Every authenticated API route wraps in `withApiAuth`
- Zod validation at every POST / PATCH boundary
- `ApiError.badRequest` / `.forbidden` / `.notFound` / `.conflict` for error returns
- `prisma.$transaction` for multi-row writes (bulk attendance, bookingPrefs merge, referral payouts)
- UTC-safe date math (`setUTCDate` / `setUTCMonth` / `Date.UTC`) — hardened in 4a + #24 fix
- `Prisma.InputJsonValue` for JSON writes (never `as any`)
- `mutateApi` / `fetchApi` client-side (except Vercel Blob uploads that require FormData)
- Every `useMutation` has `onError` destructive toast
- Every `useQuery` has `retry: 2` + `staleTime: 30_000`
- `canAccessPage` + middleware use the same role-permissions source of truth
- `getServiceScope` covers all 7 roles after 4b widening

### Pages decomposed during roadmap
| Page | Before | After |
|---|---|---|
| `ServiceOverviewTab.tsx` (4a) | 1467 lines | 246 lines + 8 focused children |
| `contracts/page.tsx` (6) | 1148 lines | 208 lines + 9 focused children |
| `meetings/page.tsx` (8b target) | **2706 lines** | TBD |
| `onboarding/page.tsx` (8b target) | **1667 lines** | TBD |

### Feature flag / role surface
- 7 roles: owner, head_office, admin, marketing, coordinator, member, staff
- `rolePageAccess` covers all new pages from roadmap (`/children/[id]`, `/admin/feedback`, Contracts tab on `/staff/[id]`)
- `roleFeatures` extended: `contracts.edit`, `recruitment.view`, `recruitment.edit`, `recruitment.candidates.manage`

---

## Recommended next actions

1. **Kick off Sub-project 8b** in a fresh session using the existing spec. Prompt template:

   ```
   Execute Sub-project 8b for amana-eos-dashboard at /Users/jaydenkowaider/Developer/amana-eos-dashboard.

   Spec: docs/superpowers/specs/2026-04-22-ai-queue-ops-8-design.md (Commits 5-14 only — 1-4 shipped as 8a in PR #22)
   Target plan: docs/superpowers/plans/2026-04-22-ai-queue-ops-8b-plan.md

   Baseline: origin/main at 6fefa69 (all of 4a/4b/6/8a merged), 1823 tests, 0 tsc errors.
   Branch: feat/ai-queue-ops-8b-2026-04-22 off local main.
   Worktree: .worktrees/ai-queue-ops-8b/

   Flow: superpowers:writing-plans → subagent-driven-development → PR.
   No migration required.

   Full autonomy per MEMORY.md. Work to completion.
   ```

2. **Once 8b merges, declare the April 2026 roadmap complete.** All 10 sub-projects shipped.

3. **After a 1–2 week production burn-in**, start planning the next roadmap. Recommended headline items:
   - OWNA retirement migration (multi-phase, high value)
   - DocuSign / signing integration (completes the Contracts module)
   - Parent portal Pt 2 (photo gallery + daily feed + SSE real-time updates)

4. **Hygiene debt catch-up** (can run in parallel with any of the above) — finish the Sub-project 2 work on the long-tail routes that weren't touched during feature sub-projects:
   - Grep remaining `parseJsonBody` bypasses (non-hot-path routes)
   - Remaining crons without `acquireCronLock`
   - Stray `as Role` / `as any` in non-touched files

---

## Session-session context

**User preference:** Work to completion; skip "decision on your behalf" callouts; trust granted. Migration SQL is applied manually to Neon by the user via `neon-apply.sql` artefacts (no `prisma migrate deploy` in prod).

**Database:** Neon Postgres (`ep-green-breeze-angq0yoa.c-6.us-east-1.aws.neon.tech`). `_prisma_migrations` records synced post-apply.

**Deployment:** Vercel on push to main. Every PR has a preview deploy.

**CI:** Unit + Integration tests run on every PR (E2E skipped in CI; run locally when touched).

---

*Status doc committed at roadmap 95% complete. Next action: kick off 8b.*
