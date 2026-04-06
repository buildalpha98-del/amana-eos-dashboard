# Billing & Statements System — Design Spec

**Date**: 2026-04-06
**Status**: Approved

## Overview

Extend the existing `Statement` model to support full billing workflow: draft creation with line items, PDF generation, payment recording, email notifications, and an overdue detection cron. Staff get a billing dashboard; parents get enhanced statement detail views.

## Existing Infrastructure (DO NOT recreate)

| Component | Location | Notes |
|---|---|---|
| `Statement` model | `prisma/schema.prisma:4726` | Has contactId, periodStart/End, totalFees, totalCcs, gapFee, status enum, pdfUrl, dueDate |
| `StatementStatus` enum | `prisma/schema.prisma` | `paid`, `unpaid`, `overdue` |
| `SessionType` enum | `prisma/schema.prisma:86` | `bsc`, `asc`, `vc` (lowercase) |
| Parent billing page | `src/app/parent/billing/page.tsx` | Balance summary + statement cards |
| Parent statements API | `src/app/api/parent/statements/route.ts` | GET with withParentAuth |
| Parent hook | `src/hooks/useParentPortal.ts` | `useParentStatements()`, `StatementRecord` type |
| PDF generation pattern | `src/lib/enrolment-pdf.ts` | jsPDF with Amana branding |
| Blob storage | `src/lib/storage.ts` | `uploadFile()` utility |
| Email templates | `src/lib/email-templates/parent-portal.ts` | `parentEmailLayout()` pattern |
| Nav (parent) | `src/app/parent/layout.tsx` | Already has `/parent/billing` |
| Nav (staff) | `src/lib/nav-config.ts` | Needs billing entry added |

## Schema Changes

### Extend `StatementStatus` enum

Add three new values: `draft`, `issued`, `void`. Keep existing `paid`, `unpaid`, `overdue`.

### New: `PaymentMethod` enum

```prisma
enum PaymentMethod {
  bank_transfer
  cash
  card
  direct_debit
  other
}
```

### Extend `Statement` model

Add fields:
- `amountPaid Float @default(0)`
- `balance Float @default(0)`
- `issuedAt DateTime?`
- `notes String? @db.Text`

Add relations:
- `lineItems StatementLineItem[]`
- `payments Payment[]`

Remove the `@@unique([contactId, periodStart, periodEnd])` constraint — a voided statement for a period would block creating a replacement. Duplicate prevention handled at application layer (check for non-void statements in same period before creating).

### New: `StatementLineItem`

```prisma
model StatementLineItem {
  id            String      @id @default(cuid())
  statementId   String
  childId       String
  date          DateTime    @db.Date
  sessionType   SessionType // Reuse existing enum: bsc, asc, vc
  description   String
  grossFee      Float
  ccsHours      Float       @default(0)
  ccsRate       Float       @default(0)
  ccsAmount     Float       @default(0)
  gapAmount     Float
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  statement     Statement @relation(fields: [statementId], references: [id], onDelete: Cascade)
  child         Child     @relation("ChildStatementLines", fields: [childId], references: [id])

  @@index([statementId])
}
```

### New: `Payment`

```prisma
model Payment {
  id            String        @id @default(cuid())
  statementId   String?
  contactId     String
  serviceId     String
  amount        Float
  method        PaymentMethod
  reference     String?
  receivedAt    DateTime      @default(now())
  recordedById  String?
  notes         String?       @db.Text
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  statement     Statement?     @relation(fields: [statementId], references: [id], onDelete: SetNull)
  contact       CentreContact  @relation("ContactPayments", fields: [contactId], references: [id])
  service       Service        @relation("ServicePayments", fields: [serviceId], references: [id])
  recordedBy    User?          @relation("PaymentRecordedBy", fields: [recordedById], references: [id])

  @@index([contactId, receivedAt])
  @@index([statementId])
}
```

### Relation additions on existing models

- `CentreContact`: add `payments Payment[] @relation("ContactPayments")`
- `Service`: add `payments Payment[] @relation("ServicePayments")`
- `Child`: add `statementLineItems StatementLineItem[] @relation("ChildStatementLines")`
- `User`: add `recordedPayments Payment[] @relation("PaymentRecordedBy")`

## PDF Generation

**File**: `src/lib/billing/statement-pdf.ts`

**Function**: `generateStatementPdf(statementId: string): Promise<string>`

1. Fetch statement with lineItems (include child name), contact, service
2. Generate PDF using jsPDF + jspdf-autotable:
   - Header: Amana OSHC branding (#004E64 bar, gold "Amana" text), "Statement of Account"
   - Family details: parent name, service, period
   - Line items table: Child | Date | Session | Gross Fee | CCS Est. | Gap Fee
   - Totals row
   - Payment summary: Amount Paid, Balance Outstanding
   - Footer disclaimer about CCS estimates
3. Upload via `uploadFile()` to `statements/{serviceId}/{statementId}.pdf`
4. Update statement record with pdfUrl
5. Return pdfUrl

**Error handling**: If PDF generation or upload fails, log a warning via structured logger. Do NOT send the statement email until PDF is successfully generated — chain them: PDF first, then email.

## Email Notifications

**File**: `src/lib/notifications/billing.ts`

Three exports using `parentEmailLayout()` + Resend:

1. `sendStatementIssuedNotification(statementId)` — statement ready email with PDF link
2. `sendPaymentReceivedNotification(paymentId)` — payment confirmation with balance
3. `sendOverdueStatementNotification(statementId)` — overdue reminder

## Staff API Routes

All wrapped in `withApiAuth()`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/billing/statements` | List with filters (serviceId, contactId, status, periodFrom, periodTo) |
| GET | `/api/billing/statements/[id]` | Detail with lineItems (child names), payments, contact |
| POST | `/api/billing/statements` | Create draft with line items |
| PATCH | `/api/billing/statements/[id]` | Edit draft (line items, notes, dates) — draft status only |
| POST | `/api/billing/statements/[id]/issue` | Issue: set status, generate PDF, then send email |
| POST | `/api/billing/statements/[id]/void` | Void a draft/issued statement |
| POST | `/api/billing/payments` | Record payment, update statement balance |
| GET | `/api/billing/families/[familyId]/summary` | Family account overview |

### Statement creation logic

- Validate with Zod: contactId, serviceId, periodStart, periodEnd, lineItems[] (each with childId, date, sessionType as `z.enum(["bsc","asc","vc"])`, description, grossFee, ccsHours, ccsRate, ccsAmount, gapAmount), dueDate?, notes?
- Application-level duplicate check: reject if non-void statement exists for same contactId + period
- Auto-calculate: totalFees (sum grossFee), totalCcs (sum ccsAmount), gapFee (totalFees - totalCcs), balance = gapFee
- Status: `draft`
- Use `prisma.$transaction` for atomic create

### Issue logic

- Update status → `issued`, issuedAt → now()
- Chain: generate PDF first, then send email notification (not parallel fire-and-forget)
- If PDF fails, log warning; still mark as issued but don't send email with broken PDF link
- Whole chain is fire-and-forget from the response perspective (don't block HTTP response)

### Payment recording

- Create Payment record
- If statementId: recalculate balance = gapFee - sum(payments.amount)
- If balance <= 0: update status → `paid`
- Send notification (fire and forget)

## Parent API Routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/parent/statements` | **Exists** — enhance: use `balance` field, filter out `draft`/`void`, include `issued` in balance calc |
| GET | `/api/parent/statements/[id]` | **New** — full detail with line items |

Both use `withParentAuth()`. Detail endpoint validates statement belongs to parent's contacts.

### Parent balance calculation fix

The existing parent statements API filters `unpaid || overdue` for balance. Must update to:
- Filter displayed statements: `status NOT IN (draft, void)` — parents never see drafts or voided statements
- Balance calculation: sum `balance` field (not `gapFee`) for statements where `status IN (issued, unpaid, overdue)`

### StatementRecord type additions

Add to the existing `StatementRecord` interface:
- `amountPaid: number`
- `balance: number`
- `issuedAt: string | null`
- `notes: string | null`

## Staff Billing Dashboard

**Page**: `src/app/(dashboard)/billing/page.tsx`
**Component**: `src/components/billing/BillingDashboard.tsx`

Layout:
1. PageHeader: "Billing" + "New Statement" primary button
2. Summary cards (3): Total Outstanding, Statements This Week, Overdue Count
3. Filter bar: Service select, Status filter, Week picker
4. Statements table: Family | Service | Week | Gap Fee | Paid | Balance | Status badge | Actions

Status badges:
- draft: grey
- issued: blue
- paid: green
- unpaid: amber
- overdue: red
- void: grey with strikethrough

Actions per row:
- Issue (draft only)
- Record Payment (issued/overdue) → Radix Dialog
- View → slide-out with line items and payments
- Void (draft/issued) → confirmation dialog

**New Statement Dialog**: Family selector, service, week dates, due date, line items builder with running totals.

**Record Payment Dialog**: Amount, method select (PaymentMethod enum values), reference, date, notes.

**Navigation**: Add `{ href: "/billing", label: "Billing", icon: Receipt, section: "Operations" }` to `nav-config.ts`. Use `Receipt` icon (not `DollarSign` which is already used by Financials).

## Parent Portal Enhancement

Enhance existing `src/app/parent/billing/page.tsx`:
- Add statement detail view (click card → expand to show line items)
- Show amountPaid and balance fields (newly added to model)
- Status badges: `issued` (blue), `paid` (green), `unpaid` (amber), `overdue` (red) — do NOT show `draft` or `void` to parents

## Cron: Overdue Statements

**File**: `src/app/api/cron/overdue-statements/route.ts`

- Auth: `verifyCronSecret`
- Find statements: status=`issued`, dueDate < today, balance > 0
- Update each to status=`overdue`
- Send `sendOverdueStatementNotification` for each (fire and forget)
- Return count

**Schedule**: `"0 22 * * *"` (10pm UTC daily) — add to vercel.json crons array.

## Testing Strategy

Priority tests:
1. Statement CRUD routes: auth, validation, create, issue, void
2. Payment recording: balance recalculation, status transition to paid
3. Parent statement detail: auth boundary (can't see other family's statements)
4. PDF generation: verify it doesn't throw (mock blob upload)
5. Overdue cron: status transition logic

## Files to Create/Modify

**Create**:
- `src/lib/billing/statement-pdf.ts`
- `src/lib/notifications/billing.ts`
- `src/app/api/billing/statements/route.ts` (GET list + POST create)
- `src/app/api/billing/statements/[id]/route.ts` (GET detail + PATCH edit draft)
- `src/app/api/billing/statements/[id]/issue/route.ts`
- `src/app/api/billing/statements/[id]/void/route.ts`
- `src/app/api/billing/payments/route.ts`
- `src/app/api/billing/families/[familyId]/summary/route.ts`
- `src/app/api/parent/statements/[id]/route.ts`
- `src/components/billing/BillingDashboard.tsx`
- `src/hooks/useBilling.ts`
- `src/app/(dashboard)/billing/page.tsx`
- `src/app/api/cron/overdue-statements/route.ts`

**Modify**:
- `prisma/schema.prisma` — extend Statement + StatementStatus enum, add PaymentMethod enum, StatementLineItem, Payment, inverse relations
- `src/lib/nav-config.ts` — add Billing nav item with Receipt icon
- `src/app/api/parent/statements/route.ts` — filter out draft/void, use balance field, include issued in balance calc
- `src/app/parent/billing/page.tsx` — add detail view, new status badges (no draft/void for parents)
- `src/hooks/useParentPortal.ts` — update StatementRecord type with amountPaid/balance/issuedAt/notes, add useParentStatementDetail hook
- `vercel.json` — add overdue-statements cron
