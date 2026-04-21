# Sub-project 7 — Portal & Enrolment Flow

**Date**: 2026-04-22
**Status**: Approved (pre-written for parallel execution — brainstorming skipped by user preference)
**Parent roadmap**: [`2026-04-20-dashboard-bugfix-roadmap.md`](./2026-04-20-dashboard-bugfix-roadmap.md)
**Predecessors**: #1 P0 Bugs (`dd0a1d9`), #2 Hygiene Sweep (`2ca8289`), #3a Staff Part 1 (`39164df`), #3b Staff Rostering (`38fd0b2`)

## Overview

The parent portal + enrolment flow already exists and is comprehensively built (magic-link auth, children pages, messaging, bookings, billing, attendance, medical, authorised pickups, sibling enrolment). This sub-project targets three specific Tier-1 priorities from Jayden's backlog that this surface needs:

1. **Two-Way OWNA Sync for Enrolments** (Tier 1 — highest business impact). Staff currently port enrolment data from dashboard → OWNA manually. The school notification email is a band-aid. Build a "Push to OWNA" action on the enrolment detail panel that sends structured data via the existing `getOwnaClient()`.
2. **Verify Parent Portal end-to-end** (Tier 1). The portal works but hasn't been tested with real data. Explicit E2E tests covering: magic-link send/verify, JWT session, children render, attendance display, account update, messaging round-trip. Fix anything the tests surface.
3. **Enrolment wizard polish** — the P0 batch fixed postcode, booking, and medical step issues. Follow-up gaps flagged: school-notification email has full medical breakdown (shipped), but the flow from "enrolment submitted" → "child created in OWNA" is still manual. Close that loop via #1 above.

Smaller follow-ups from 3a reviewer feedback:
4. **WeeklyDataEntry component fetch → mutateApi migration** — `src/components/services/WeeklyDataEntry.tsx` uses raw `fetch` and loses server error detail on `onError` toast (flagged during 3a). Migrate to `mutateApi` from `@/lib/fetch-api`.

## Baseline

- 1298 tests, 0 tsc errors
- Parent portal: `/parent/*` with 12 API routes (auth, bookings, messages, children, enrolments, statements, absences, daily-info, me, logout)
- Enrolment wizard: `/enrol/[token]` with postcode/booking/medical/contact steps + sibling enrolment
- OWNA client: `getOwnaClient()` in `src/lib/owna.ts`. Existing OWNA sync cron pulls children, attendance, enquiries, incidents. No push-to-OWNA code today.
- `ParentEnquiry` → `EnrolmentApplication` → `Child` lifecycle models all exist

## In scope — stacked commits

| # | Commit subject | Category | Files (approx.) |
|---|---|---|---|
| 1 | `feat(owna): pushChildToOwna + pushEnrolmentToOwna in src/lib/owna.ts` | API client | 2 |
| 2 | `feat(api): POST /api/enrolment-applications/[id]/push-to-owna` | API | 3 |
| 3 | `feat(ui): "Push to OWNA" button on enrolment detail panel` | Feature | ~3 |
| 4 | `fix(portal): verify parent-portal flow end-to-end + fix issues surfaced` | Reliability | ~5 (varies on what breaks) |
| 5 | `test(e2e): Playwright coverage for parent portal round-trip` | Testing | ~3 |
| 6 | `refactor(components): WeeklyDataEntry fetch → mutateApi` | Reliability | 2 |

~6 commits.

## Key design decisions

- **OWNA push scope**: push a single enrolment's child record. If OWNA's POST API is not available (check during implementation), scope shrinks to "generate OWNA-importable CSV" as fallback. Preferred path: direct API.
- **OWNA credentials**: reuse existing `OWNA_API_URL` + `OWNA_API_KEY` env vars. If push requires different scope/creds, document in `.env.example`.
- **Idempotency on push**: track `EnrolmentApplication.ownaPushedAt` (new field, nullable DateTime) to prevent double-push. UI disables the button once pushed; shows "Pushed to OWNA on {date}".
- **Error handling**: if OWNA push fails (non-200), store error in `EnrolmentApplication.ownaPushError` (new field, String?) and surface in UI with retry button. Log via `logger.error`.
- **E2E verification**: extend existing `tests/e2e/` Playwright suite with parent-portal scenarios. If no parent-portal test data fixtures exist, create minimal seed utilities.

## Schema changes

```prisma
model EnrolmentApplication {
  // ... existing fields ...
  ownaPushedAt    DateTime?
  ownaPushError   String?
  ownaChildId     String?   // OWNA's ID for the pushed child (for future linkage/sync)
}
```

Additive only. No existing column changes.

## Out of scope (defer)

- Push parent/guardian data to OWNA (only child enrolment data in 3b scope)
- Reverse sync: dashboard receives webhooks from OWNA for child/enrolment updates
- Bulk push of multiple enrolments (one-at-a-time only)
- Migration of existing sync/pull logic to push-first model (OWNA remains source of truth for some data during transition)
- Full OWNA replacement (still on the long-term roadmap)

## Acceptance criteria

- [ ] All 6 commits land in order
- [ ] Schema migration applied to Neon pre-merge
- [ ] 1298 → ~1330+ tests (approx. 30 new, including E2E scenarios)
- [ ] 0 tsc errors
- [ ] "Push to OWNA" button on enrolment detail works; idempotent; error path surfaces
- [ ] Playwright parent-portal round-trip test passes
- [ ] PR body includes a "how I verified the portal end-to-end" log + any bugs fixed

## Risks

- **OWNA push API availability unknown**: if OWNA doesn't support writes, scope shrinks to CSV export. Flag to Jayden at plan time if unclear.
- **Parent portal E2E flakiness**: Playwright tests against real DB can be flaky. Mitigation: clean-room seed per test + short timeouts.
- **`ownaChildId` field**: if OWNA doesn't return the created ID in its response, leave nullable and document limitation.

## Rollback

Schema additive. Each commit revert-safe. If OWNA push misfires, the flag field blocks re-push — easy to clear via one SQL UPDATE.

---

*Plan target: `docs/superpowers/plans/2026-04-22-portal-enrolment-plan.md`.*
