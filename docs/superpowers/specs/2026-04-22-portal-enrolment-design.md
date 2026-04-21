# Sub-project 7 — Portal & Enrolment Flow

**Date**: 2026-04-22
**Status**: Approved (pre-written for parallel execution — brainstorming skipped by user preference)
**Parent roadmap**: [`2026-04-20-dashboard-bugfix-roadmap.md`](./2026-04-20-dashboard-bugfix-roadmap.md)
**Predecessors**: #1 P0 Bugs (`dd0a1d9`), #2 Hygiene Sweep (`2ca8289`), #3a Staff Part 1 (`39164df`), #3b Staff Rostering (`38fd0b2`)

## Overview

The parent portal + enrolment flow already exists and is comprehensively built (magic-link auth, children pages, messaging, bookings, billing, attendance, medical, authorised pickups, sibling enrolment). This sub-project targets three specific Tier-1 priorities from Jayden's backlog that this surface needs:

1. **Enrolment-to-OWNA CSV export** (Tier 1 follow-up). The long-term plan is to replace OWNA — but until then, staff still have to port enrolment data to OWNA manually. A direct push-API integration would be wasted work since we're removing OWNA. Instead: build a "Download OWNA-importable CSV" action on the enrolment detail panel. Admin downloads → uploads to OWNA's own import UI → dashboard tracks which enrolments have been exported. Minimal coupling to OWNA; drops cleanly when OWNA goes away.
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
| 1 | `feat(lib): buildOwnaCsv helper in src/lib/owna-csv.ts (format enrolment → OWNA import columns)` | Lib | 2 |
| 2 | `feat(api): GET /api/enrolment-applications/[id]/owna-csv (download)` | API | 3 |
| 3 | `feat(ui): "Download OWNA CSV" button + ownaExportedAt display on enrolment detail panel` | Feature | ~3 |
| 4 | `fix(portal): verify parent-portal flow end-to-end + fix issues surfaced` | Reliability | ~5 (varies on what breaks) |
| 5 | `test(e2e): Playwright coverage for parent portal round-trip` | Testing | ~3 |
| 6 | `refactor(components): WeeklyDataEntry fetch → mutateApi` | Reliability | 2 |

~6 commits.

## Key design decisions

- **CSV export format**: OWNA's child-import CSV schema (need to verify during implementation — check OWNA docs or an existing export template in `.env.save` / project docs; if unknown, session should ask Jayden). Columns likely include: first_name, last_name, dob, gender, family_address, parent_email, parent_phone, medical_notes. The `buildOwnaCsv` helper produces a single-row CSV matching that schema.
- **Download flow**: `GET /api/enrolment-applications/[id]/owna-csv` returns `Content-Type: text/csv` with `Content-Disposition: attachment; filename=enrolment-{childName}-{date}.csv`. Access: admin/head_office/owner/coordinator (at application's service).
- **Tracking**: `EnrolmentApplication.ownaExportedAt DateTime?` (single nullable field — replaces the previous Push/Error/ChildId design). Set when CSV is downloaded. UI shows "Exported on {date}" + "Download again" button for re-export.
- **E2E verification**: extend existing `tests/e2e/` Playwright suite with parent-portal scenarios. If no parent-portal test data fixtures exist, create minimal seed utilities.

## Schema changes

```prisma
model EnrolmentApplication {
  // ... existing fields ...
  ownaExportedAt  DateTime?   // when admin last downloaded the OWNA-import CSV
}
```

Single additive field. No existing column changes. Much simpler than the push-API design — matches the "OWNA is going away" direction.

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
- [ ] "Download OWNA CSV" button on enrolment detail works; tracks `ownaExportedAt`; can re-download
- [ ] Playwright parent-portal round-trip test passes
- [ ] PR body includes a "how I verified the portal end-to-end" log + any bugs fixed

## Risks

- **OWNA CSV schema unknown**: if Jayden doesn't have a reference template or OWNA doesn't document its import format, session should ask at plan time. Fallback: ship with a reasonable default column set; Jayden adjusts via a small config change in `owna-csv.ts`.
- **Parent portal E2E flakiness**: Playwright tests against real DB can be flaky. Mitigation: clean-room seed per test + short timeouts.
- **Scope of "verify end-to-end"**: open-ended. Plan should enumerate the exact flows to cover (magic-link send → verify → children list → attendance → message send/receive → account update) to avoid scope creep.

## Rollback

Schema additive (single field). Each commit revert-safe. If CSV export format is wrong, fix the helper; no DB cleanup needed.

---

*Plan target: `docs/superpowers/plans/2026-04-22-portal-enrolment-plan.md`.*
