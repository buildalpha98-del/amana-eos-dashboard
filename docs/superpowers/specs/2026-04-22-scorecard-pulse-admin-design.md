# Sub-project 9 — Scorecard + Contact Centre + Leadership Team Centre + Pulse admin visibility

**Date**: 2026-04-22
**Status**: Approved (pre-written for parallel execution — brainstorming skipped by user preference)
**Parent roadmap**: [`2026-04-20-dashboard-bugfix-roadmap.md`](./2026-04-20-dashboard-bugfix-roadmap.md)
**Predecessors**: #1 P0 Bugs (`dd0a1d9`), #2 Hygiene Sweep (`2ca8289`), #3a Staff Part 1 (`39164df`), #3b Staff Rostering (`38fd0b2`)

## Overview

Four related surfaces grouped because they're all about **organisation-wide visibility for leaders/admins**. Each has core functionality built; this sub-project closes specific gaps:

1. **Scorecard polish** — drag-reorder / week-range / UTC-save fixes shipped in a previous session (3/26). Remaining gaps: leadership team tab completeness, admin view of all teams' scorecards in a single rollup, historical trend charts per measurable.
2. **Contact Centre polish** — the unified Contact Centre page shipped as `34f8e1e` (combining enquiries + tickets + calls). Gap: a "leaderboard" tab showing per-coordinator metrics (response times, ticket close rate, conversion rate) for leadership review.
3. **Leadership Team Centre (NEW)** — a dedicated `/leadership` page for owner/head_office/admin view. Aggregates: org-wide KPIs (total active staff, services, open issues, pulse sentiment trend), quarterly rocks roll-up across services, and the leaderboard from #2. Landing page for the leadership team view.
4. **Pulse admin visibility** — `WeeklyPulse` data is currently visible only in `/communication` Team Pulse tab to leaders. Extend so admins (head_office/owner) can see aggregated sentiment across all services + drill into a service's individual staff pulse responses. Respect staff anonymity — don't expose individual responses outside leadership tier.

## Baseline

- 1298 tests, 0 tsc errors
- `/scorecard/page.tsx` (258 lines) — small, clean
- Existing Scorecard leadership team tab (from 3/26 session)
- `/contact-centre` unified page exists
- `/communication/` page with `WeeklyPulseTab.tsx`
- `WeeklyPulse` + `StaffPulseSurvey` models exist
- No existing `/leadership` page or route

## In scope — stacked commits

| # | Commit subject | Category | Files (approx.) |
|---|---|---|---|
| 1 | `feat(api): /api/leadership/overview — org-wide KPI aggregator` | API | 3 |
| 2 | `feat(leadership): /leadership landing page + role-permissions registration` | Feature | ~4 |
| 3 | `feat(scorecard): org-wide rollup view across services` | Feature | ~3 |
| 4 | `feat(scorecard): historical trend charts per measurable` | Feature | ~4 |
| 5 | `feat(contact-centre): coordinator leaderboard tab` | Feature | ~4 |
| 6 | `feat(pulse): admin-tier visibility + per-service drill-down` | Feature | ~5 |
| 7 | `feat(team): extend Action Required widget with "Pulse responses awaiting review" card` | Feature | 2 |

~7 commits.

## Key design decisions

- **Leadership Team Centre (`/leadership`)**: new dashboard page, admin-only (head_office/owner/admin via `allPages` spread). Single-page scroll layout with 4 sections: Org KPIs (counts) / Quarterly Rocks Rollup / Contact Centre Leaderboard / Pulse Sentiment Trend.
- **Org-wide scorecard**: new API `/api/scorecard/rollup` returns aggregated measurables across all services. UI adds a "Rollup" tab on `/scorecard` visible only to admin. Per-service columns + org total row.
- **Trend charts**: use `recharts` (already in deps). Per `Measurable`, chart of last 12 weeks of entries. Click measurable name → drawer with chart.
- **Leaderboard**: new API `/api/contact-centre/leaderboard` aggregates per-coordinator: avg first-response time, total tickets resolved, total enquiries converted. New tab on `/contact-centre`.
- **Pulse admin view**: existing `/communication` Team Pulse tab is leader-only; extend so admin role also has access + shows an "All Services" toggle at top. Per-service drill-down shows sentiment breakdown (positive/neutral/concerning counts) but **never individual staff names**.

## Schema changes

No new models required — all 4 surfaces aggregate existing data (`Rock`, `Measurable`, `MeasurableEntry`, `Ticket`, `ParentEnquiry`, `WeeklyPulse`, `StaffPulseSurvey`). Zero schema migration risk.

## Out of scope (defer)

- **Report Issue admin inbox UI** — owned by Sub-project 8 per roadmap (roadmap investigation #0 flagged it)
- **Individual pulse response visibility** even for admin — preserve staff anonymity
- **AI-generated leadership summaries** — separate sub-project
- **Custom leadership dashboard widgets** (drag-to-configure) — too much UI for one sweep
- **Board report generation** — existing cron `board-report` handles this; not in scope here
- **Cross-org benchmarking** (compare to industry averages) — out of scope

## Acceptance criteria

- [ ] All 7 commits land in order
- [ ] No Prisma migration needed (no schema changes)
- [ ] 1298 → ~1340+ tests (approx. 40 new)
- [ ] 0 tsc errors
- [ ] `/leadership` page renders for admin/head_office/owner; 403 for others
- [ ] Scorecard Rollup tab visible + works for admins
- [ ] Contact Centre leaderboard tab visible + works
- [ ] Pulse admin visibility respects anonymity (sentiment counts only, no names outside leader tier)
- [ ] Role-permissions.ts updated for `/leadership` per MEMORY.md checklist
- [ ] PR body includes before/after table

## Risks

- **Performance on /leadership aggregator**: org-wide queries across `Rock`, `Measurable`, etc. could be slow. Mitigation: `Promise.all` parallel queries; add caching with 60s TTL if needed.
- **Privacy on pulse admin drill-down**: strict guard that individual pulse responses with identifiable info never surface above leader tier. Unit test specifically the admin-view data shape.
- **Coordinator leaderboard fairness**: metrics can unfairly favour/penalise coordinators with different service sizes. Ship with "sample size" shown (e.g. "12 tickets over 30 days"); leave to product judgment whether to normalise.

## Rollback

No schema changes, so rollback is pure PR revert. Each commit is independently revert-safe. `/leadership` route disappears; existing Scorecard/Contact Centre/Pulse views remain unchanged.

---

*Plan target: `docs/superpowers/plans/2026-04-22-scorecard-pulse-admin-plan.md`.*
