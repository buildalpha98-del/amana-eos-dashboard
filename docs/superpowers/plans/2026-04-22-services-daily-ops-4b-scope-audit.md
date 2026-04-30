# 4b — getServiceScope widening: 17-route audit

**Context.** Today `getServiceScope(session)` returns `null` (full access) for every
role except `staff` and `member`. In practice this gives coordinators and marketing
silent cross-service visibility on the 17 API routes that consume the helper. The
4b widening narrows the default: every non-admin role (coordinator / marketing /
member / staff) with a populated `session.user.serviceId` is scoped to that service.

Owner / head_office / admin retain cross-service access (admin layers
`getStateScope` on top for State-Manager filtering).

Before widening the helper this audit walks every call site and explicitly decides
whether the new narrowing is the intended behaviour, or whether the route needs
an inline exemption to preserve cross-service visibility.

## Decision buckets

- **Narrow** — coordinator/marketing should only see their own service. The helper
  widening delivers this automatically; no route-file change required.
- **Exempt — inline override** — this route genuinely needs coordinator/marketing
  to keep cross-service visibility (e.g. company-wide OKRs). The route file gets
  an inline override:
  ```ts
  const scope =
    role === "coordinator" || role === "marketing"
      ? null
      : getServiceScope(session);
  ```
- **Exempt — new helper** — reserved for cases where ≥3 routes share the same
  exemption pattern. None hit that bar in this audit, so no new helper is created.

## Per-route decision table

| # | Route | Today (coord / marketing) | Intended (coord / marketing) | Action | Why |
|---|---|---|---|---|---|
| 1 | `api/attendance/route.ts` | full / full | own-service / own-service | narrow | Daily BSC/ASC/VC attendance is operational per-centre data. Coordinators run their own centre; no reason to see peers' daily rolls. GET, POST, and PUT (batch) all rely on `scope` — widening forbids cross-service writes too. |
| 2 | `api/attendance/summary/route.ts` | full / full | own-service / own-service | narrow | Aggregated occupancy is still a per-centre report. Marketing-facing roll-ups (if any) should go through a different endpoint, not a silently cross-service attendance summary. |
| 3 | `api/timesheets/route.ts` | full / full | own-service / own-service | narrow | Timesheets are week-by-week payroll docs per service. POST already rejects cross-service creation when `scope` is truthy — widening extends that guard to coordinator/marketing. |
| 4 | `api/timesheets/[id]/route.ts` | full / full | own-service / own-service | narrow | Detail GET / PATCH. DELETE is already gated to `owner/head_office/admin` via `withApiAuth` roles, so coordinator/marketing widening does not affect it. Narrowing GET/PATCH stops cross-service timesheet peeks. |
| 5 | `api/timesheets/[id]/entries/route.ts` | full / full | own-service / own-service | narrow | POST attaches entries to a specific timesheet; `scope` also forces a self-only `userId` check. Coordinator adding entries for another service's timesheet is not a valid workflow. |
| 6 | `api/timesheets/[id]/submit/route.ts` | full / full | own-service / own-service | narrow | Submit for approval. Belongs to the owning service only. |
| 7 | `api/qip/route.ts` | full / full | own-service / own-service | narrow | Quality Improvement Plans are per-service documents. POST is admin-only, so widening only affects GET list. Coordinators need their own QIP, not peers'. |
| 8 | `api/compliance/route.ts` | full / full | own-service / own-service | narrow | Compliance certificates. The route already has an extra narrowing for `role === "staff"` (own certs only). Widening makes coordinator/marketing respect their `serviceId` for cert listings, consistent with `member`. Creation via POST stays restricted — `staff/member` paths are unchanged; coordinator creating a cert targets their own `serviceId` if set, which matches the old behaviour when `serviceId` is supplied. |
| 9 | `api/feedback/quick/route.ts` | full / full | own-service / own-service | narrow | GET aggregates parent quick-feedback per service. POST is the public parent endpoint and uses `withApiHandler` (no session), so unaffected. For GET, coordinators monitor their own centre's parent sentiment; owners/head office get the global view. |
| 10 | `api/exit-survey/summary/route.ts` | full / full | own-service / own-service | narrow | Exit survey + churn per service. Same reasoning as feedback/quick GET — coordinator-level data is centre-scoped. |
| 11 | `api/meetings/route.ts` | full / full | own-service / own-service | narrow | GET filters meetings by `serviceIds: { has: scope }`. Narrowing means coordinator sees meetings tagged to their centre. POST is admin-gated, so unaffected. |
| 12 | `api/rocks/route.ts` | full / full | **full / full (cross-service by spec)** | **exempt inline** | EOS Rocks are company-wide OKRs. The existing filter is `OR: [{ serviceId: scope }, { ownerId: session.user.id }]` — if we narrow coordinator, they lose visibility of rocks they don't personally own that belong to other services (e.g. company-level rocks with `serviceId: null`, or peer-centre rocks they're asked to collaborate on). Keep inline override; regression test confirms coordinator still sees cross-service rocks. POST is admin-gated, so widening POST is moot, but GET uses the helper — override applies there. |
| 13 | `api/communication/announcements/route.ts` | full / full | own-service / own-service | narrow | Announcement filter already layers `OR: [{ serviceId: scope }, { serviceId: null }]` when `scope` is set, so widening gives coordinator/marketing: own-service announcements + company-wide announcements. They just stop seeing *other* centres' internal announcements. POST is admin-gated. |
| 14 | `api/scorecard/route.ts` | full / full | own-service / own-service | narrow (**high-risk**) | Measurables are scoped via `measurableWhere = { serviceId: scope }`. Post-widening: coordinator sees only their centre's measurables in the scorecard view. Company-level KPI roll-ups live in `/api/scorecard/rollup` (already coordinator-forbidden, see its test) and `/api/leadership-overview` (privileged). High-risk because a live coordinator will see fewer measurables after deploy — regression test added to prove the narrowing hits exactly their `serviceId`. |
| 15 | `api/services/staffing/route.ts` | full / full | own-service / own-service | narrow | Already returns 403 when `scope && scope !== serviceId`. Widening makes coordinator narrowed to their `serviceId`; hitting another centre's staffing endpoint returns 403, which is the correct behaviour. |
| 16 | `api/billing/overdue/route.ts` | full / full | own-service / own-service | narrow | Overdue fee records. Per-service operational data. POST is admin-gated. |
| 17 | `api/incidents/trends/route.ts` | full / full | own-service / own-service | narrow | Incident trend analysis. Per-service operational dashboard; State Managers use `getStateScope` for multi-centre roll-ups. Company-wide incident views would be on a privileged leadership page. |

## Decision summary

- **Narrow (16 routes):** 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17
- **Exempt inline (1 route):** 12 (`api/rocks/route.ts`)
- **Exempt via new helper (0 routes):** none — no exemption pattern recurs often enough to justify a second helper.

## Coordinator session sanity check

Pre-merge: confirm every active coordinator has `user.serviceId` populated so the
widening does not lock them out of their own data. Run this against the
production/staging DB:

```sql
-- Expected: 0 rows.
SELECT id, email, role, "serviceId"
FROM "User"
WHERE active = true
  AND role IN ('coordinator', 'marketing')
  AND "serviceId" IS NULL;
```

If any rows come back, assign the missing `serviceId` via admin before cutting
the release. Those users would otherwise fall through to `scope = null` (the
widening returns `null` when `serviceId` is missing — fail-open, not lockout)
but that preserves the pre-widening cross-service visibility which defeats the
purpose of this change. Flag to Jayden before merge if the query returns rows.

## Test coverage

- `src/__tests__/lib/service-scope.test.ts` — full 10-case role matrix
  (owner, head_office, admin, coordinator ±serviceId, marketing ±serviceId,
  member, staff, null session).
- `src/__tests__/api/rocks.test.ts` — regression confirming coordinator sees
  cross-service rocks after the inline exemption.
- `src/__tests__/api/attendance.test.ts` — regression confirming coordinator
  is narrowed to `serviceId = svc1`.
- `src/__tests__/api/scorecard.test.ts` (new) — regression confirming
  coordinator's `measurables.where` is narrowed to `serviceId = svc1`.

## Rollback plan

If the widening causes an unexpected access regression, revert
`src/lib/service-scope.ts` alone — the helper change is the single load-bearing
edit. The inline override in `api/rocks/route.ts` is safe either way (it no-ops
when the helper returns `null` for coordinators, which is the pre-widening
behaviour). The audit doc becomes stale on revert but causes no runtime break.
