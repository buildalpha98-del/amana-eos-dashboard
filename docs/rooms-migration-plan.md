# Making rooms first-class records

**Status:** proposal — nothing here has been built.
**Written:** 2026-08-09

## The problem

A centre cannot add a room. Rooms are seven fixed slots baked into a
Postgres enum — `bsc`, `asc`, `vc`, and four generic spares a centre can
rename (`extra1`–`extra4`). Their definitions (label, hours, capacity,
ratio, age range, fee tiers) live as JSON on `Service.sessionTimes`.

That cap is what makes the whole Rooms & fees area feel cramped: a room
can't own a roll, can't have educators assigned to it, and an eighth room
is impossible without a schema change.

The end state is a `Room` table: unlimited rooms per centre, each with
its own fees, roll, capacity and ratio.

## Why this is not one pull request

`sessionType` is not a detail on the side. It is a column on **23
models**, part of **11 unique constraints**, and referenced by **252
source files**:

| Area | Files |
| --- | ---: |
| API routes | 84 |
| Components | 56 |
| Lib | 25 |
| Tests | 59 |
| Other | 28 |

The models carrying it:

`Absence`, `AmbassadorSession`, `AttendanceAnomaly`, `AttendanceRecord`,
`Booking`, `BookingForecast`, `CasualDayConfig`, `ChildFeeAssignment`,
`ConversionOpportunity`, `DailyAttendance`, `DailyChecklist`,
`EnrolmentApplication`, `FamilyDiscount`, `IllnessRecord`,
`RatioSnapshot`, `ResponsiblePersonEntry`, `RosterShift`,
`ServiceBlockOutDate`, `ServiceExcursion`, `ServiceFeeChange`,
`ServiceHeadcount`, `ShiftTemplate`, `StatementLineItem`.

The sharp edge is the uniques, not the columns. Rules like

```prisma
@@unique([childId, serviceId, date, sessionType])   // Booking, AttendanceRecord
```

are what stop a child being booked into the same room twice on the same
day. Any migration has to keep an equivalent guarantee in force at every
moment — there is no window where it may lapse, because the data it
protects is live attendance and billing.

Four JSON structures are also keyed by session key and have to move:

- `Service.sessionTimes` — the room definitions themselves
- `Service.casualBookingSettings` — per-room casual config
- `Service.ratioSettings` — per-room ratios
- `Child.bookingPrefs.fortnightPattern` — `{week1: {bsc: [...], asc: [...]}}`

## Approach: expand → migrate → contract

Each stage ships on its own, is separately revertible, and leaves the app
working. No stage requires the next one to land.

### Stage 0 — `Room` table, shadow only

Create the table and backfill it. Nothing reads it.

```prisma
model Room {
  id        String   @id @default(cuid())
  serviceId String
  name      String
  /// The enum slot this room came from. Retained forever: it is how
  /// every dual-write and every backfill reconciles, and after the
  /// contraction it is the only record of what a historical row meant.
  legacyKey SessionType?
  capacity  Int?
  ratio     String?
  // …description, age range, staffOnly, disabled, sortOrder, photoUrl
  @@unique([serviceId, legacyKey])
}
```

One row per configured key per service, read out of `Service.sessionTimes`.

**Revert:** drop the table. Nothing references it.

### Stage 1 — dual-key writes

Add a nullable `roomId` beside `sessionType` on each of the 23 models,
backfill it from `(serviceId, sessionType) → Room`, and make every write
path set **both**.

The 84 API routes do *not* each get edited. One resolver —
`resolveRoomId(serviceId, sessionType)` — is called from the shared
write helpers, so the change is concentrated rather than sprayed.

Add the parallel uniques alongside the existing ones:

```prisma
@@unique([childId, serviceId, date, sessionType])  // existing, still enforced
@@unique([childId, roomId, date])                  // new, enforced from now
```

Both hold simultaneously. That is the point — a bug in the resolver
surfaces immediately as a constraint violation on write, not as silent
divergence discovered weeks later in a billing run.

**Before proceeding:** a reconciliation query must return zero rows for
every table:

```sql
SELECT count(*) FROM "Booking" WHERE "roomId" IS NULL;
```

**Revert:** drop the new columns and uniques. Reads never used them.

### Stage 2 — move reads, one surface at a time

Reads switch from `sessionType` to `roomId`, in ascending order of blast
radius, each its own PR:

1. Reporting and read-only surfaces (headcounts, anomalies, forecasts)
2. Rosters and checklists
3. Attendance and the roll
4. Bookings and casual spots
5. Billing — statements, discounts, fee changes

Billing is last deliberately. It is the surface where an error becomes a
wrong invoice to a family rather than a wrong number on a screen.

**Revert:** per surface, independently.

### Stage 3 — rooms become editable

Only now does the cap actually lift. This is the stage that delivers what
was asked for.

- Room CRUD: add, edit, list filtered Active / Disabled / All
- Fee tiers move from `sessionTimes.fees[]` JSON into a `RoomFee` table.
  `ChildFeeAssignment.feeTierId` becomes a real foreign key rather than a
  string pointing into a JSON array, and `ServiceFeeChange` gains proper
  referential integrity.
- `casualBookingSettings`, `ratioSettings` and `fortnightPattern` migrate
  from session-keyed objects to room-keyed rows.

This is the point of no return for the JSON blobs. Everything before it
is reversible; this is not, without a restore.

### Stage 4 — contract

Drop `sessionType` columns and the superseded uniques.

The `SessionType` enum itself stays. Postgres can add enum values but
never remove them, and `Room.legacyKey` keeps using it as the audit trail
for what a pre-migration row meant.

## Risks

**A room key configured but no `Room` row.** The resolver returns null,
`roomId` writes null, and the row is invisible to every Stage 2 read.
Mitigated by the reconciliation gate at the end of Stage 1, and by making
`roomId` `NOT NULL` only once that gate passes.

**Fortnight patterns.** `Child.bookingPrefs` is free-form JSON with a
`.passthrough()` schema, so unknown keys survive parsing. A pattern that
fails to migrate degrades to "this child has no recurring days", which is
silent — it produces no error, just an empty roll. This needs an explicit
count check before and after, not a spot check.

**Two centres, same room name.** `Room.name` must not be globally unique.
Every uniqueness rule is per service.

**Archived vs deleted.** A room with historical attendance can never be
deleted, only disabled. The existing `disabled` flag carries over as
`archivedAt`.

## Estimate

Five to eight pull requests. Stages 0 and 1 are mechanical and low-risk.
Stage 2 is the bulk of the work. Stage 3 is where the user-visible
feature lands.

The honest summary: this is a fortnight of careful work, not an
afternoon, and most of it produces no visible change until Stage 3. That
is the cost of moving a key that 23 tables and 252 files already depend
on — and the reason to do it in this order rather than all at once.
