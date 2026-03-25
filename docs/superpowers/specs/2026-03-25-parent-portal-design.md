# Parent Portal MVP — Design Spec

**Date:** 2026-03-25
**Status:** Approved
**Scope:** Read-only parent portal with magic link auth, children view, attendance, account management

## Authentication

- Magic link email — parent enters email at `/parent/login`
- System checks `EnrolmentSubmission` or `ParentEnquiry` for matching email
- Sends magic link via Resend (15min expiry, single-use, 32-byte random token hashed in DB)
- Link verifies token at `/api/parent/auth/verify`, sets `parent-session` JWT cookie (7-day TTL)
- JWT signed with `PARENT_JWT_SECRET` env var (separate from NextAuth `NEXTAUTH_SECRET`)
- Rate limit: 3 magic links per email per hour
- Separate from staff auth — parents never see the dashboard

## Schema Addition

```prisma
model ParentMagicLink {
  id         String   @id @default(cuid())
  email      String
  tokenHash  String   @unique
  expiresAt  DateTime
  usedAt     DateTime?
  createdAt  DateTime @default(now())

  @@index([email])
  @@index([tokenHash])
}
```

## Routes

| Route | Type | Description |
|-------|------|-------------|
| `/parent/login` | Public | Email input → sends magic link |
| `/parent` | Authed | Dashboard — children cards, quick stats |
| `/parent/children/[id]` | Authed | Child detail — attendance, medical |
| `/parent/bookings` | Authed | Upcoming bookings list |
| `/parent/account` | Authed | Update contact, emergency contacts, medical |

## API Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/parent/auth/send-link` | Public | Validate email exists, create token, send email |
| GET | `/api/parent/auth/verify` | Public | Verify token, set JWT cookie, redirect |
| GET | `/api/parent/me` | Parent JWT | Return parent profile + children summary |
| GET | `/api/parent/children` | Parent JWT | List children with attendance stats |
| GET | `/api/parent/children/[id]/attendance` | Parent JWT | Attendance history for one child |
| PATCH | `/api/parent/account` | Parent JWT | Update contact details, emergency contacts |

## Data Sources

- **Children**: `EnrolmentSubmission.children` JSON + `Child` records (OWNA sync)
- **Attendance**: `AttendanceRecord` table (synced daily from OWNA)
- **Medical**: `EnrolmentSubmission.children[].medical` JSON
- **Contact details**: `EnrolmentSubmission.parents` JSON
- **Service info**: `Service` table (name, address, phone)

## Layout

- Separate from dashboard — own layout, no sidebar/EOS nav
- Header: Amana OSHC logo + parent name + logout button
- Mobile-first design (parents primarily use phones)
- Bottom tab bar: Home, Children, Bookings, Account
- Brand: Midnight Green header (#004E64), Jonquil accents (#FECE00)
- Safe area padding for notched devices

## Security

- Parents can ONLY see data matching their email
- Email matched against `EnrolmentSubmission.parents[].email`
- No access to staff data, EOS data, or other families
- JWT contains: `{ email, name, enrolmentIds[], exp }`
- All parent API routes validate JWT before responding
- Magic link tokens: `crypto.randomBytes(32)`, SHA-256 hashed before storage

## Email Template

`parentMagicLinkEmail(name, loginUrl)` — uses `parentEmailLayout` base:
- Subject: "Log in to Amana OSHC Parent Portal"
- Body: greeting, "Click to log in" button, 15min expiry note, contact info

## What this does NOT include (future phases)

- Online booking/cancellation (Phase 2)
- Invoice viewing and payment (Phase 2)
- Daily activity feed / photos (Phase 3)
- Push notifications (Phase 3)
- Two-way messaging with coordinators (Phase 3)
