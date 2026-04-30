# OWNA Gap E — Reports Plan

**Date**: 2026-04-25
**Status**: Plan only — no code in this doc
**Area**: `/reports`, `src/app/api/reports/*`, regulator + finance + ops exports

## Why this is a plan and not a build

The OWNA gap audit (2026-04-25) flagged six missing reports against OWNA's reporting
surface. Each has a distinct data source, audience, and acceptance bar — bundling
them all into a single commit would land none of them well. This doc lists each
report, sequences them by leverage-vs-cost, and proposes a 5-commit decomposition.

## Audit context

> **E. Reports / exports — 🟡 Partial**
>
> What we have: `/src/app/(dashboard)/reports/board` showing occupancy by service.
> `Board` model + reports API live but minimal.
>
> What's missing:
> - NQS data feed export
> - Attendance export for regulator submission
> - Financial reports (P&L, fee variance)
> - Roster / staffing reports
> - Parent engagement / survey export
>
> Occupancy is the only working report; no scheduler / recurring export jobs.

## Strategic frame

Same as the rest of the OWNA gap close: dashboard becomes the staff team's
primary tool inside 3 months; CCMS submissions stay on OWNA. Reports E.1, E.2,
and E.4 below are the ones staff currently open OWNA for — they're the
critical-path retirement blockers. E.3, E.5, E.6 are nice-to-haves that can
land after the Sept retirement target.

---

## Report inventory + commit decomposition

### Commit E.1 — Attendance export (regulator-facing)

**Audience**: state regulator (NSW DOE, VIC DET, etc.) + Amana finance team for
reconciliation.

**Data sources** (already present):
- `AttendanceRecord` (signInTime / signOutTime / sessionType / serviceId / date)
- `Child` (firstName / surname / dob / crn / ownaChildId)
- `Service` (name / code / approvalNumber)

**Output formats**:
- CSV (regulator submission shape — TBD; check NSW DOE OSHC reporting spec)
- PDF (printable summary for service folder)

**Filters**: service, date range, session type (BSC / ASC / VC).

**Routes to add**:
- `GET /api/reports/attendance/csv?serviceId=&from=&to=&sessionType=`
- `GET /api/reports/attendance/pdf?…` (reuse `report-pdf.ts` helpers)

**UI**: `/reports/attendance` — service picker + date range + format toggle +
"Generate" button. Mirrors the existing board page layout.

**Effort**: ~1 day. Data is already captured; this is mostly query + CSV
generation + PDF layout.

**Open question (blocks shipping)**: do NSW / VIC regulators pull attendance
from OWNA via the CCMS feed, or do they require a separate report? **Action:
Jayden to confirm with the relevant regulator week 1.** If they pull from
CCMS, this commit drops to "Amana finance only" scope and the priority halves.

---

### Commit E.2 — Financial reports (P&L + fee variance)

**Audience**: Amana leadership (Daniel + Jayden), board pack, Akram for
budgeting.

**Data sources**:
- `Statement` + `StatementLineItem` — fees billed (already populated)
- `Payment` — fees collected (already populated)
- Service-level `Budget` (already populated by 4b)
- `Service.feeStructure` Json — fee schedule

**Reports**:
1. **P&L by service** — fees billed vs collected vs budget for a period; variance
   column with traffic-light colours.
2. **Fee variance** — children whose actual fees diverge from their fee tier
   (driven by CCS application or fee tier mismatch). Surfaces billing errors.
3. **Aged receivables** — extend the existing `/billing/overdue` view into a
   board-pack-quality report.

**Routes**:
- `GET /api/reports/financial/pnl?serviceId=&period=`
- `GET /api/reports/financial/fee-variance?serviceId=&period=`
- `GET /api/reports/financial/aged-receivables?serviceId=&asOf=`

**UI**: `/reports/financial` with three sub-tabs.

**Effort**: ~2 days. Most cost is the report-grade SQL aggregations and
formatting — not new instrumentation.

**Dependency**: this is downstream of the billing pipeline (gap A) — without
auto-statement generation + CCS auto-application, the P&L numbers are only as
trustworthy as the manually-entered line items. Don't ship E.2 until A's
billing pipeline is live, or scope it explicitly to "what we have now."

---

### Commit E.3 — Roster + staffing reports

**Audience**: coordinators + leadership; ratio-compliance evidence.

**Data sources**:
- `RosterShift` — already populated by OWNA sync + manual edits
- `RatioSnapshot` — already captured hourly by the `ratio-capture` cron
- `User` (active staff)

**Reports**:
1. **Weekly roster summary** — hours per staff member per service, total cost
   estimate, qualifications-on-shift per session.
2. **Ratio compliance** — historical ratios by service / session type, % of
   sessions at-or-below regulator minimum, list of below-ratio incidents.
3. **PD hours summary** — total PD hours per staff member per period (using
   the `ProfessionalDevelopmentRecord` shipped in gap F).

**Routes**:
- `GET /api/reports/staffing/roster-summary?serviceId=&from=&to=`
- `GET /api/reports/staffing/ratio-compliance?serviceId=&from=&to=`
- `GET /api/reports/staffing/pd-summary?period=`

**UI**: `/reports/staffing` with three sub-tabs.

**Effort**: ~1.5 days.

---

### Commit E.4 — NQS data feed (audit-readiness export)

**Audience**: NQS auditors during walk-throughs; Daniel's QIP work.

**Output**: a single JSON or PDF dossier per service that aggregates
audit-relevant data into one downloadable file:
- Reflections (last 30 days) — count + sample
- Observations (last 30 days) — count + visible-to-parent ratio
- Medication administrations (last 30 days) — count + dual-sign-off rate
- Risk assessments (active + approved)
- Ratio snapshots (last 7 days) — % compliant
- Open incidents
- Outstanding compliance certificates / qualifications

**Why this matters**: when an NQS auditor visits, the coordinator currently has
to pull these from OWNA + the dashboard separately. This consolidates into a
"hand the auditor this PDF" surface.

**Route**:
- `GET /api/reports/nqs/audit-readiness?serviceId=&asOf=` → PDF or JSON

**UI**: a "Generate audit pack" button on `/services/[id]` (not a separate
report page — it's contextual to the service).

**Effort**: ~2 days. Most cost is the PDF layout (multi-section, with charts
for ratio compliance trend).

**Dependency**: requires the NQS suite shipped in the staff dashboard v2 spec
(Reflections / Observations / Medications / Risk / Ratios) — already live.

---

### Commit E.5 — Parent engagement export

**Audience**: marketing + leadership; coordinator weekly reviews.

**Data sources**:
- `ParentPost` (engagement posts, photos, newsletters)
- `ParentPostLike` + `ParentPostComment`
- `QuickFeedback` + `NpsSurveyResponse`
- `Conversation` + `Message` (volume per service)

**Reports**:
1. **Parent engagement summary** — posts published, likes/comments per post,
   read-rate (when wired via push receipts), trend line over period.
2. **NPS / quick-feedback summary** — score, distribution, qualitative themes.

**Routes**:
- `GET /api/reports/parent-engagement?serviceId=&period=`
- `GET /api/reports/nps-summary?serviceId=&period=`

**UI**: `/reports/parent-engagement` — period picker + service multi-select +
charts.

**Effort**: ~1 day.

---

### Commit E.6 — Recurring export scheduler (post-retirement)

**Goal**: stop staff from manually generating any of E.1–E.5 every period.

**Mechanism**:
- New `ScheduledReport` model: `{ id, type, serviceId?, schedule (cron-like),
  recipients (email[]), format, lastRunAt, active }`
- Daily cron `/api/cron/scheduled-reports` evaluates which reports are due,
  generates them, emails the artefact to the recipient list.

**Routes**:
- CRUD `/api/reports/scheduled-reports`
- `GET /api/cron/scheduled-reports` (cron)

**UI**: `/reports/scheduled` — list + schedule new + history of past runs.

**Effort**: ~2 days.

**Why last**: only valuable once E.1–E.5 are stable. Don't schedule reports
that staff still want to QC manually.

---

## Total effort + sequencing

| Commit | Days | Order | Dependency |
|---|---|---|---|
| E.1 — Attendance export | 1 | 1st | Regulator confirmation week 1 |
| E.4 — NQS audit pack | 2 | 2nd | None (NQS suite already live) |
| E.3 — Staffing reports | 1.5 | 3rd | None |
| E.2 — Financial reports | 2 | 4th | Gap A billing pipeline live |
| E.5 — Parent engagement | 1 | 5th | None |
| E.6 — Scheduled reports | 2 | 6th | E.1–E.5 stable |

**Total: ~9.5 days.** Realistic to ship E.1–E.4 (the staff-facing critical
path) inside 1 week of focused effort. E.5 + E.6 can land after the 3-month
OWNA staff retirement target.

## Out of scope

- ACECQA portal sync (regulator pulls our data automatically) — separate
  initiative, deferred indefinitely.
- Real-time analytics dashboards — the existing `/leadership` and
  `/dashboard` pages cover this surface; reports are batch-generated artefacts,
  not live UIs.
- Per-state regulator format variations — federal / NSW format only in v1;
  add VIC / QLD / WA when a service expands into those states.
- Custom report builder / pivot UI — fixed templates only. If staff need
  ad-hoc analysis, they can still hit Prisma Studio / Neon.

## Open questions to resolve before E.1 starts

1. **Regulator-pull-vs-push** — does NSW DOE require a separate attendance
   report or pull it via CCMS? (Action: Jayden to confirm.)
2. **CSV format spec** — is there an authoritative spec for the regulator CSV
   column set? If not, mirror OWNA's current export and document.
3. **Report retention** — how long do generated reports need to be archived?
   (Compliance question.) Default: keep forever in `R2 / Vercel Blob`; emit
   activity-log entries on generation for audit trail.
4. **Email recipient verification** — for E.6 scheduled reports, do we need a
   confirmation step before adding an external recipient? (Spam Act + leak
   risk.) Default: only allow internal `@amanaoshc.com.au` recipients in v1.

---

*Plan committed alongside the OWNA gap-close D + F + G work in
`feat/owna-gap-close-2026-04-25`. Build commits land separately when the
open questions above resolve.*
