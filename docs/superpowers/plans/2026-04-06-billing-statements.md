# Billing & Statements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add billing workflow to the Amana OSHC dashboard — draft statement creation with line items, PDF generation, payment recording, email notifications, overdue cron, staff billing dashboard, and enhanced parent portal statements view.

**Architecture:** Extend the existing `Statement` model and `StatementStatus` enum. Add `StatementLineItem` and `Payment` models. Staff CRUD via `withApiAuth()` wrapped routes. Parent reads via `withParentAuth()`. PDF via jsPDF + jspdf-autotable uploaded to Vercel Blob. Emails via Resend with `parentEmailLayout()`. Overdue detection via daily cron.

**Tech Stack:** Next.js 16, TypeScript, Prisma 5.22, PostgreSQL, jsPDF, jspdf-autotable, Vercel Blob, Resend, TanStack Query, Radix UI, Zod

**Spec:** `docs/superpowers/specs/2026-04-06-billing-statements-design.md`

---

## File Structure

### New files

| File | Responsibility |
|---|---|
| `src/lib/billing/statement-pdf.ts` | PDF generation + Blob upload for statements |
| `src/lib/notifications/billing.ts` | 3 email notification functions (issued, payment, overdue) |
| `src/app/api/billing/statements/route.ts` | GET list + POST create (staff) |
| `src/app/api/billing/statements/[id]/route.ts` | GET detail + PATCH edit draft (staff) |
| `src/app/api/billing/statements/[id]/issue/route.ts` | POST issue statement (staff) |
| `src/app/api/billing/statements/[id]/void/route.ts` | POST void statement (staff) |
| `src/app/api/billing/payments/route.ts` | POST record payment (staff) |
| `src/app/api/billing/families/[familyId]/summary/route.ts` | GET family account summary (staff) |
| `src/app/api/parent/statements/[id]/route.ts` | GET statement detail (parent) |
| `src/app/api/cron/overdue-statements/route.ts` | Daily overdue detection cron |
| `src/hooks/useBilling.ts` | TanStack Query hooks for staff billing |
| `src/components/billing/BillingDashboard.tsx` | Main staff billing dashboard component |
| `src/components/billing/NewStatementDialog.tsx` | Create statement form dialog |
| `src/components/billing/RecordPaymentDialog.tsx` | Record payment form dialog |
| `src/components/billing/StatementDetailPanel.tsx` | Slide-out statement detail view |
| `src/app/(dashboard)/billing/page.tsx` | Staff billing page shell |
| `src/__tests__/api/billing-statements.test.ts` | Tests for statement routes |
| `src/__tests__/api/billing-payments.test.ts` | Tests for payment routes |

### Modified files

| File | Change |
|---|---|
| `prisma/schema.prisma` | Extend StatementStatus enum, add PaymentMethod enum, extend Statement model, add StatementLineItem + Payment models, add inverse relations |
| `src/lib/nav-config.ts` | Add Billing nav item with Receipt icon |
| `src/app/api/parent/statements/route.ts` | Filter draft/void, use balance field, include issued in balance calc |
| `src/hooks/useParentPortal.ts` | Update StatementRecord type, add useParentStatementDetail hook |
| `src/app/parent/billing/page.tsx` | Add detail view, new status badges, amountPaid/balance display |
| `vercel.json` | Add overdue-statements cron entry |

---

## Chunk 1: Schema + Database

### Task 1: Extend Prisma Schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Extend StatementStatus enum**

In `prisma/schema.prisma`, find the `StatementStatus` enum (around line 107) and add `draft`, `issued`, `void`:

```prisma
enum StatementStatus {
  draft
  issued
  paid
  unpaid
  overdue
  void
}
```

- [ ] **Step 2: Add PaymentMethod enum**

Add immediately after `StatementStatus`:

```prisma
enum PaymentMethod {
  bank_transfer
  cash
  card
  direct_debit
  other
}
```

- [ ] **Step 3: Extend Statement model**

Find the `Statement` model (around line 4726). **Do NOT replace the model — only add to it.** Make these specific changes:

**3a.** Add these 4 new fields after the existing `gapFee` line:
```prisma
  amountPaid  Float           @default(0)
  balance     Float           @default(0)
  issuedAt    DateTime?
  notes       String?         @db.Text
```

**3b.** Change the status default from `@default(unpaid)` to `@default(draft)`:
```prisma
  status      StatementStatus @default(draft)
```

> **WARNING:** This changes the default status for new Statement records. Search the codebase for all `prisma.statement.create` calls and ensure they explicitly set `status` if they need a value other than `draft`. Existing records are unaffected.

**3c.** Add these 2 relation lines inside the model body:
```prisma
  lineItems   StatementLineItem[]
  payments    Payment[]
```

**3d.** Remove the `@@unique([contactId, periodStart, periodEnd])` line.

**3e.** Add this index after the existing indexes:
```prisma
  @@index([status, dueDate])
```

- [ ] **Step 4: Add StatementLineItem model**

Add after the Statement model:

```prisma
model StatementLineItem {
  id          String      @id @default(cuid())
  statementId String
  childId     String
  date        DateTime    @db.Date
  sessionType SessionType
  description String
  grossFee    Float
  ccsHours    Float       @default(0)
  ccsRate     Float       @default(0)
  ccsAmount   Float       @default(0)
  gapAmount   Float
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  statement   Statement   @relation(fields: [statementId], references: [id], onDelete: Cascade)
  child       Child       @relation("ChildStatementLines", fields: [childId], references: [id])

  @@index([statementId])
}
```

- [ ] **Step 5: Add Payment model**

Add after StatementLineItem:

```prisma
model Payment {
  id           String        @id @default(cuid())
  statementId  String?
  contactId    String
  serviceId    String
  amount       Float
  method       PaymentMethod
  reference    String?
  receivedAt   DateTime      @default(now())
  recordedById String?
  notes        String?       @db.Text
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  statement    Statement?    @relation(fields: [statementId], references: [id], onDelete: SetNull)
  contact      CentreContact @relation("ContactPayments", fields: [contactId], references: [id])
  service      Service       @relation("ServicePayments", fields: [serviceId], references: [id])
  recordedBy   User?         @relation("PaymentRecordedBy", fields: [recordedById], references: [id])

  @@index([contactId, receivedAt])
  @@index([statementId])
}
```

- [ ] **Step 6: Add inverse relations on existing models**

Find the `CentreContact` model and add this line inside its body (near the other relation lines like `statements`):
```prisma
  payments           Payment[]           @relation("ContactPayments")
```

Find the `Service` model and add:
```prisma
  payments    Payment[]   @relation("ServicePayments")
```

Find the `Child` model and add:
```prisma
  statementLineItems StatementLineItem[] @relation("ChildStatementLines")
```

Find the `User` model and add:
```prisma
  recordedPayments   Payment[]  @relation("PaymentRecordedBy")
```

- [ ] **Step 7: Push schema to database**

Run: `npx prisma db push`

Expected: Schema changes applied successfully. No errors.

- [ ] **Step 8: Verify Prisma client generates**

Run: `npx prisma generate`

Expected: Prisma client generated successfully.

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(billing): extend Statement model, add StatementLineItem and Payment models"
```

---

## Chunk 2: Email Notifications + PDF Generation

### Task 2: Billing Email Notifications

**Files:**
- Create: `src/lib/notifications/billing.ts`

- [ ] **Step 1: Create billing notifications file**

Create `src/lib/notifications/billing.ts`:

```typescript
/**
 * Billing email notifications for the parent portal.
 *
 * All functions are fire-and-forget safe — they log errors but never throw.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { parentEmailLayout, buttonHtml } from "@/lib/email-templates/base";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "Amana OSHC <noreply@amanaoshc.company>";

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/**
 * Notify a parent that their statement has been issued.
 */
export async function sendStatementIssuedNotification(
  statementId: string,
): Promise<void> {
  try {
    const statement = await prisma.statement.findUniqueOrThrow({
      where: { id: statementId },
      include: {
        contact: { select: { email: true, firstName: true, lastName: true } },
        service: { select: { name: true } },
      },
    });

    const parentName = [statement.contact.firstName, statement.contact.lastName]
      .filter(Boolean)
      .join(" ") || "Parent";
    const weekOf = formatDate(statement.periodStart);
    const portalUrl = `${process.env.NEXTAUTH_URL}/parent/billing`;

    const pdfSection = statement.pdfUrl
      ? buttonHtml("Download Statement", statement.pdfUrl)
      : "";

    const dueDateLine = statement.dueDate
      ? `<p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">Due date: <strong>${formatDate(statement.dueDate)}</strong></p>`
      : "";

    const subject = `Your Amana OSHC statement is ready — week of ${new Date(statement.periodStart).toLocaleDateString("en-AU", { day: "numeric", month: "long" })}`;

    const html = parentEmailLayout(`
      <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
        Assalamu Alaikum ${parentName}
      </h2>
      <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
        Your statement for the week of <strong>${weekOf}</strong> at <strong>${statement.service.name}</strong> is now available.
      </p>
      <p style="margin:0 0 8px;color:#111827;font-size:16px;font-weight:600;">
        Gap fee due: ${formatCurrency(statement.gapFee)}
      </p>
      ${dueDateLine}
      ${pdfSection}
      ${buttonHtml("View in Parent Portal", portalUrl)}
      <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
        Jazak Allahu Khairan,<br/>
        <strong>The Amana OSHC Team</strong>
      </p>
    `);

    if (statement.contact.email) {
      await resend.emails.send({
        from: FROM,
        to: statement.contact.email,
        subject,
        html,
      });
    }
  } catch (err) {
    logger.error("Failed to send statement issued notification", {
      statementId,
      err,
    });
  }
}

/**
 * Notify a parent that their payment has been recorded.
 */
export async function sendPaymentReceivedNotification(
  paymentId: string,
): Promise<void> {
  try {
    const payment = await prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: {
        contact: { select: { email: true, firstName: true, lastName: true } },
        statement: { select: { balance: true } },
      },
    });

    const parentName = [payment.contact.firstName, payment.contact.lastName]
      .filter(Boolean)
      .join(" ") || "Parent";

    const methodLabels: Record<string, string> = {
      bank_transfer: "bank transfer",
      cash: "cash",
      card: "card",
      direct_debit: "direct debit",
      other: "other",
    };

    const referenceLine = payment.reference
      ? `<p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">Reference: <strong>${payment.reference}</strong></p>`
      : "";

    const balanceLine = payment.statement
      ? `<p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">Your current balance is <strong>${formatCurrency(payment.statement.balance)}</strong>.</p>`
      : "";

    const subject = `Payment received — ${formatCurrency(payment.amount)}`;

    const html = parentEmailLayout(`
      <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
        Assalamu Alaikum ${parentName}
      </h2>
      <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
        We have recorded a payment of <strong>${formatCurrency(payment.amount)}</strong> via <strong>${methodLabels[payment.method] ?? payment.method}</strong> on <strong>${formatDate(payment.receivedAt)}</strong>.
      </p>
      ${referenceLine}
      ${balanceLine}
      <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
        Jazak Allahu Khairan,<br/>
        <strong>The Amana OSHC Team</strong>
      </p>
    `);

    if (payment.contact.email) {
      await resend.emails.send({
        from: FROM,
        to: payment.contact.email,
        subject,
        html,
      });
    }
  } catch (err) {
    logger.error("Failed to send payment received notification", {
      paymentId,
      err,
    });
  }
}

/**
 * Notify a parent that their statement is overdue.
 */
export async function sendOverdueStatementNotification(
  statementId: string,
): Promise<void> {
  try {
    const statement = await prisma.statement.findUniqueOrThrow({
      where: { id: statementId },
      include: {
        contact: { select: { email: true, firstName: true, lastName: true } },
        service: { select: { name: true } },
      },
    });

    const parentName = [statement.contact.firstName, statement.contact.lastName]
      .filter(Boolean)
      .join(" ") || "Parent";
    const weekOf = formatDate(statement.periodStart);

    const subject = `Overdue balance — Amana OSHC`;

    const html = parentEmailLayout(`
      <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
        Assalamu Alaikum ${parentName}
      </h2>
      <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
        Your statement for the week of <strong>${weekOf}</strong> has an outstanding balance of <strong>${formatCurrency(statement.balance)}</strong> which was due on <strong>${formatDate(statement.dueDate!)}</strong>.
      </p>
      <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
        Please contact your centre coordinator to arrange payment.
      </p>
      <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
        Jazak Allahu Khairan,<br/>
        <strong>The Amana OSHC Team</strong>
      </p>
    `);

    if (statement.contact.email) {
      await resend.emails.send({
        from: FROM,
        to: statement.contact.email,
        subject,
        html,
      });
    }
  } catch (err) {
    logger.error("Failed to send overdue statement notification", {
      statementId,
      err,
    });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/notifications/billing.ts
git commit -m "feat(billing): add billing email notifications (issued, payment, overdue)"
```

### Task 3: Statement PDF Generation

**Files:**
- Create: `src/lib/billing/statement-pdf.ts`

- [ ] **Step 1: Create statement PDF generator**

Create directory `src/lib/billing/` then create `src/lib/billing/statement-pdf.ts`:

```typescript
/**
 * Generate a branded PDF statement and upload to Vercel Blob.
 *
 * Uses jsPDF + jspdf-autotable matching the pattern in enrolment-pdf.ts.
 */

import { prisma } from "@/lib/prisma";
import { uploadFile } from "@/lib/storage";
import { logger } from "@/lib/logger";
import type jsPDF from "jspdf";

interface LineItemRow {
  childName: string;
  date: string;
  session: string;
  grossFee: number;
  ccsEstimate: number;
  gapFee: number;
}

const SESSION_LABELS: Record<string, string> = {
  bsc: "Before School Care",
  asc: "After School Care",
  vc: "Vacation Care",
};

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/**
 * Generate a statement PDF, upload to Vercel Blob, and update the Statement record.
 *
 * @returns The public Blob URL of the uploaded PDF.
 */
export async function generateStatementPdf(
  statementId: string,
): Promise<string> {
  const statement = await prisma.statement.findUniqueOrThrow({
    where: { id: statementId },
    include: {
      contact: { select: { firstName: true, lastName: true, email: true } },
      service: { select: { id: true, name: true } },
      lineItems: {
        include: { child: { select: { firstName: true, surname: true } } },
        orderBy: { date: "asc" },
      },
    },
  });

  const { default: JsPDF } = await import("jspdf");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { default: autoTable } = await import("jspdf-autotable");

  const doc: jsPDF = new JsPDF("p", "mm", "a4");
  const pw = doc.internal.pageSize.getWidth();
  const margin = 18;
  const cw = pw - margin * 2;
  let y = margin;

  // ── Header bar ──
  doc.setFillColor(0, 78, 100); // #004E64
  doc.rect(0, 0, pw, 32, "F");

  // Accent line
  doc.setFillColor(254, 206, 0); // #FECE00
  doc.rect(0, 32, pw, 2, "F");

  // Logo text
  doc.setTextColor(254, 206, 0);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Amana", margin, 15);
  const amW = doc.getTextWidth("Amana");
  doc.setTextColor(255, 255, 255);
  doc.text(" OSHC", margin + amW, 15);

  // Title
  doc.setFontSize(11);
  doc.setTextColor(255, 242, 191);
  doc.text("STATEMENT OF ACCOUNT", margin, 25);

  y = 42;

  // ── Family details ──
  const parentName =
    [statement.contact.firstName, statement.contact.lastName]
      .filter(Boolean)
      .join(" ") || "—";
  const periodLabel = `${formatDate(statement.periodStart)} — ${formatDate(statement.periodEnd)}`;

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(80, 80, 80);
  doc.text("Family:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 30, 30);
  doc.text(parentName, margin + 30, y);
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(80, 80, 80);
  doc.text("Service:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 30, 30);
  doc.text(statement.service.name, margin + 30, y);
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(80, 80, 80);
  doc.text("Period:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 30, 30);
  doc.text(periodLabel, margin + 30, y);
  y += 6;

  if (statement.dueDate) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80, 80, 80);
    doc.text("Due Date:", margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 30, 30);
    doc.text(formatDate(statement.dueDate), margin + 30, y);
    y += 6;
  }

  y += 4;

  // ── Line items table ──
  const rows: LineItemRow[] = statement.lineItems.map((li) => ({
    childName: [li.child.firstName, li.child.surname].filter(Boolean).join(" "),
    date: formatDate(li.date),
    session: SESSION_LABELS[li.sessionType] ?? li.sessionType,
    grossFee: li.grossFee,
    ccsEstimate: li.ccsAmount,
    gapFee: li.gapAmount,
  }));

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    headStyles: {
      fillColor: [0, 78, 100],
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: "bold",
    },
    bodyStyles: { fontSize: 9, textColor: [30, 30, 30] },
    footStyles: {
      fillColor: [240, 240, 240],
      textColor: [30, 30, 30],
      fontSize: 9,
      fontStyle: "bold",
    },
    head: [["Child", "Date", "Session", "Gross Fee", "CCS Est.", "Gap Fee"]],
    body: rows.map((r) => [
      r.childName,
      r.date,
      r.session,
      formatCurrency(r.grossFee),
      formatCurrency(r.ccsEstimate),
      formatCurrency(r.gapFee),
    ]),
    foot: [
      [
        "TOTALS",
        "",
        "",
        formatCurrency(statement.totalFees),
        formatCurrency(statement.totalCcs),
        formatCurrency(statement.gapFee),
      ],
    ],
  });

  // Get y position after table
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable?.finalY ?? y + 40;
  y += 10;

  // ── Payment summary ──
  doc.setFillColor(245, 245, 245);
  doc.rect(margin, y, cw, 24, "F");
  doc.setFontSize(10);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(80, 80, 80);
  doc.text("Amount Paid:", margin + 4, y + 8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 30, 30);
  doc.text(formatCurrency(statement.amountPaid), margin + 50, y + 8);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(80, 80, 80);
  doc.text("Balance Outstanding:", margin + 4, y + 18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(statement.balance > 0 ? 200 : 0, statement.balance > 0 ? 50 : 128, 50);
  doc.text(formatCurrency(statement.balance), margin + 50, y + 18);

  y += 32;

  // ── Footer disclaimer ──
  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(150, 150, 150);
  const disclaimer =
    "CCS estimates are indicative only. Actual CCS is determined by Services Australia. For queries contact your centre coordinator.";
  const lines = doc.splitTextToSize(disclaimer, cw);
  doc.text(lines, margin, y);

  // ── Upload to Vercel Blob ──
  const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

  const { url } = await uploadFile(pdfBuffer, `${statementId}.pdf`, {
    contentType: "application/pdf",
    folder: `statements/${statement.service.id}`,
    access: "public",
  });

  // Update statement with PDF URL
  await prisma.statement.update({
    where: { id: statementId },
    data: { pdfUrl: url },
  });

  return url;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/billing/statement-pdf.ts
git commit -m "feat(billing): add statement PDF generation with jsPDF + Vercel Blob upload"
```

---

## Chunk 3: Staff API Routes (Statements)

### Task 4: GET + POST /api/billing/statements

**Files:**
- Create: `src/app/api/billing/statements/route.ts`

- [ ] **Step 1: Create statements list + create route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { z } from "zod";

// ── GET — list statements with filters ──

export const GET = withApiAuth(async (req) => {
  const url = new URL(req.url);
  const serviceId = url.searchParams.get("serviceId");
  const contactId = url.searchParams.get("contactId");
  const status = url.searchParams.get("status");
  const periodFrom = url.searchParams.get("periodFrom");
  const periodTo = url.searchParams.get("periodTo");
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10)));

  const where: Record<string, unknown> = {};
  if (serviceId) where.serviceId = serviceId;
  if (contactId) where.contactId = contactId;
  if (status) where.status = status;
  if (periodFrom || periodTo) {
    where.periodStart = {};
    if (periodFrom) (where.periodStart as Record<string, unknown>).gte = new Date(periodFrom);
    if (periodTo) (where.periodStart as Record<string, unknown>).lte = new Date(periodTo);
  }

  const [statements, total] = await Promise.all([
    prisma.statement.findMany({
      where,
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, email: true } },
        service: { select: { id: true, name: true } },
        _count: { select: { lineItems: true, payments: true } },
      },
      orderBy: { periodStart: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.statement.count({ where }),
  ]);

  return NextResponse.json({ statements, total, page, limit });
});

// ── POST — create draft statement ──

const lineItemSchema = z.object({
  childId: z.string().min(1),
  date: z.string().min(1),
  sessionType: z.enum(["bsc", "asc", "vc"]),
  description: z.string().min(1),
  grossFee: z.number().min(0),
  ccsHours: z.number().min(0).default(0),
  ccsRate: z.number().min(0).default(0),
  ccsAmount: z.number().min(0).default(0),
  gapAmount: z.number().min(0),
});

const createStatementSchema = z.object({
  contactId: z.string().min(1),
  serviceId: z.string().min(1),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  lineItems: z.array(lineItemSchema).min(1, "At least one line item is required"),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
});

export const POST = withApiAuth(async (req) => {
  const body = await parseJsonBody(req);
  const parsed = createStatementSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Validation failed", parsed.error.flatten());
  }

  const { contactId, serviceId, periodStart, periodEnd, lineItems, dueDate, notes } = parsed.data;

  // Application-level duplicate check
  const existing = await prisma.statement.findFirst({
    where: {
      contactId,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      status: { notIn: ["void"] },
    },
  });
  if (existing) {
    throw ApiError.conflict("A statement already exists for this family and period");
  }

  // Auto-calculate totals
  const totalFees = lineItems.reduce((sum, li) => sum + li.grossFee, 0);
  const totalCcs = lineItems.reduce((sum, li) => sum + li.ccsAmount, 0);
  const gapFee = totalFees - totalCcs;

  const statement = await prisma.$transaction(async (tx) => {
    const stmt = await tx.statement.create({
      data: {
        contactId,
        serviceId,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        totalFees,
        totalCcs,
        gapFee,
        balance: gapFee,
        status: "draft",
        dueDate: dueDate ? new Date(dueDate) : null,
        notes: notes ?? null,
      },
    });

    await tx.statementLineItem.createMany({
      data: lineItems.map((li) => ({
        statementId: stmt.id,
        childId: li.childId,
        date: new Date(li.date),
        sessionType: li.sessionType,
        description: li.description,
        grossFee: li.grossFee,
        ccsHours: li.ccsHours,
        ccsRate: li.ccsRate,
        ccsAmount: li.ccsAmount,
        gapAmount: li.gapAmount,
      })),
    });

    return tx.statement.findUniqueOrThrow({
      where: { id: stmt.id },
      include: {
        contact: { select: { id: true, firstName: true, lastName: true } },
        service: { select: { id: true, name: true } },
        lineItems: {
          include: { child: { select: { firstName: true, surname: true } } },
        },
      },
    });
  });

  return NextResponse.json(statement, { status: 201 });
});
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/billing/statements/route.ts
git commit -m "feat(billing): add GET/POST /api/billing/statements (list + create draft)"
```

### Task 5: GET + PATCH /api/billing/statements/[id]

**Files:**
- Create: `src/app/api/billing/statements/[id]/route.ts`

- [ ] **Step 1: Create statement detail + edit route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { z } from "zod";

type RouteContext = { params: Promise<{ id: string }> };

// ── GET — statement detail ──

export const GET = withApiAuth(async (_req, _session, context) => {
  const { id } = await (context as RouteContext).params;

  const statement = await prisma.statement.findUnique({
    where: { id },
    include: {
      contact: { select: { id: true, firstName: true, lastName: true, email: true } },
      service: { select: { id: true, name: true } },
      lineItems: {
        include: { child: { select: { id: true, firstName: true, surname: true } } },
        orderBy: { date: "asc" },
      },
      payments: {
        orderBy: { receivedAt: "desc" },
        include: { recordedBy: { select: { id: true, name: true } } },
      },
    },
  });

  if (!statement) throw ApiError.notFound("Statement not found");

  return NextResponse.json(statement);
});

// ── PATCH — edit draft statement ──

const editLineItemSchema = z.object({
  childId: z.string().min(1),
  date: z.string().min(1),
  sessionType: z.enum(["bsc", "asc", "vc"]),
  description: z.string().min(1),
  grossFee: z.number().min(0),
  ccsHours: z.number().min(0).default(0),
  ccsRate: z.number().min(0).default(0),
  ccsAmount: z.number().min(0).default(0),
  gapAmount: z.number().min(0),
});

const editStatementSchema = z.object({
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  lineItems: z.array(editLineItemSchema).min(1).optional(),
});

export const PATCH = withApiAuth(async (req, _session, context) => {
  const { id } = await (context as RouteContext).params;

  const existing = await prisma.statement.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound("Statement not found");
  if (existing.status !== "draft") {
    throw ApiError.badRequest("Only draft statements can be edited");
  }

  const body = await parseJsonBody(req);
  const parsed = editStatementSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Validation failed", parsed.error.flatten());
  }

  const { periodStart, periodEnd, dueDate, notes, lineItems } = parsed.data;

  const statement = await prisma.$transaction(async (tx) => {
    // Update statement fields
    const updateData: Record<string, unknown> = {};
    if (periodStart !== undefined) updateData.periodStart = new Date(periodStart);
    if (periodEnd !== undefined) updateData.periodEnd = new Date(periodEnd);
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
    if (notes !== undefined) updateData.notes = notes;

    // Replace line items if provided
    if (lineItems) {
      await tx.statementLineItem.deleteMany({ where: { statementId: id } });
      await tx.statementLineItem.createMany({
        data: lineItems.map((li) => ({
          statementId: id,
          childId: li.childId,
          date: new Date(li.date),
          sessionType: li.sessionType,
          description: li.description,
          grossFee: li.grossFee,
          ccsHours: li.ccsHours,
          ccsRate: li.ccsRate,
          ccsAmount: li.ccsAmount,
          gapAmount: li.gapAmount,
        })),
      });

      // Recalculate totals
      const totalFees = lineItems.reduce((sum, li) => sum + li.grossFee, 0);
      const totalCcs = lineItems.reduce((sum, li) => sum + li.ccsAmount, 0);
      const gapFee = totalFees - totalCcs;
      updateData.totalFees = totalFees;
      updateData.totalCcs = totalCcs;
      updateData.gapFee = gapFee;
      updateData.balance = gapFee;
    }

    await tx.statement.update({ where: { id }, data: updateData });

    return tx.statement.findUniqueOrThrow({
      where: { id },
      include: {
        contact: { select: { id: true, firstName: true, lastName: true } },
        service: { select: { id: true, name: true } },
        lineItems: {
          include: { child: { select: { firstName: true, surname: true } } },
        },
      },
    });
  });

  return NextResponse.json(statement);
});
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/billing/statements/[id]/route.ts
git commit -m "feat(billing): add GET/PATCH /api/billing/statements/[id] (detail + edit draft)"
```

### Task 6: POST /api/billing/statements/[id]/issue

**Files:**
- Create: `src/app/api/billing/statements/[id]/issue/route.ts`

- [ ] **Step 1: Create issue route**

```typescript
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { generateStatementPdf } from "@/lib/billing/statement-pdf";
import { sendStatementIssuedNotification } from "@/lib/notifications/billing";
import { logger } from "@/lib/logger";

type RouteContext = { params: Promise<{ id: string }> };

export const POST = withApiAuth(async (_req, _session, context) => {
  const { id } = await (context as RouteContext).params;

  const statement = await prisma.statement.findUnique({ where: { id } });
  if (!statement) throw ApiError.notFound("Statement not found");
  if (statement.status !== "draft") {
    throw ApiError.badRequest("Only draft statements can be issued");
  }

  // Update status immediately
  const updated = await prisma.statement.update({
    where: { id },
    data: { status: "issued", issuedAt: new Date() },
    include: {
      contact: { select: { id: true, firstName: true, lastName: true } },
      service: { select: { id: true, name: true } },
    },
  });

  // Fire-and-forget: generate PDF then send email (chained, not parallel)
  void (async () => {
    try {
      await generateStatementPdf(id);
      await sendStatementIssuedNotification(id);
    } catch (err) {
      logger.error("Issue post-processing failed", { statementId: id, err });
    }
  })();

  return NextResponse.json(updated);
});
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/billing/statements/[id]/issue/route.ts
git commit -m "feat(billing): add POST /api/billing/statements/[id]/issue"
```

### Task 7: POST /api/billing/statements/[id]/void

**Files:**
- Create: `src/app/api/billing/statements/[id]/void/route.ts`

- [ ] **Step 1: Create void route**

```typescript
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";

type RouteContext = { params: Promise<{ id: string }> };

export const POST = withApiAuth(async (_req, _session, context) => {
  const { id } = await (context as RouteContext).params;

  const statement = await prisma.statement.findUnique({ where: { id } });
  if (!statement) throw ApiError.notFound("Statement not found");
  if (statement.status !== "draft" && statement.status !== "issued") {
    throw ApiError.badRequest("Only draft or issued statements can be voided");
  }

  const updated = await prisma.statement.update({
    where: { id },
    data: { status: "void" },
    include: {
      contact: { select: { id: true, firstName: true, lastName: true } },
      service: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(updated);
});
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/billing/statements/[id]/void/route.ts
git commit -m "feat(billing): add POST /api/billing/statements/[id]/void"
```

---

## Chunk 4: Staff API Routes (Payments + Family Summary)

### Task 8: POST /api/billing/payments

**Files:**
- Create: `src/app/api/billing/payments/route.ts`

- [ ] **Step 1: Create payments route**

```typescript
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { sendPaymentReceivedNotification } from "@/lib/notifications/billing";
import { z } from "zod";

const createPaymentSchema = z.object({
  statementId: z.string().optional(),
  contactId: z.string().min(1),
  serviceId: z.string().min(1),
  amount: z.number().positive("Amount must be positive"),
  method: z.enum(["bank_transfer", "cash", "card", "direct_debit", "other"]),
  reference: z.string().optional(),
  receivedAt: z.string().optional(),
  notes: z.string().optional(),
});

export const POST = withApiAuth(async (req, session) => {
  const body = await parseJsonBody(req);
  const parsed = createPaymentSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Validation failed", parsed.error.flatten());
  }

  const { statementId, contactId, serviceId, amount, method, reference, receivedAt, notes } = parsed.data;

  // Validate statement belongs to this contact if provided
  if (statementId) {
    const stmt = await prisma.statement.findUnique({ where: { id: statementId } });
    if (!stmt) throw ApiError.notFound("Statement not found");
    if (stmt.contactId !== contactId) {
      throw ApiError.badRequest("Statement does not belong to this family");
    }
  }

  const payment = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.create({
      data: {
        statementId: statementId ?? null,
        contactId,
        serviceId,
        amount,
        method,
        reference: reference ?? null,
        receivedAt: receivedAt ? new Date(receivedAt) : new Date(),
        recordedById: session.user?.id ?? null,
        notes: notes ?? null,
      },
      include: {
        contact: { select: { id: true, firstName: true, lastName: true } },
        statement: true,
      },
    });

    // Recalculate statement balance if linked
    if (statementId) {
      const totalPayments = await tx.payment.aggregate({
        where: { statementId },
        _sum: { amount: true },
      });

      const stmt = await tx.statement.findUniqueOrThrow({ where: { id: statementId } });
      const newBalance = stmt.gapFee - (totalPayments._sum.amount ?? 0);
      const newStatus = newBalance <= 0 ? "paid" : stmt.status;

      await tx.statement.update({
        where: { id: statementId },
        data: {
          amountPaid: totalPayments._sum.amount ?? 0,
          balance: newBalance,
          status: newStatus,
        },
      });
    }

    return p;
  });

  // Fire-and-forget notification
  void sendPaymentReceivedNotification(payment.id);

  // Re-fetch to get updated statement balance
  const result = await prisma.payment.findUniqueOrThrow({
    where: { id: payment.id },
    include: {
      contact: { select: { id: true, firstName: true, lastName: true } },
      statement: { select: { id: true, balance: true, status: true, amountPaid: true } },
    },
  });

  return NextResponse.json(result, { status: 201 });
});
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/billing/payments/route.ts
git commit -m "feat(billing): add POST /api/billing/payments with balance recalculation"
```

### Task 9: GET /api/billing/families/[familyId]/summary

**Files:**
- Create: `src/app/api/billing/families/[familyId]/summary/route.ts`

- [ ] **Step 1: Create family summary route**

```typescript
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";

type RouteContext = { params: Promise<{ familyId: string }> };

export const GET = withApiAuth(async (_req, _session, context) => {
  const { familyId } = await (context as RouteContext).params;

  const contact = await prisma.centreContact.findUnique({
    where: { id: familyId },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  if (!contact) throw ApiError.notFound("Family not found");

  const [statements, payments] = await Promise.all([
    prisma.statement.findMany({
      where: { contactId: familyId, status: { notIn: ["void"] } },
      include: { service: { select: { id: true, name: true } } },
      orderBy: { periodStart: "desc" },
    }),
    prisma.payment.findMany({
      where: { contactId: familyId },
      orderBy: { receivedAt: "desc" },
    }),
  ]);

  const totalOutstanding = statements
    .filter((s) => ["issued", "unpaid", "overdue"].includes(s.status))
    .reduce((sum, s) => sum + s.balance, 0);

  return NextResponse.json({
    contact,
    totalOutstanding,
    statements,
    payments,
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/billing/families/[familyId]/summary/route.ts
git commit -m "feat(billing): add GET /api/billing/families/[familyId]/summary"
```

---

## Chunk 5: Parent API Updates

### Task 10: Update existing parent statements API

**Files:**
- Modify: `src/app/api/parent/statements/route.ts`

- [ ] **Step 1: Update GET handler to filter draft/void and use balance field**

Replace the entire file content of `src/app/api/parent/statements/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { withParentAuth } from "@/lib/parent-auth";
import { prisma } from "@/lib/prisma";

export const GET = withParentAuth(async (_req, { parent }) => {
  if (parent.enrolmentIds.length === 0) {
    return NextResponse.json({ statements: [], summary: { currentBalance: 0, overdueCount: 0 } });
  }

  // Get serviceIds from parent's enrolments
  const enrolments = await prisma.enrolmentSubmission.findMany({
    where: { id: { in: parent.enrolmentIds }, status: { not: "draft" } },
    select: { serviceId: true },
  });
  const serviceIds = [...new Set(enrolments.map((e) => e.serviceId).filter(Boolean))] as string[];

  if (serviceIds.length === 0) {
    return NextResponse.json({ statements: [], summary: { currentBalance: 0, overdueCount: 0 } });
  }

  // Find CentreContact records for this parent
  const contacts = await prisma.centreContact.findMany({
    where: {
      email: parent.email.toLowerCase(),
      serviceId: { in: serviceIds },
    },
    select: { id: true },
  });
  const contactIds = contacts.map((c) => c.id);

  if (contactIds.length === 0) {
    return NextResponse.json({ statements: [], summary: { currentBalance: 0, overdueCount: 0 } });
  }

  // Filter out draft and void — parents never see those
  const statements = await prisma.statement.findMany({
    where: {
      contactId: { in: contactIds },
      status: { notIn: ["draft", "void"] },
    },
    include: {
      service: { select: { id: true, name: true } },
    },
    orderBy: { periodEnd: "desc" },
  });

  // Calculate summary using balance field, include issued status
  const outstandingStatements = statements.filter(
    (s) => s.status === "issued" || s.status === "unpaid" || s.status === "overdue",
  );
  const currentBalance = outstandingStatements.reduce((sum, s) => sum + s.balance, 0);
  const overdueCount = statements.filter((s) => s.status === "overdue").length;

  return NextResponse.json({
    statements,
    summary: { currentBalance, overdueCount },
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/parent/statements/route.ts
git commit -m "fix(billing): update parent statements API — filter draft/void, use balance field"
```

### Task 11: Add parent statement detail route

**Files:**
- Create: `src/app/api/parent/statements/[id]/route.ts`

- [ ] **Step 1: Create parent statement detail route**

```typescript
import { NextResponse } from "next/server";
import { withParentAuth } from "@/lib/parent-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withParentAuth(async (_req, ctx) => {
  const { id } = await (ctx as RouteContext).params;
  const { parent } = ctx;

  // Get parent's contact IDs
  const enrolments = await prisma.enrolmentSubmission.findMany({
    where: { id: { in: parent.enrolmentIds }, status: { not: "draft" } },
    select: { serviceId: true },
  });
  const serviceIds = [...new Set(enrolments.map((e) => e.serviceId).filter(Boolean))] as string[];

  const contacts = await prisma.centreContact.findMany({
    where: {
      email: parent.email.toLowerCase(),
      serviceId: { in: serviceIds },
    },
    select: { id: true },
  });
  const contactIds = contacts.map((c) => c.id);

  const statement = await prisma.statement.findUnique({
    where: { id },
    include: {
      service: { select: { id: true, name: true } },
      lineItems: {
        include: { child: { select: { id: true, firstName: true, surname: true } } },
        orderBy: { date: "asc" },
      },
    },
  });

  if (!statement) throw ApiError.notFound("Statement not found");

  // Verify this statement belongs to the parent
  if (!contactIds.includes(statement.contactId)) {
    throw ApiError.forbidden("You do not have access to this statement");
  }

  // Don't show draft or void to parents
  if (statement.status === "draft" || statement.status === "void") {
    throw ApiError.notFound("Statement not found");
  }

  return NextResponse.json(statement);
});
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/parent/statements/[id]/route.ts
git commit -m "feat(billing): add GET /api/parent/statements/[id] (parent detail with line items)"
```

---

## Chunk 6: Overdue Cron + Config

### Task 12: Overdue statements cron

**Files:**
- Create: `src/app/api/cron/overdue-statements/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Create overdue cron route**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronSecret, acquireCronLock } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { sendOverdueStatementNotification } from "@/lib/notifications/billing";

/**
 * GET /api/cron/overdue-statements
 * Daily cron: marks issued statements past their due date as overdue.
 * Schedule: daily at 10pm UTC — "0 22 * * *"
 */
export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const guard = await acquireCronLock("overdue-statements", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdueStatements = await prisma.statement.findMany({
      where: {
        status: "issued",
        dueDate: { lt: today },
        balance: { gt: 0 },
      },
      select: { id: true },
    });

    let updated = 0;

    for (const stmt of overdueStatements) {
      await prisma.statement.update({
        where: { id: stmt.id },
        data: { status: "overdue" },
      });
      // Fire-and-forget notification
      void sendOverdueStatementNotification(stmt.id);
      updated++;
    }

    logger.info("Overdue statements cron completed", {
      found: overdueStatements.length,
      updated,
    });

    await guard.complete({ updated });

    return NextResponse.json({ updated });
  } catch (err) {
    await guard.fail(err);
    throw err;
  }
});
```

- [ ] **Step 2: Add cron to vercel.json**

In `vercel.json`, find the `crons` array and add this entry before the closing `]`:

```json
    {
      "path": "/api/cron/overdue-statements",
      "schedule": "0 22 * * *"
    }
```

Make sure to add a comma after the previous entry (the `unactioned-bookings` entry).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/overdue-statements/route.ts vercel.json
git commit -m "feat(billing): add daily overdue-statements cron job"
```

### Task 13: Add Billing to staff navigation

**Files:**
- Modify: `src/lib/nav-config.ts`

- [ ] **Step 1: Add Receipt import and Billing nav item**

In `src/lib/nav-config.ts`, add `Receipt` to the lucide-react import at the top.

Then find the Operations section (around line 76, look for `{ href: "/financials"`). Add the billing entry right after the financials line:

```typescript
  { href: "/billing", label: "Billing", icon: Receipt, section: "Operations", tooltip: "Generate statements and record payments for families" },
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/nav-config.ts
git commit -m "feat(billing): add Billing to staff dashboard navigation"
```

---

## Chunk 7: Client Hooks + Staff UI

### Task 14: Staff billing hooks

**Files:**
- Create: `src/hooks/useBilling.ts`

- [ ] **Step 1: Create billing hooks file**

```typescript
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/use-toast";

// ── Types ──

export interface StatementListItem {
  id: string;
  contactId: string;
  serviceId: string;
  periodStart: string;
  periodEnd: string;
  totalFees: number;
  totalCcs: number;
  gapFee: number;
  amountPaid: number;
  balance: number;
  status: string;
  pdfUrl: string | null;
  dueDate: string | null;
  issuedAt: string | null;
  notes: string | null;
  createdAt: string;
  contact: { id: string; firstName: string | null; lastName: string | null; email: string };
  service: { id: string; name: string };
  _count: { lineItems: number; payments: number };
}

export interface StatementDetail extends Omit<StatementListItem, "_count"> {
  lineItems: {
    id: string;
    childId: string;
    date: string;
    sessionType: string;
    description: string;
    grossFee: number;
    ccsHours: number;
    ccsRate: number;
    ccsAmount: number;
    gapAmount: number;
    child: { id: string; firstName: string; surname: string | null };
  }[];
  payments: {
    id: string;
    amount: number;
    method: string;
    reference: string | null;
    receivedAt: string;
    notes: string | null;
    recordedBy: { id: string; name: string } | null;
  }[];
}

interface StatementsResponse {
  statements: StatementListItem[];
  total: number;
  page: number;
  limit: number;
}

export interface FamilySummary {
  contact: { id: string; firstName: string | null; lastName: string | null; email: string };
  totalOutstanding: number;
  statements: StatementListItem[];
  payments: {
    id: string;
    amount: number;
    method: string;
    reference: string | null;
    receivedAt: string;
  }[];
}

// ── Query key factory ──

const billingKeys = {
  statements: (serviceId?: string, status?: string, page?: number) =>
    ["billing", "statements", serviceId, status, page] as const,
  statementDetail: (id: string) => ["billing", "statements", id] as const,
  familySummary: (familyId: string) => ["billing", "family", familyId] as const,
};

// ── Hooks ──

export function useBillingStatements(filters?: {
  serviceId?: string;
  status?: string;
  page?: number;
}) {
  const params = new URLSearchParams();
  if (filters?.serviceId) params.set("serviceId", filters.serviceId);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.page) params.set("page", String(filters.page));

  return useQuery<StatementsResponse>({
    queryKey: billingKeys.statements(filters?.serviceId, filters?.status, filters?.page),
    queryFn: () => fetchApi<StatementsResponse>(`/api/billing/statements?${params}`),
    retry: 2,
    staleTime: 30_000,
  });
}

export function useBillingStatementDetail(id: string | null) {
  return useQuery<StatementDetail>({
    queryKey: billingKeys.statementDetail(id ?? ""),
    queryFn: () => fetchApi<StatementDetail>(`/api/billing/statements/${id}`),
    enabled: !!id,
    retry: 2,
    staleTime: 30_000,
  });
}

export function useFamilySummary(familyId: string | null) {
  return useQuery<FamilySummary>({
    queryKey: billingKeys.familySummary(familyId ?? ""),
    queryFn: () => fetchApi<FamilySummary>(`/api/billing/families/${familyId}/summary`),
    enabled: !!familyId,
    retry: 2,
    staleTime: 30_000,
  });
}

export function useCreateStatement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      mutateApi("/api/billing/statements", { method: "POST", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing", "statements"] });
      toast({ description: "Statement created" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Failed to create statement" });
    },
  });
}

export function useIssueStatement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(`/api/billing/statements/${id}/issue`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing", "statements"] });
      toast({ description: "Statement issued" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Failed to issue statement" });
    },
  });
}

export function useVoidStatement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(`/api/billing/statements/${id}/void`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing", "statements"] });
      toast({ description: "Statement voided" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Failed to void statement" });
    },
  });
}

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      mutateApi("/api/billing/payments", { method: "POST", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing"] });
      toast({ description: "Payment recorded" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Failed to record payment" });
    },
  });
}

export function useEditDraftStatement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      mutateApi(`/api/billing/statements/${id}`, { method: "PATCH", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing", "statements"] });
      toast({ description: "Statement updated" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Failed to update statement" });
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useBilling.ts
git commit -m "feat(billing): add TanStack Query hooks for staff billing"
```

### Task 15: Staff Billing Dashboard UI

**Files:**
- Create: `src/components/billing/BillingDashboard.tsx`
- Create: `src/components/billing/NewStatementDialog.tsx`
- Create: `src/components/billing/RecordPaymentDialog.tsx`
- Create: `src/components/billing/StatementDetailPanel.tsx`
- Create: `src/app/(dashboard)/billing/page.tsx`

This is the largest task. The UI should follow existing patterns in the codebase: Radix UI primitives, Tailwind CSS with brand colours (#004E64 primary, #FECE00 accent, #f8f5f2 background), PageHeader component, Skeleton loading states, cn() utility.

- [ ] **Step 1: Create BillingDashboard.tsx**

Create `src/components/billing/BillingDashboard.tsx`. This is the main component with:
- Summary cards (Total Outstanding, Statements This Week, Overdue)
- Filter bar (service, status, week)
- Statements table with status badges and action buttons
- Integration with `useBillingStatements`, `useIssueStatement`, `useVoidStatement`
- Opens NewStatementDialog, RecordPaymentDialog, StatementDetailPanel

Use `PageHeader` from `@/components/layout/PageHeader` for the page title.

Status badge colours:
- draft: `bg-gray-100 text-gray-600`
- issued: `bg-blue-100 text-blue-700`
- paid: `bg-green-100 text-green-700`
- unpaid: `bg-amber-100 text-amber-700`
- overdue: `bg-red-100 text-red-600`
- void: `bg-gray-100 text-gray-400 line-through`

Skeleton loading while data loads. All 44px minimum touch targets.

- [ ] **Step 2: Create NewStatementDialog.tsx**

Create `src/components/billing/NewStatementDialog.tsx`. A Radix Dialog with:
- Contact selector (searchable by name)
- Service selector
- Period start/end date pickers (end auto-fills to start + 6)
- Due date picker (defaults to start + 14)
- Line items builder (add/remove rows) with: child selector, date, session type, description, grossFee, ccsHours, ccsRate (auto-calc ccsAmount), gapAmount
- Running totals row
- Uses `useCreateStatement` mutation
- Uses `react-hook-form` + `zod` resolver

- [ ] **Step 3: Create RecordPaymentDialog.tsx**

Create `src/components/billing/RecordPaymentDialog.tsx`. A Radix Dialog with:
- Amount (number input, required)
- Method selector (bank_transfer, cash, card, direct_debit, other)
- Reference (optional text)
- Date received (date picker, defaults to today)
- Notes (optional textarea)
- Uses `useRecordPayment` mutation

- [ ] **Step 4: Create StatementDetailPanel.tsx**

Create `src/components/billing/StatementDetailPanel.tsx`. A slide-out panel (sheet) showing:
- Statement header (family, service, period, status badge)
- Line items table
- Payments list
- PDF download link (if pdfUrl)
- Uses `useBillingStatementDetail`

- [ ] **Step 5: Create billing page**

Create `src/app/(dashboard)/billing/page.tsx`:

```typescript
import { BillingDashboard } from "@/components/billing/BillingDashboard";

export default function BillingPage() {
  return <BillingDashboard />;
}
```

- [ ] **Step 6: Verify the page renders**

Run: `npm run dev`

Navigate to `http://localhost:3000/billing`. Verify:
- Page loads without errors
- "Billing" appears in the sidebar navigation
- Summary cards render (may show 0s with no data)
- Table renders (may be empty)

- [ ] **Step 7: Commit**

```bash
git add src/components/billing/ src/app/\\(dashboard\\)/billing/
git commit -m "feat(billing): add staff billing dashboard with statements table, payment dialog, and statement detail"
```

---

## Chunk 8: Parent Portal Updates

### Task 16: Update parent hooks and types

**Files:**
- Modify: `src/hooks/useParentPortal.ts`

- [ ] **Step 1: Update StatementRecord type**

In `src/hooks/useParentPortal.ts`, find the `StatementRecord` interface (around line 122) and update it:

```typescript
export interface StatementRecord {
  id: string;
  periodStart: string;
  periodEnd: string;
  totalFees: number;
  totalCcs: number;
  gapFee: number;
  amountPaid: number;
  balance: number;
  status: "issued" | "paid" | "unpaid" | "overdue";
  pdfUrl: string | null;
  dueDate: string | null;
  issuedAt: string | null;
  notes: string | null;
  createdAt: string;
  service: { id: string; name: string };
}
```

- [ ] **Step 2: Add useParentStatementDetail hook**

After the existing `useParentStatements` function (around line 296), add:

```typescript
export interface StatementDetailResponse {
  id: string;
  periodStart: string;
  periodEnd: string;
  totalFees: number;
  totalCcs: number;
  gapFee: number;
  amountPaid: number;
  balance: number;
  status: string;
  pdfUrl: string | null;
  dueDate: string | null;
  issuedAt: string | null;
  service: { id: string; name: string };
  lineItems: {
    id: string;
    date: string;
    sessionType: string;
    description: string;
    grossFee: number;
    ccsAmount: number;
    gapAmount: number;
    child: { id: string; firstName: string; surname: string | null };
  }[];
}

export function useParentStatementDetail(id: string | null) {
  return useQuery<StatementDetailResponse>({
    queryKey: ["parent", "statements", id],
    queryFn: () => fetchApi<StatementDetailResponse>(`/api/parent/statements/${id}`),
    enabled: !!id,
    retry: 2,
    staleTime: 30_000,
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useParentPortal.ts
git commit -m "feat(billing): update parent StatementRecord type and add detail hook"
```

### Task 17: Enhance parent billing page

**Files:**
- Modify: `src/app/parent/billing/page.tsx`

- [ ] **Step 1: Update parent billing page**

Update `src/app/parent/billing/page.tsx` to:
- Add `issued` status to STATUS_STYLES: `{ bg: "bg-blue-100", text: "text-blue-700", label: "Issued" }`
- Show `amountPaid` and `balance` fields on statement cards
- Add expandable detail view (click a statement card → show line items below it)
- Use `useParentStatementDetail` when a card is expanded
- Show due date with amber/red highlight if overdue
- Ensure the current balance summary uses the `balance` field from the updated API

Keep the existing visual style (white cards, rounded corners, brand colours). The `STATUS_STYLES` object should be:

```typescript
const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  issued: { bg: "bg-blue-100", text: "text-blue-700", label: "Issued" },
  paid: { bg: "bg-green-100", text: "text-green-700", label: "Paid" },
  unpaid: { bg: "bg-amber-100", text: "text-amber-700", label: "Unpaid" },
  overdue: { bg: "bg-red-100", text: "text-red-600", label: "Overdue" },
};
```

- [ ] **Step 2: Commit**

```bash
git add src/app/parent/billing/page.tsx
git commit -m "feat(billing): enhance parent billing page with detail view and new status badges"
```

---

## Chunk 9: Tests

### Task 18: Billing statements API tests

**Files:**
- Create: `src/__tests__/api/billing-statements.test.ts`

- [ ] **Step 1: Write statement API tests**

Follow the pattern in `src/__tests__/api/booking-requests.test.ts`:
- Import `prismaMock`, `mockSession`, `mockNoSession`, `createRequest`, `_clearUserActiveCache`
- Mock `@/lib/rate-limit` and `@/lib/logger`
- Import the route handlers from the route file

Test coverage:
1. `GET /api/billing/statements` — returns 401 without auth, 200 with auth
2. `POST /api/billing/statements` — returns 401 without auth, 400 with invalid body, 201 with valid body, 409 for duplicate period
3. `POST /api/billing/statements/[id]/issue` — returns 404 for missing statement, 400 for non-draft, 200 for draft
4. `POST /api/billing/statements/[id]/void` — returns 404 for missing, 400 for paid, 200 for draft/issued

Mock prisma methods with `mockImplementation` using arg-based routing per CLAUDE.md standards.

- [ ] **Step 2: Run tests**

Run: `npm test -- src/__tests__/api/billing-statements.test.ts`

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/api/billing-statements.test.ts
git commit -m "test(billing): add statement API route tests"
```

### Task 19: Billing payments API tests

**Files:**
- Create: `src/__tests__/api/billing-payments.test.ts`

- [ ] **Step 1: Write payment API tests**

Test coverage:
1. `POST /api/billing/payments` — returns 401 without auth, 400 with invalid body, 201 with valid body
2. Balance recalculation — when payment linked to statement, balance updates correctly
3. Status transition — when payments >= gapFee, statement becomes `paid`
4. Unlinked payment — payment without statementId creates successfully

- [ ] **Step 2: Run tests**

Run: `npm test -- src/__tests__/api/billing-payments.test.ts`

Expected: All tests pass.

- [ ] **Step 3: Run full test suite**

Run: `npm test`

Expected: All existing tests still pass (700+ tests).

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/api/billing-payments.test.ts
git commit -m "test(billing): add payment API route tests"
```

---

## Chunk 10: Build Verification + Deploy

### Task 20: Final verification

- [ ] **Step 1: Run build**

Run: `npm run build`

Expected: Build succeeds with no errors.

- [ ] **Step 2: Run all tests**

Run: `npm test`

Expected: All tests pass (existing 700+ plus new billing tests).

- [ ] **Step 3: Run lint**

Run: `npm run lint`

Expected: No lint errors.

- [ ] **Step 4: Verify file checklist**

Verify all these files exist:
- `src/lib/billing/statement-pdf.ts`
- `src/lib/notifications/billing.ts`
- `src/app/api/billing/statements/route.ts`
- `src/app/api/billing/statements/[id]/route.ts`
- `src/app/api/billing/statements/[id]/issue/route.ts`
- `src/app/api/billing/statements/[id]/void/route.ts`
- `src/app/api/billing/payments/route.ts`
- `src/app/api/billing/families/[familyId]/summary/route.ts`
- `src/app/api/parent/statements/[id]/route.ts`
- `src/app/api/cron/overdue-statements/route.ts`
- `src/hooks/useBilling.ts`
- `src/components/billing/BillingDashboard.tsx`
- `src/components/billing/NewStatementDialog.tsx`
- `src/components/billing/RecordPaymentDialog.tsx`
- `src/components/billing/StatementDetailPanel.tsx`
- `src/app/(dashboard)/billing/page.tsx`

- [ ] **Step 5: Stage, commit, and push**

```bash
git add -A
git commit -m "feat: billing & statements system with PDF generation, payment recording, and parent portal statements view"
git push origin main
```

Confirm push succeeds and provide the commit hash.
