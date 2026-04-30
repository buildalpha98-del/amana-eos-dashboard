# Sub-project 6 — Contracts + Recruitment Rebuild

**Date**: 2026-04-22
**Status**: Approved (pre-written for parallel execution — brainstorming skipped by user preference)
**Parent roadmap**: [`2026-04-20-dashboard-bugfix-roadmap.md`](./2026-04-20-dashboard-bugfix-roadmap.md)
**Predecessors**: #1 P0 Bugs, #2 Hygiene Sweep, #3a/3b Staff modules, #5 Documents, #7 Portal/Enrolment, #9 Leadership, #4a Services

## Overview

Contracts + Recruitment both exist as functional modules with stable data models, but both have UI completeness gaps and missing cross-module wiring. This sub-project closes those gaps:

1. **Contract document upload + signing** — `documentUrl` + `documentId` exist on `EmploymentContract` but no UI uses them. Add file-upload affordance + a "Download signed PDF" button.
2. **Contract → onboarding seed flow** — today, onboarding seeds on User creation. Enhance so acknowledging a contract auto-schedules the matching OnboardingPack (based on contract type / role). Decouples the "hire workflow" from the user-creation moment.
3. **Contracts decomposed + surfaced on `/staff/[id]`** — contracts page is 1 monolithic `page.tsx`. Extract into focused components (`ContractsTable`, `ContractDetailPanel`, `NewContractModal`, `SupersedeModal`). Mirror 3a's `/staff/[id]` tab pattern by adding a "Contracts" tab there (admin-only) showing the staffer's contract history.
4. **Recruitment AI candidate screening UI** — `aiScreenScore` + `aiScreenSummary` fields exist on `RecruitmentCandidate` but are unused. Wire up: AI button on a candidate detail → generates screening summary via existing `useAiGenerate` infrastructure, saves to the candidate record, shows as a badge on the candidate list.
5. **Staff referral bonus payout workflow** — `StaffReferral` model exists with `bonus_paid` status, but no UI to mark it paid. Add a "Referrals" admin view at `/recruitment?tab=referrals` with a "Mark bonus paid" button + payout date picker.
6. **Candidate detail panel improvements** — current `VacancyDetailPanel` lists candidates but doesn't let admin progress stages or add notes inline. Add stage dropdown + notes textarea on candidate rows with optimistic update.
7. **Contracts in sidebar nav** — roadmap investigation flagged that `/contracts` is hidden from nav today. Add it to `nav-config.ts` under "People" section, gated by `contracts.view` feature.

Smaller follow-ups:
8. **Role permissions tidy-up** — current `contracts.edit` feature exists but is never checked in routes. Wire it up on the PATCH endpoint. Also add `recruitment.view` / `recruitment.edit` / `recruitment.candidates.manage` features.
9. **Tests for the 2 modules** — current coverage is 2 test files total; add route tests for recruitment API, component tests for the new contract components.

## Baseline

- 1617+ tests, 0 tsc errors (after 4a / 4b merge)
- `EmploymentContract` model: complete (lifecycle draft → active → superseded/terminated)
- `RecruitmentVacancy` + `RecruitmentCandidate` + `StaffReferral` models: stable
- `src/app/(dashboard)/contracts/page.tsx` — 1 file, ~800+ lines with inline modal/detail markup
- `src/components/recruitment/` — 3 files (VacancyTable, VacancyDetailPanel, NewVacancyModal); no CandidateDetail component
- `src/hooks/useContracts.ts` + `src/hooks/useRecruitment.ts` — hooks exist
- `contracts.*` features exist in role-permissions but not all are enforced in routes
- `/contracts` page NOT in `nav-config.ts` (hidden; admins navigate via URL)
- Onboarding seed fires on User creation (`src/lib/onboarding-seed.ts`) — no hook from contract acknowledge

## In scope — stacked commits

| # | Commit subject | Category | Files (approx.) |
|---|---|---|---|
| 1 | `refactor(contracts): extract ContractsTable + DetailPanel + modals from page.tsx` | Hygiene | ~6 |
| 2 | `feat(contracts): upload + download signed contract PDF` | Feature | ~4 |
| 3 | `feat(contracts): acknowledge-triggers-onboarding-seed wire-up` | Feature | 3 |
| 4 | `feat(staff-profile): Contracts tab on /staff/[id] showing history` | Feature | ~3 |
| 5 | `feat(nav): expose /contracts in sidebar under People (role-gated)` | UI | 2 |
| 6 | `feat(recruitment): AI candidate screening on vacancy detail` | Feature | ~4 |
| 7 | `feat(recruitment): CandidateDetailPanel with inline stage + notes` | Feature | ~4 |
| 8 | `feat(recruitment): Staff Referrals tab + Mark Bonus Paid workflow` | Feature | ~4 |
| 9 | `refactor(auth): wire contracts.edit + add recruitment features` | Reliability | 3 |
| 10 | `test(contracts+recruitment): route + component coverage` | Testing | ~6 |

~10 commits.

## Key design decisions

### Contract extraction (Commit 1)

Source: `src/app/(dashboard)/contracts/page.tsx` (~800+ lines).

Extract to:
- `src/components/contracts/ContractsTable.tsx` (list + filter + search)
- `src/components/contracts/ContractDetailPanel.tsx` (right-side panel with timeline, actions)
- `src/components/contracts/NewContractModal.tsx`
- `src/components/contracts/SupersedeContractModal.tsx`
- `src/components/contracts/TerminateContractDialog.tsx`

Parent `page.tsx` reduces to ~200 lines of composition. No behaviour change; zero-change tests prove decomposition is safe.

### Document upload + signing (Commit 2)

Reuse existing file-upload pattern from `Document` module (3/26 session). Field mapping:
- `documentUrl` — public-ish URL to the signed PDF (pre-signed S3-style link)
- `documentId` — internal `Document` record ID for audit

Flow:
1. Admin creates / supersedes contract → modal has "Upload signed PDF" input (optional until `status = active`).
2. Upload hits `POST /api/documents` (existing route), returns `{ documentId, documentUrl }`.
3. Contract PATCH updates both fields.
4. Detail panel shows "View signed contract" button that opens the PDF in a new tab.
5. Staff acknowledge-button also includes a "Download my contract" link.

File validation: PDF only, max 10MB, virus-scan via existing helper if available (else plain validation).

### Contract → onboarding seed (Commit 3)

New logic in `POST /api/contracts/[id]/acknowledge`:
1. After marking `acknowledgedByStaff = true`:
2. Lookup matching `OnboardingPack` by contract type (e.g. contract of type `casual` → pack named "Casual Onboarding"; fallback to service's default pack if no type-specific match).
3. If the user has no existing `StaffOnboarding` assignment: seed one with due-date `now + 14 days`.
4. Send a notification to the user: "Your onboarding has been scheduled."

Config: map of `contractType → packSlug` lives in `src/lib/contracts/onboarding-mapping.ts`. Easy to edit. Fallback to service default pack if mapping doesn't cover.

Tests: acknowledge creates `StaffOnboarding` with correct pack; doesn't create duplicate if one already exists; service default used when no type match.

### Contracts tab on /staff/[id] (Commit 4)

Mirror `/children/[id]` tab pattern (from 4a). Add:
- New tab key `"contracts"` after existing tabs (details, roster, compliance, etc. — whatever the current `/staff/[id]` tabs are)
- Visible only to admin / head_office / owner (staff don't see other people's contracts; they see their own via `/my-portal` or similar)
- Renders a chronological list of `EmploymentContract` for the user
- Click a contract → same `ContractDetailPanel` as on the main `/contracts` list
- "+ New contract" button if admin

Re-use `useContracts({ userId })` hook signature.

### Nav exposure (Commit 5)

`src/lib/nav-config.ts` — add `/contracts` under "People" section. Gate via `hasFeature("contracts.view")`. This means:
- Everyone with `contracts.view` sees it (currently: owner/head_office/admin/member/staff — tight scope since contract details are personal).

Staff clicking "Contracts" → lands on filtered view showing only their own contracts (existing route already scopes via role).

### Recruitment AI screening (Commit 6)

Reuse AiButton + `useAiGenerate` + `AiDraftReviewPanel` pattern from 3/26 AI infrastructure.

On candidate detail:
- New "AI Screen" button
- Triggers `POST /api/recruitment/candidates/[id]/ai-screen`
- Server calls LLM via existing `src/lib/ai.ts` with a role-specific prompt + the candidate's `resumeText`
- Returns `{ score: 1-10, summary: string }` — stored on candidate (`aiScreenScore`, `aiScreenSummary`)
- UI shows: score badge on candidate list + expandable summary on detail

Prompt template lives in `src/lib/recruitment/ai-screen-prompt.ts`. Tests mock the LLM call.

### Candidate detail panel (Commit 7)

New `CandidateDetailPanel` component:
- Header: name, email, phone, source
- Stage dropdown (applied → screened → interviewed → offered → accepted → rejected → withdrawn) with optimistic update
- Notes textarea (autosaves 2s after last keystroke, same pattern as Rocks notes)
- AI screen score + summary (from Commit 6)
- Activity log: stageChangedAt history
- Actions: "Make offer" (sets stage to `offered`), "Reject" (sets stage to `rejected`)

### Referrals workflow (Commit 8)

New sub-tab `?tab=referrals` on `/recruitment` page.
- List view: referrer name, candidate name, status (pending / hired / bonus_paid / expired), bonus amount, pending action
- "Mark bonus paid" button → modal with payout date + Xero invoice link (optional) → PATCHes `StaffReferral.status = bonus_paid, bonusPaidAt, bonusAmount`
- Expiry rule: referrals older than 90 days with status `pending` auto-flip to `expired` (cron job, optional — can defer to a separate commit if scope)

### Role permissions enforcement (Commit 9)

- `contracts.edit` feature: wire check in `PATCH /api/contracts/[id]` + supersede + terminate routes.
- Add `recruitment.view` / `recruitment.edit` features. Current state: route uses page-level access only. Add feature-level checks on POST / PATCH.

## Schema changes

**Additive only.** One new field for referral tracking:

```prisma
// StaffReferral
lastReminderAt  DateTime?  // when we last nudged referrer about pending-referral status
```

No other schema changes. Existing `documentUrl` + `documentId` + `aiScreenScore` + `aiScreenSummary` are already declared.

## Out of scope (defer)

- **Digital signature integration** (DocuSign / Adobe Sign) — use manual upload for now
- **Contract auto-renewal reminders** — defer
- **Recruitment offer letter generation from template** — defer (could be a 4c follow-up)
- **Candidate video interview scheduling** — out of scope
- **Applicant-facing portal** (candidate logs in, tracks status) — big effort; defer
- **Interview-kit / scoring rubric management** — defer
- **Background check integration** (state police check API) — separate sub-project

## Acceptance criteria

- [ ] All 10 commits land in order
- [ ] Single additive migration (StaffReferral.lastReminderAt) applied to Neon
- [ ] 1617+ baseline → ~1700+ tests (~60-80 new)
- [ ] 0 tsc errors
- [ ] `/contracts` page split into 5 focused components (parent ≤ 250 lines)
- [ ] Upload PDF → download PDF round-trip works
- [ ] Acknowledge contract → StaffOnboarding auto-created
- [ ] `/staff/[id]` has Contracts tab with history
- [ ] `/contracts` visible in sidebar for feature-gated roles
- [ ] AI screen button on candidate → score + summary persist
- [ ] CandidateDetailPanel lets admin change stage + add notes inline
- [ ] Referrals tab + Mark Bonus Paid workflow functional
- [ ] `contracts.edit` enforced in PATCH/supersede/terminate routes
- [ ] PR body includes before/after table + migration SQL

## Implementation notes (spec-reviewer tightenings)

These clarify ambiguities that would let a parallel session drift:

- **Commit 1 regression safety.** There is no pre-existing comprehensive UI test for `contracts/page.tsx`. Don't rely on "existing tests prove zero drift." Instead: write a smoke snapshot test for the existing page's key CTAs (list renders, create modal opens, detail panel shows fields) as Commit 1 Step 1 (before decomposition). Run it, extract components, re-run — same output.
- **Commit 3 onboarding seed — no-service fallback.** Some contracts (head-office staff, multi-service) have no `serviceId` on their user. For those: no default pack exists. Acknowledge call logs `warn` + notifies admin via existing feedback channel; does NOT fail the acknowledge. "Duplicate check" scope: per `(userId, packSlug)` — users can receive multiple packs over time (onboarding, then casual→perm upgrade pack); duplicate-prevention is only against re-seeding the _same_ pack.
- **Commit 5 nav-exposure pre-step.** Before wiring `/contracts` into the nav, audit `contracts.view` current role list in `src/lib/role-permissions.ts`. Marketing should NOT see contracts by default — if `contracts.view` today includes marketing, narrow it first in the same commit.
- **Commit 6 AI screening — test seam.** Tests mock `src/lib/ai.ts`'s public function export (the same entry point `useAiGenerate` uses server-side). Use `vi.mock("@/lib/ai", () => ({ generateText: vi.fn(...) }))`. Don't mock the HTTP transport; mock at the library boundary so prompt-builder tests stay meaningful. Rate limit (5/min/admin) is enforced via `withApiAuth({ rateLimit: { max: 5, windowMs: 60_000 } })`; test it via rapid-fire consecutive requests.
- **Commit 7 optimistic stage update pattern.** Use existing project pattern: `useMutation` with `onMutate` that pre-applies + `onError` that reverts + surfaces destructive toast (`toast({ variant: "destructive", description: err.message })`). Match what `useRollCallAction` does in 4a. Do NOT roll custom optimistic state.
- **Commit 8 referral expiry cron.** Default: DEFER. If included, use `acquireCronLock` per CLAUDE.md convention + add a rollback note (how to un-expire referrals flipped in error). Recommend: ship without the cron; add a one-line "defer to 6+" flag in the spec's Out of scope.

## Risks

- **Contract→onboarding seed could double-seed** — mitigated by "create only if no existing `StaffOnboarding` for this (user, pack) combination" check. Test covers re-acknowledge case.
- **File upload 10MB limit** — enforced server-side via existing Document module validation; flag in PR body.
- **AI screening cost** — per-candidate LLM call. Rate-limit the endpoint (5/min per admin). UI doesn't auto-screen; admin must click.
- **Decomposition regressions** — smoke snapshot test (see Implementation notes) before and after Commit 1 confirms zero behavioural drift.
- **Referral expiry cron scope creep** — see Implementation notes. Default: defer.
- **Contracts visibility in nav** — see Implementation notes. Pre-step audit of `contracts.view` role list prevents accidental marketing exposure.

## Rollback

Each commit is revert-safe. The one with the most impact is the onboarding-seed wire-up (Commit 3) — if it spams users, revert that commit; contract data stays. File-upload commit can be reverted without losing any contract data (fields become unused again). Migration is additive.

---

*Plan target: `docs/superpowers/plans/2026-04-22-contracts-recruitment-6-plan.md`.*
