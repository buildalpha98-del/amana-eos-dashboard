# Responsible Person Register — Design

**Date:** 2026-06-11
**Status:** Built (pending deploy + Unity Grammar backfill)
**Trigger:** Assessment & Rating visit flagged a breach — the service was not
rostering on a designated responsible person, nor keeping a record of one,
despite all staff having accepted the responsible-person forms.

## Problem

Under the National Quality Framework an approved provider must designate one
"responsible person working directly with children" per session and keep a
record of it. We had no register. The Department needs to see, per service and
per session, who the designated responsible person was — including a backdated
record for Unity Grammar from ~April 2026 onward.

## Decisions (locked with the user)

- **Records:** date, session, person's **name + position/role**, and the
  **designated time period** (on/off).
- **Sessions:** **BSC, ASC, and VC** (all three).
- **Architecture:** a **standalone register**, independent of `RosterShift`.
  Chosen so the register is immutable history (a later roster edit can't
  rewrite the official record) and so backfilling from paper records needs no
  fabricated shifts.
- **One per session:** enforced by a DB unique constraint
  `(serviceId, date, sessionType)`.
- **UI:** a weekly grid (weekdays × BSC/ASC/VC) as a third sub-pill in the
  service Roster tab — "Bookings | Shifts | Responsible Person".
- **Export:** a branded, **range-capable** PDF so the whole April→now span can
  be produced as one document for the Department.

Rejected alternatives: a boolean flag on `RosterShift` (fragile history,
backfill would require fake shifts); a generic multi-type compliance register
(YAGNI).

## Data model

`ResponsiblePersonEntry` (prisma/schema.prisma):

| field | notes |
|-------|-------|
| `serviceId` | → Service, cascade |
| `date` | `@db.Date` |
| `sessionType` | `SessionType` (bsc/asc/vc) |
| `personName` | snapshot — required |
| `personRole` | snapshot position, optional |
| `userId` | optional link to a staff `User` (SetNull) |
| `startTime` / `endTime` | "HH:mm" designated-RP window |
| `notes` | optional |
| `createdById`, `createdAt`, `updatedAt` | audit |

`@@unique([serviceId, date, sessionType])` — the "one responsible person per
session" rule. Name + role are snapshots so the historical record survives
staff renames/departures.

Migration: `prisma/migrations/20260611100000_responsible_person_register/`
(additive CREATE TABLE — applies via `prisma migrate deploy` on the next
deploy; no manual prod change).

## API (service-scoped, mirrors `/api/services/[id]/staff-certificates`)

- `GET  /api/services/[id]/responsible-person?from=&to=` — entries for an
  inclusive date range. View: org-wide roles, or any user at the service.
- `POST /api/services/[id]/responsible-person` — **upsert** by (date, session).
  Defaults on/off times from the service's `sessionTimes` (else federal
  windows). Edit: admin-tier or the service's own Director (member).
- `DELETE /api/services/[id]/responsible-person/[entryId]` — clear a
  designation; entry is checked to belong to the URL's service.

All `withApiAuth` + Zod. Edit rule mirrors the roster-shift permission.

## Client

- `src/lib/responsible-person.ts` — pure helpers (session labels, default
  times, range expansion, cell indexing). Unit-tested.
- `src/hooks/useResponsiblePerson.ts` — query + upsert/clear mutations
  (retry/staleTime/destructive onError per house standards).
- `src/components/services/ServiceResponsiblePersonTab.tsx` — weekly grid,
  assign dialog (pick a staff member **or** type a name for backfill), and the
  PDF export dialog (any date range).
- `src/lib/responsible-person-pdf.ts` — branded, paginated register PDF.
- Wired as a third sub-pill in `ServiceWeeklyRosterTab.tsx`.

## Backfill

`scripts/backfill-responsible-person.ts` — idempotent upsert keyed on
`(serviceId, date, sessionType)`. Takes an inline list or a JSON file; resolves
services by `code` then name; `--dry` previews without writing. Run once we have
the Unity Grammar names/details.

## Testing

- `src/__tests__/lib/responsible-person.test.ts` — helper units.
- `src/__tests__/api/responsible-person.test.ts` — route tests: 401 / 400 /
  403 (cross-service) / 404 / happy-path upsert / time-defaulting / delete.

32 tests pass; `tsc` clean on all new files; `next build` compiles and both
routes register as functions.

## Rollout

1. Review → commit → deploy. Vercel's `prisma migrate deploy` creates the table.
2. Collect Unity Grammar RP records (April→now) → run the backfill script.
3. Open the register tab / export the PDF → screenshot for the Department.

Out of scope (v1): tying designation to the roster grid; tracking who signed
the RP form; multi-RP per session (regulation requires exactly one).
