# Staff Time-Clock v1 — Design

**Status:** approved 2026-05-04
**Builds on:** Connecteam-style roster v1 (PRs #50–#55)
**Author:** Claude (brainstormed with Jayden 2026-05-04)

## Problem

Educators and Directors of Service work to a published roster (PR #50–#55
shipped the per-service weekly grid + cert + ratio + cost-projection
infrastructure), but there's no record of when staff actually started or
finished their shift. Without that:

- Timesheet exports run off scheduled hours, so overtime / under-time
  goes invisible until payroll catches it manually.
- Regulatory ratios are validated against scheduled staff (PR #50), not
  against staff actually on site — a no-show during a session can pass
  the ratio check.
- Wage-cost projections (PR #55) can't be reconciled against actual
  paid hours.

This spec adds a v1 time-clock that lets staff record actual sign-in
and sign-out times against their roster shift.

## Goals (v1)

1. Staff can clock in / clock out from My Portal on their own phone
   (self-service, session-authed).
2. Staff can clock in / clock out at a shared centre tablet (kiosk,
   token + PIN authed).
3. The actual start / end times are recorded against the existing
   `RosterShift` row.
4. Unscheduled walk-ins (staff turns up without a published shift)
   create a fresh `RosterShift` with `status="unscheduled"` so admin
   can reconcile later.
5. Variance against scheduled times is surfaced in the per-service
   Weekly Roster grid as a small per-shift badge.

## Non-goals (v1, deferred to followup)

- Geofencing on clock-in (require GPS proximity to the centre)
- Photo-on-clock-in
- Auto clock-out cron (today: leave the row open and surface a
  "still clocked in" admin warning)
- Per-service PIN policy (length, expiry, lockout-after-N)
- Shift-swap → clock-in handoff
- Bulk timesheet export against actual hours (data is in place; the
  export refactor is a separate PR)

## Schema (additive migration)

All purely additive — no production data risk.

### `RosterShift` — two new columns

```prisma
actualStart  DateTime?
actualEnd    DateTime?
```

When unscheduled clock-in fires, a brand-new `RosterShift` row is
created with `status = "unscheduled"`, `actualStart = now()`, no
prior `shiftStart`/`shiftEnd` values needed (we'll seed `shiftStart`
to `now()` floored to nearest 15min for grid display, `shiftEnd`
remains null until clock-out).

### New `Kiosk` model

```prisma
model Kiosk {
  id           String    @id @default(cuid())
  serviceId    String
  service      Service   @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  label        String    // "Front desk iPad"
  tokenHash    String    // bcrypt hash of the long bearer issued at register
  createdById  String?
  createdBy    User?     @relation("KioskCreator", fields: [createdById], references: [id], onDelete: SetNull)
  revokedAt    DateTime?
  lastSeenAt   DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  @@index([serviceId])
  @@index([revokedAt])
}
```

### `User` — two new columns

```prisma
kioskPinHash   String?   // bcrypt; staff-set, admin-resettable (cleared, never read)
kioskPinSetAt  DateTime?
```

## API surface

### Self-service (session-authed)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/roster/clock-in/auto` | "Just clock me in." Server picks the eligible shift in ±2h window. Returns `{ shift }` on unique match, `{ ambiguous: true, candidates: [...] }` on multiple. If no eligible shift → 404 with hint to call `/unscheduled`. |
| `POST` | `/api/roster/shifts/[id]/clock-in` | Clock in against a specific shift the staff has explicitly chosen. Sets `actualStart = now()` if not already set; idempotent on second call. |
| `POST` | `/api/roster/shifts/[id]/clock-out` | Sets `actualEnd = now()`. 400 if `actualStart` is null. |
| `POST` | `/api/roster/unscheduled-clock-in` | Fallback when no scheduled shift in window. Creates a `RosterShift` with `status="unscheduled"`, `actualStart=now()`, `sessionType` inferred from time-of-day (BSC < 9am, ASC > 2pm, VC otherwise). |
| `PATCH` | `/api/me/kiosk-pin` | Staff sets / changes their own PIN. Body: `{ pin: "XXXX" }`. Hashed before storing. Validates 4-digit numeric. |

### Kiosk (kiosk-bearer auth)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/kiosk/clock` | Body: `{ userId, pin, action: "in" \| "out" }`. Validates the bearer matches a non-revoked `Kiosk`, looks up user by id, validates PIN against `kioskPinHash`, then runs the same auto-pick logic. Rate-limited 5 attempts / minute / userId on failed PIN. Updates `Kiosk.lastSeenAt`. |
| `GET` | `/api/kiosk/staff` | Returns the staff list for the kiosk's service (for the staff-picker grid). |

### Admin (org-wide roles)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/kiosks` | Register a kiosk. Body: `{ serviceId, label }`. Returns the bearer token **once**, in plaintext, plus a short pairing code. The token is then bcrypt-hashed and stored. |
| `GET` | `/api/kiosks` | List all kiosks (or filter by `?serviceId=`). |
| `DELETE` | `/api/kiosks/[id]` | Revokes (sets `revokedAt`). |
| `POST` | `/api/users/[id]/reset-kiosk-pin` | Clears the user's `kioskPinHash`. Audit-logged. |

## Auto-pick logic (pure function)

`pickEligibleShift(shifts, now, action)` lives at `src/lib/timeclock-pick.ts`:

```
- Filter shifts to those for `userId` (already done by caller)
- For action="in": eligible = shiftStart - 2h <= now <= shiftStart + 2h, AND actualStart IS NULL
- For action="out": eligible = actualStart IS NOT NULL AND actualEnd IS NULL
- Return:
  - { match: shift } if exactly one
  - { ambiguous: true, candidates: shifts } if more than one
  - { match: null } if none
```

The `±2h` window is hard-coded for v1; per-service tolerance is a
followup if anyone asks.

## UI surfaces

### `MyClockCard` (My Portal)

- Hidden entirely outside the ±2h pre-shift window when there's no
  active clock — keeps My Portal quiet on a non-shift day.
- Visible state machine:
  - Pre-shift (within window, `actualStart` null) → primary button
    "Clock in" + scheduled time + service name
  - Active (clocked in, no end) → primary button "Clock out" + a
    live elapsed-time read-out
  - Post-shift (out of window, `actualEnd` set) → hidden again
  - Ambiguous → list of candidate shifts with per-row "Clock in here"
- Below the primary action: a small "I don't have a scheduled shift"
  link that hits `/unscheduled-clock-in` (only when no eligible match).

### `/kiosk` page (no auth wall)

- First load → if no kiosk token in `localStorage`, show paste-token
  / scan-QR pairing screen.
- Once paired → poll `/api/kiosk/staff` every 60s, render a grid of
  staff faces for the kiosk's service.
- Tap face → PIN pad → `POST /api/kiosk/clock` with action chosen
  by current state (in if not clocked, out if active).
- Toast: "Welcome, Alice — clocked in at 2:58pm".
- Padlock-style screen-saver after N seconds of inactivity to avoid
  someone else stepping up to a half-entered PIN.

### Admin Settings → Kiosks panel

- List existing kiosks with `lastSeenAt`, `revokedAt`.
- "Register a new kiosk" → modal: pick service + label → returns the
  one-time token shown as QR + 8-char short code (admin types it on
  the tablet OR scans the QR).
- "Revoke" button per row.

### My Portal → "My profile" — Kiosk PIN

- Shown only when `kioskPinHash IS NULL` (initial set) or with a
  "Change PIN" button (already set). 4-digit numeric input,
  confirm-twice.

### Service Weekly Shifts grid (PR #50/#51 surface)

- Each shift cell renders a small variance pill below the time:
  - Green "+0" — clocked in within 5 min of scheduled
  - Amber "+12m" — late by 6–29 min
  - Red "+45m" — late by 30+ min
  - Grey "—" — not yet clocked in / future shift
- Tooltip: "Scheduled 15:00 · Clocked in 15:12".

## Testing

- **Pure unit:** `pickEligibleShift(shifts, now, action)` — happy / ambiguous / none / out-of-window / already-clocked-in cases (≥8 cases, no DB).
- **API:**
  - Self-service: clock-in 200, double-clock-in idempotent, clock-out without start → 400, ambiguous → 409 with candidate list, unscheduled creates row.
  - Kiosk: bad PIN → 401, revoked token → 401, valid → 200, rate-limit triggers after 5 failures, `lastSeenAt` updated.
  - Admin: register → token returned once, list, revoke, PIN reset clears hash.
- **Component smoke:** `MyClockCard` open / closed / ambiguous states.

## Sub-PR plan

| # | Title | Scope |
|---|---|---|
| 1 | `feat(timeclock): schema — RosterShift.actual{Start,End} + Kiosk + User.kioskPin*` | Migration only. Generates Prisma client. No behaviour change. |
| 2 | `feat(timeclock): self-service clock-in / out / auto / unscheduled APIs` | The five session-authed endpoints + `pickEligibleShift` lib + tests. |
| 3 | `feat(timeclock): kiosk register/list/revoke + bearer auth + /api/kiosk/clock + PIN endpoints` | Admin-side + kiosk-side APIs + tests. |
| 4 | `feat(timeclock): MyClockCard + /kiosk page + admin Kiosks settings + Set Kiosk PIN` | All four UI surfaces in one PR (they share hooks). |
| 5 | `feat(timeclock): per-shift variance badge in service Weekly Shifts grid` | Read-only display surface. |

Each sub-PR ships independently green; #4 depends on #2+#3 being merged.

## Out of scope / followup queue

See `MEMORY.md` "What Was Built" section. Tracked in
`next-priorities.md` Tier 1 once shipped:

- Geofencing on clock-in
- Photo-on-clock-in
- Auto clock-out cron
- Per-service PIN policy (length, expiry, lockout)
- Shift-swap → clock-in handoff
- Timesheet export against actual hours (data lands here; the export
  refactor is its own PR)
- Mid-week pay-rate proration meeting actual-hours data
