# Waitlist Management System — Design Spec

**Date:** 2026-03-24
**Status:** Approved

## Context

Amana OSHC has 11 active centres with capacity limits. When a service is full, there's no way to track waiting families — enquiries get stuck in "info_sent" or go cold. Every unfilled spot after a cancellation is lost revenue because there's no automated system to offer it to the next family.

## Data Model Changes

### ParentEnquiry — new fields

```prisma
waitlistPosition    Int?        // FIFO order within service
waitlistJoinedAt    DateTime?   // when added to waitlist
waitlistOfferedAt   DateTime?   // when spot was offered
waitlistExpiresAt   DateTime?   // 48h from offer
waitlistServiceId   String?     // service they're waiting for
```

### Service — capacity fields

```prisma
capacityBsc    Int?   // before school care max
capacityAsc    Int?   // after school care max
capacityVc     Int?   // vacation care max
```

### Enquiry stage addition

Current: `new_enquiry → info_sent → nurturing → form_started → enrolled → first_session → ...`

New: `new_enquiry → info_sent → waitlisted → nurturing → form_started → enrolled → first_session → ...`

Add `waitlisted` to the stage pipeline. OWNA sync maps "waitlisted" → `waitlisted` (currently maps to `info_sent`).

## API Endpoints

### `PATCH /api/enquiries/[id]` — existing, extend

When `stage` changes to `waitlisted`:
- Auto-assign `waitlistPosition` = max position + 1 for that service
- Set `waitlistJoinedAt` = now
- Set `waitlistServiceId` = enquiry's current serviceId
- Send waitlist confirmation email (fire-and-forget)

### `POST /api/waitlist/offer-spot` — new

Accepts `{ serviceId, careType?: "bsc" | "asc" | "vc" }`.
- Finds next enquiry: stage=waitlisted, waitlistServiceId=serviceId, ordered by waitlistPosition ASC, no active offer (waitlistOfferedAt is null)
- Sets waitlistOfferedAt=now, waitlistExpiresAt=now+48h
- Sends "spot available" email with enrolment form link
- Returns the offered enquiry

### `GET /api/waitlist` — new

Query params: `serviceId`, `status` (waiting|offered|expired).
Returns waitlisted enquiries with position, days waiting, offer status.

### `POST /api/waitlist/reorder` — new

Accepts `{ serviceId, orderedIds: string[] }`.
Updates waitlistPosition for each enquiry. Owner/admin only.

### Cron: `/api/cron/waitlist-expiry` — new

Runs hourly. Finds enquiries where `waitlistExpiresAt < now` and `stage = waitlisted`.
- Clears the offer (nullify waitlistOfferedAt, waitlistExpiresAt)
- Auto-offers to the next person in line
- Sends "spot expired" email to the family that didn't respond
- Sends "spot available" email to the next family

## Email Templates

### 1. Waitlist Confirmation
Subject: "You're on the Waitlist — Amana OSHC [Service Name]"
Body: Position number, what to expect, contact info.

### 2. Spot Available
Subject: "A Spot Has Opened! — Amana OSHC [Service Name]"
Body: 48-hour response window, enrolment form CTA button, contact info.

### 3. Spot Expired
Subject: "Waitlist Update — Amana OSHC"
Body: Gentle notification that spot was offered to next family. Option to stay on waitlist.

## Frontend

### Enquiries page — Waitlist column

Add `waitlisted` as a visible kanban column (between Info Sent and Nurturing).
- Shows position badge (#1, #2, #3...)
- Shows days waiting
- Shows offer status (waiting / offered / expired)
- Drag to reorder within column

### Service detail panel — Capacity widget

In the ServiceOverviewTab, add a capacity section:
- BSC: X / Y enrolled (Z on waitlist)
- ASC: X / Y enrolled (Z on waitlist)
- Progress bar: green < 80%, amber 80-95%, red > 95%
- "Open Spot" button → triggers offer to next waitlisted family

### Waitlist management page (optional, v2)

Dedicated `/waitlist` page with cross-service view. Not in v1 scope.

## Nurture Integration

When stage changes to `waitlisted`, schedule:
- Waitlist check-in email after 14 days ("You're still on our waitlist, we haven't forgotten you")
- Monthly position update email ("You're now #X on the waitlist")

## OWNA Sync

Update `src/lib/owna-sync.ts`:
- Map OWNA "waitlisted" status → `waitlisted` stage (currently maps to `info_sent`)
- Preserve waitlistPosition if already set

## Files to create/modify

### New files:
- `src/app/api/waitlist/route.ts` — GET list
- `src/app/api/waitlist/offer-spot/route.ts` — POST offer
- `src/app/api/waitlist/reorder/route.ts` — POST reorder
- `src/app/api/cron/waitlist-expiry/route.ts` — hourly cron
- `src/lib/email-templates/waitlist.ts` — 3 email templates
- `src/hooks/useWaitlist.ts` — React Query hooks

### Modified files:
- `prisma/schema.prisma` — new fields on ParentEnquiry + Service
- `src/app/api/enquiries/[id]/route.ts` — handle waitlisted stage transition
- `src/lib/nurture-scheduler.ts` — add waitlist nurture steps
- `src/lib/owna-sync.ts` — fix waitlisted mapping
- `src/app/(dashboard)/enquiries/page.tsx` — add waitlisted kanban column
- `src/components/enquiries/EnquiryKanban.tsx` — waitlist column + position badges
- `src/components/services/ServiceOverviewTab.tsx` — capacity widget
- `vercel.json` — add waitlist-expiry cron schedule

## Verification

1. Create an enquiry, drag to "waitlisted" → verify position assigned, email sent
2. Click "Offer Spot" on a service → verify next waitlisted enquiry gets email with 48h window
3. Wait for expiry (or manually trigger cron) → verify auto-offers to next person
4. Drag to reorder waitlist → verify positions update
5. Check OWNA sync maps "waitlisted" correctly
6. Build passes, tests pass
