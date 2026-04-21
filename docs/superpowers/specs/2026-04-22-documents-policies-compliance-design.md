# Sub-project 5 — Documents / Policies / Compliance

**Date**: 2026-04-22
**Status**: Approved (pre-written for parallel execution — brainstorming skipped by user preference)
**Parent roadmap**: [`2026-04-20-dashboard-bugfix-roadmap.md`](./2026-04-20-dashboard-bugfix-roadmap.md)
**Predecessors**: #1 P0 Bugs (`dd0a1d9`), #2 Hygiene Sweep (`2ca8289`), #3a Staff Part 1 (`39164df`), #3b Staff Rostering (`38fd0b2`)

## Overview

The Documents, Policies, and Compliance modules already exist and work. This sub-project closes three specific gaps flagged in the roadmap's "out of scope for earlier sub-projects" section + the "Compliance Expiry Alert System" Tier 1 completion that started in 3a:

1. **Multi-centre document selection** — currently a document is attached to a single service. Organisations with multi-service presence (e.g. a Head Office policy that applies to all 11 centres) have to duplicate the upload 11 times. Fix: allow a document to belong to 0..N services, with "all services" as a first-class option.
2. **Policies tab improvements** — the `/policies` page is 936 lines and has the model + acknowledgement tracking + compliance dashboard built. Gaps: admin needs a clearer "N policies unacknowledged by M staff" heat-map view (similar to 3a's compliance heat map); staff need a single "Policies awaiting your acknowledgement" inbox.
3. **Audit calendar editability** — the audits module has a calendar view; currently it's read-only. Admins need to drag-to-reschedule audits + manual add/edit without rebuilding the full template.

Smaller follow-ups from 3a reviewer feedback:
4. **Widen PATCH `/api/compliance/[id]` auth** — currently admin-only; self/coordinator cert replace is blocked (flagged during 3a review). Extend auth to self + same-service coordinator matching the download route's access rules.

## Baseline

- 1298 tests, 0 tsc errors (after 3b merge)
- `/documents/page.tsx` (1053 lines), `/policies/page.tsx` (936 lines)
- `/api/policies/compliance` already returns org-wide acknowledgement counts per policy
- `Document` model has single `serviceId` (nullable) — no many-to-many today
- `ComplianceCertificate` upload/download flow + heat map shipped in 3a
- `PolicyAcknowledgement` model exists

## In scope — stacked commits

| # | Commit subject | Category | Files (approx.) |
|---|---|---|---|
| 1 | `feat(schema): Document.services many-to-many relation + migration` | Schema | 2 |
| 2 | `feat(components): PolicyHeatMap + PolicyInbox` (reuse compliance heat map pattern from 3a) | Shared UI | 4 |
| 3 | `feat(api): /api/policies/heat-map + /api/policies/my-inbox routes` | API | 4 |
| 4 | `feat(policies): add heat-map toggle + inbox card to /policies page` | Feature | 2 |
| 5 | `feat(documents): multi-service upload flow + "all services" option` | Feature | ~5 |
| 6 | `feat(audits): draggable calendar + inline edit modal` | Feature | ~4 |
| 7 | `refactor(auth): widen PATCH /api/compliance/[id] to self + same-service coordinator` | Reliability | 2 |

~7 commits total.

## Key design decisions

- **Multi-centre documents**: new `DocumentService` join table (or Prisma implicit m:n). `Document.serviceId` kept for backward compat (nullable), new `Document.services Service[] @relation("DocumentServices")` m:n added. Migration backfills `services` from existing `serviceId` where set. A `"all_services"` semantic = empty `services[]` (means org-wide).
- **Policy heat map**: reuse the `ComplianceMatrix` component pattern from 3a. Rows = staff, columns = policies, cells = acknowledged / expiring-version / not-acknowledged.
- **Audit calendar drag-to-reschedule**: use existing `@hello-pangea/dnd` (already in deps — used by scorecard drag-reorder). On drop: `PATCH /api/audits/calendar/[id]` updates scheduled date.
- **Compliance PATCH widen**: same access rules as `/api/compliance/[id]/download` (self, same-service coordinator, admin).

## Out of scope (defer)

- **New audit templates or template system overhaul** — ships separately
- **Document versioning** (document history / diff) — existing fileUrl replacement pattern is enough for now
- **AI-generated policy summaries** — separate sub-project
- **OCR / full-text search** on uploaded documents
- **External sharing links** (e.g. emailing a policy PDF to a family) — deferred

## Acceptance criteria

- [ ] All 7 commits land in order
- [ ] Migration applied to Neon pre-merge (same pattern as 3a/3b)
- [ ] 1298 → ~1340+ tests (approx. 40 new)
- [ ] 0 tsc errors
- [ ] Policy heat map renders on `/policies`; staff see inbox card
- [ ] Document upload lets admin select multiple services or "all services"
- [ ] Audit calendar drag works; inline-edit modal saves
- [ ] Self can PATCH own `ComplianceCertificate` (upload replacement file); 3a CertActionBar now functional for staff
- [ ] PR body includes before/after table + migration SQL

## Risks

- **Document.services m:n migration**: additive-only. Existing `serviceId` field preserved; new table is net-new. Safe to deploy ahead of code.
- **Audit drag**: reuses existing dnd library; minor risk of touch-device UX issues — test on mobile post-merge.
- **Policy heat map performance**: if >50 staff × >20 policies, grid gets large. If perf issues surface, add pagination per page of policies — deferred.

## Rollback

Each commit revert-safe. Migration additive. Worst case: whole-PR revert leaves schema + UI removed; legacy single-service document flow continues working via preserved `serviceId` field.

---

*Plan target: `docs/superpowers/plans/2026-04-22-documents-policies-compliance-plan.md`.*
