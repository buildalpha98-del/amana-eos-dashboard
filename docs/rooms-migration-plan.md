# Making rooms first-class records

**Status:** Stages 0 and 1 complete, gate passed. Stage 2 started. Stages 3–4 are still proposal.
**Written:** 2026-08-09 · **Stage 0 landed:** 2026-08-10 · **Stage 1 landed:** 2026-08-10

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

### Stage 0 — `Room` table, shadow only ✅ BUILT

Create the table and backfill it. Nothing reads it.

**What landed:**

| Piece | Where |
| --- | --- |
| `Room` model + migration | `prisma/schema.prisma`, `prisma/migrations/20260810060000_rooms_stage_0` |
| Pure derivation (no DB import) | `src/lib/rooms-mapping.ts` — `desiredRooms`, `roomKeys` |
| Sync, reconcile, backfill | `src/lib/rooms.ts` |
| Deploy backfill | `prisma/seed-rooms.ts`, called from `prisma/seed.ts` |
| Gate endpoint | `GET/POST /api/services/rooms/backfill` (owner/head_office) |
| Kept in step | `PATCH /api/services/[id]` on any `sessionTimes` write; `POST /api/services` on create |

Three decisions worth carrying into Stage 1:

- **A room exists if the slot was ever configured**, which is broader
  than `activeSessionKeys`. That helper drops an extra with no label,
  correctly, because an unnamed slot shouldn't appear on a booking form.
  But bookings may already reference the key, and they need a room to
  belong to. Disabled rooms are kept for the same reason.
- **Orphans are reported, never deleted.** A room reaches that state by
  being configured and then removed from the JSON, and may have
  attendance behind it.
- **The sync swallows its own failures** (`syncRoomsQuietly`). The JSON
  write is the truth and has already succeeded; a shadow failure must
  not roll back someone's settings save. **This inverts at Stage 2**,
  when reads move and the table stops being optional.

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

### Stage 1 — dual-key writes ✅ BUILT

Add a nullable `roomId` beside `sessionType` on each of the 23 models,
backfill it from `(serviceId, sessionType) → Room`, and make every write
path set **both**.

**Correction to this plan, made while building it.** There are no
shared write helpers to hook — that claim was wrong. Measured, it is
**34 write sites across 18 models** that put a `sessionType` into a
payload, and each was edited by hand to call `resolveRoomId`. Bookings
were the one genuine exception: all three creation paths go through
`generateBookings`, so `stampRoomIds` covers them in one place.

What makes 34 hand-edits survivable is that `roomId` is a pure function
of `(serviceId, sessionType)` — `Room` holds exactly one row per slot per
service. A site that misses the dual write leaves a null the backfill
re-derives, rather than a loss that has to be reconstructed from intent.

| Piece | Where |
| --- | --- |
| Resolver, batch resolver, `stampRoomIds` | `src/lib/room-resolver.ts` |
| Columns, FKs, backfill, parallel uniques | `prisma/migrations/20260810230000_rooms_stage_1` |
| Null counting + re-runnable backfill | `src/lib/rooms.ts` — `countUnresolvedRooms`, `backfillRoomIds` |
| Gate | `GET/POST /api/services/rooms/backfill` |

Two decisions worth carrying into Stage 2:

- **The resolver never throws.** A lookup failure returns null and logs.
  `sessionType` is still the key every read uses, so a null `roomId` is a
  degraded shadow rather than a broken record — and throwing would turn
  a rooms outage into a family unable to book. **This inverts at Stage
  2**, when a null stops being survivable.
- **A null `roomId` is legitimate on the four models where
  `sessionType` is optional** (`FamilyDiscount`, `ServiceBlockOutDate`,
  `ServiceExcursion`, `ServiceHeadcount`). No slot means service-wide.
  `countUnresolvedRooms` excludes those rows rather than reporting a gap
  that isn't one.

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

**Before STARTING Stage 1**, the Stage 0 gate must be clean —
`GET /api/services/rooms/backfill` returning `clean: true` with no
`missing` or `drifted` entries. A shadow table nobody has checked is
worth nothing, and its failure mode is silent precisely because nothing
reads it yet.

**Gate passed 2026-08-11** — the reconciliation reported clean on every
service and every table, so `roomId` was made **NOT NULL** on the 14
models where `sessionType` is itself required (migration
`20260811001500_rooms_stage_1_not_null`), and the foreign key moved from
`SET NULL` to `RESTRICT` — meaningless against a non-null column, and
the honest rule anyway: a room with attendance behind it must not be
deletable, only retired.

The four models where `sessionType` is optional keep a nullable `roomId`.
No slot means service-wide, so a null room is the right answer there.

**Making it NOT NULL is what found the rest of Stage 1.** The compiler
flagged **six write sites the regex scan had missed** — roll-call bulk,
roster copy-week, both parent booking routes, family service assignment,
and every billing statement line item — plus the enrolment paths that
reach `createMany` through `generateBookings`. A hand audit found 34;
the type system found the remainder, because a required column cannot be
forgotten.

Two helpers came out of it, and the split is the point:

- `requireRoomId` / `requireFromMap` / `stampRequiredRoomIds` throw —
  used where `roomId` is NOT NULL. "No room" there is a record that
  cannot exist, and refusing the write beats a booking nobody can place.
- `resolveRoomId` / `resolveRoomIds` / `stampRoomIds` stay nullable —
  used on the four service-wide models.

`resolveRoomId` also **re-derives before giving up**: on a miss it syncs
the service's rooms from its settings and retries once. The room is
derivable from that JSON — the premise of the whole migration — so a
miss is a cue to re-derive rather than an error, and that is what makes
NOT NULL safe on a booking path.

**Revert:** drop the new columns and uniques. Reads never used them.

### Stage 2 — move reads, one surface at a time 🚧 STARTED

**Scope correction.** The plan ordered this by blast radius, starting
with reporting. Two of those surfaces can't move at all:
`AttendanceAnomaly` and `RatioSnapshot` store `sessionType` as a plain
`String`, not the enum, so Stage 1 never gave them a `roomId`. The same
goes for `AmbassadorSession` and `EnrolmentApplication`.

More importantly, blast radius is the wrong axis. Moving 42 reporting
reads changes nothing anybody can see and gets no closer to the point of
the migration. What blocks Stage 3 is not reads in general — it is the
surfaces that ENUMERATE rooms. They ask for the seven slots and look
each one up, so an eighth room could exist and still render nowhere.

So Stage 2 now runs room-listing surfaces first:

| Surface | State |
| --- | --- |
| `GET /api/services/[id]/rooms` + `useServiceRooms` | ✅ built |
| Rooms & fees list | ✅ reads room records |
| Room detail panel | ✅ takes the room record |
| Casual spots picker | ✅ reads room records |
| Parent booking form | ✅ rooms travel on `/api/parent/centres` |
| Casual booking settings | ✅ one card per room record |
| The roll — API + daily view | ✅ any room, named |
| The roll — weekly grid, sign in/out | ✅ |
| Reporting, billing | ⬜ — and lower priority than the plan claimed |

Fees stay in the JSON through Stage 2, keyed by `legacyKey`. They move to
a `RoomFee` table in Stage 3; pulling them across early would mean
writing that table before anything reads it — the shadow-write problem
Stage 0 already solved once, and not worth solving twice.

Every room opens the detail panel now, including one the enum never knew
about — and all four of its tabs work. The children route is addressed
by room id rather than slot (`/rooms/[roomId]/children`), and the
block-out and fee-change payloads carry `roomId` so the panel filters on
that. A closure with a null room still means the whole centre, which is
why that filter reads `roomId === null || roomId === room.id` rather
than dropping the null case.

Nothing in the panel reads `sessionTimes` or a session key any more.

The parent side moved the same way, with one difference worth recording:
families can't call `/api/services/[id]/rooms` (staff session), so the
rooms travel on `/api/parent/centres` instead, filtered to active and
non-staff-only in the query rather than in the form. `sessionTimes` came
OFF that payload entirely — leaving it there is an invitation to reach
past the records into the JSON again.

That route also carries the one fallback in Stage 2: a centre with no
`Room` rows derives them from its JSON, with `id: null` to say so. Every
service write path syncs rooms and the Stage 0 backfill covered the rest,
so it should never fire — but `syncRoomsQuietly` swallows failures by
design, and the cost of being wrong on this surface is a family opening
the booking form to no programmes and no explanation.

### The roll is not like the others

Every surface above was a room LIST that happened to be built from the
enum. The roll is different, and it's worth writing down before starting
it, because the scale isn't obvious from the outside:

- Four separate hardcoded label maps — `ServiceRollCallTab` (`bsc: "BSC"`),
  `ServiceSignInOutTab` (`bsc: "Before school"`), `RatioWidget`, and the
  shared `lib/session-labels.ts` that none of the first three use.
- `["bsc","asc","vc"]` written literally in the tab rows of
  `ServiceRollCallTab`, `ServiceSignInOutTab`, `EmptyCellPicker` and
  `AddChildDialog`, and as a narrowed TYPE in `useWeeklyRollCall`,
  `ServiceWeeklyRollCallGrid` and `WeeklyRollCallCell` — so extras can't
  even be represented at the boundary.
- `/api/attendance/roll-call` **rejects** anything else: a literal
  whitelist on GET and a `z.enum(["bsc","asc","vc"])` on POST. Same in
  the bulk route.

So a centre with an extra room can already have attendance against it
(the write paths resolve `roomId` correctly and store it), and the roll
will neither show it nor accept an action for it. Fixing that means the
API accepting a room, the hooks carrying one, and the cells keyed by one
— not a label swap. It's the largest single piece left in Stage 2 and
should be its own change, with the daily roll first and the weekly grid
second.

Worth noting the write side is already done: `requireRoomId` is called on
every create branch in both roll-call routes. It's only the READ path
that never returns the `roomId` it just stored.

**Done so far:** the API and the daily view.

- Both handlers accept any `SessionType` — `z.nativeEnum($Enums.SessionType)`
  on POST in the single and bulk routes, and on GET the whitelist became
  a lookup: the room must exist at this centre, keyed `(serviceId,
  legacyKey)`. A slot the centre doesn't run now 404s "that isn't a room
  at this centre" rather than 400ing "must be bsc, asc, or vc", which was
  actively wrong at a centre running four rooms.
- The GET returns `room: { id, name, retired }`. That's the first time
  the read path has handed back the `roomId` the write path stores.
  `retired` rather than refusing: a retired room's roll is a regulatory
  record and still has to open.
- The daily tab row is one tab per room, in the centre's order, named by
  the room. Its local `{bsc:"BSC"}` map is gone. The selection is derived
  during render rather than corrected in an effect — an effect would
  render one frame asking the API for a room the centre doesn't have.

**Then the weekly grid and the door screen.** All four narrowed types
(`useWeeklyRollCall`'s two, `CellShift`, the grid's own) now take the
Prisma `SessionType`, so an extra room's attendance can at least be
REPRESENTED — it couldn't be before, however correct the database row.

- The empty-cell picker offers one button per room ("Book Homework
  Club"), and the add-child dialog's grid is Mon–Fri × however many
  rooms the centre has, not a fixed 5×3.
- `CellShift` gained an optional `roomName`, attached by the grid when
  it builds the shifts. A weekly cell is too small for "Amana
  Afternoons" in full, so the chip truncates and carries the whole name
  in its `title` and aria-label. Abbreviating was the alternative and it
  was rejected: "Homework Club" and "Holiday Quest" both give HC.
- `ServiceSignInOutTab` had the third independent label map in the roll
  ("Before school"). It's gone; the door shows room names.

**The roll's four label maps are now one thing: the room's name.**

Left in Stage 2: reporting and billing. Both are lower priority than the
plan originally claimed — see the note above.

The original ordering, for reference:

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
