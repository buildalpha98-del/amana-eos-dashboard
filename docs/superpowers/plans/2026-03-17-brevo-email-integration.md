# Brevo Email Integration — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Zoho Campaigns with an in-dashboard email system — template management (import from Zoho + block editor), marketing campaign sends via Brevo, and enquiry welcome emails.

**Architecture:** EmailTemplate model stores templates (raw HTML for Zoho imports, JSON blocks for new templates). A `marketingLayout()` wrapper provides parent-facing branding. The existing `brevo.ts` client handles delivery (transactional < 50, campaign ≥ 50). DeliveryLog tracks all sends with entity linking. The email composer is a full-page route with split-pane editor/preview.

**Tech Stack:** Next.js 16, Prisma 5.22, PostgreSQL, React Query, Brevo API, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-17-brevo-email-integration-design.md`

---

## File Structure

### New Files
| File | Purpose |
|---|---|
| `src/lib/email-marketing-layout.ts` | `marketingLayout()` wrapper + `renderBlocksToHtml()` + `interpolateVariables()` |
| `src/app/api/email-templates/route.ts` | GET (list) + POST (create) email templates |
| `src/app/api/email-templates/[id]/route.ts` | GET + PATCH + DELETE single template |
| `src/app/api/email-templates/[id]/duplicate/route.ts` | POST duplicate template |
| `src/app/api/email/campaign/send/route.ts` | POST send marketing/enquiry email via Brevo |
| `src/app/api/email/preview/route.ts` | POST render preview HTML |
| `src/app/api/email/history/route.ts` | GET email history by entityType + entityId |
| `src/app/api/email/recipient-count/route.ts` | GET deduplicated recipient count by serviceIds |
| `src/hooks/useEmailTemplates.ts` | React Query hooks for templates + send + preview |
| `src/components/email/EmailBlockEditor.tsx` | Block editor (add/remove/reorder blocks) |
| `src/components/email/EmailHtmlEditor.tsx` | Raw HTML textarea editor |
| `src/components/email/EmailPreview.tsx` | Rendered HTML preview in iframe |
| `src/components/email/EmailComposer.tsx` | Full composer (editor + preview + recipients + send) |
| `src/components/email/TemplatePickerModal.tsx` | Template selection grid |
| `src/components/email/ImportTemplateModal.tsx` | Paste HTML import flow |
| `src/app/(dashboard)/marketing/email/compose/page.tsx` | Full-page email composer route |
| `src/components/enquiries/SendWelcomeEmailModal.tsx` | Welcome email send modal for enquiries |
| `src/components/enquiries/EmailHistorySection.tsx` | Email history list on enquiry detail |

### Modified Files
| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `EmailTemplateCategory` enum, `EmailTemplate` model, new fields on `DeliveryLog`, `MarketingPost`, `ParentEnquiry` |
| `src/lib/nav-config.ts` | Add email compose route |
| `src/components/layout/TopBar.tsx` | Add pageTitles entry |
| `src/lib/role-permissions.ts` | Add page access + feature flag |
| `src/components/marketing/PostsTab.tsx` | Add "+ New Email" button, email delivery status column |
| `src/components/enquiries/EnquiryDetailPanel.tsx` | Add "Send Welcome Email" button + EmailHistorySection |

---

## Chunk 1: Schema + Shared Utilities

### Task 1: Update Prisma Schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add EmailTemplateCategory enum and EmailTemplate model**

Add after the last enum definition in the schema:

```prisma
enum EmailTemplateCategory {
  welcome
  newsletter
  event
  announcement
  custom
}

model EmailTemplate {
  id          String                @id @default(cuid())
  name        String
  category    EmailTemplateCategory @default(custom)
  subject     String
  htmlContent String?               @db.Text
  blocks      Json?
  isDefault   Boolean               @default(false)
  createdById String?
  createdBy   User?                 @relation("EmailTemplateCreator", fields: [createdById], references: [id])
  createdAt   DateTime              @default(now())
  updatedAt   DateTime              @updatedAt
}
```

**Important**: The `User` model may need the relation name `"EmailTemplateCreator"` added to its `EmailTemplate` relation. Check if `User` already has an `EmailTemplate` relation — if not, add:
```prisma
emailTemplates  EmailTemplate[] @relation("EmailTemplateCreator")
```

- [ ] **Step 2: Add new fields to DeliveryLog model**

Find the `DeliveryLog` model and add these fields before `createdAt`:

```prisma
entityType   String?
entityId     String?
subject      String?
templateId   String?
renderedHtml String?    @db.Text
```

Add this index at the end of the model (before closing `}`):
```prisma
@@index([entityType, entityId])
```

- [ ] **Step 3: Add deliveryLogId to MarketingPost model**

Find the `MarketingPost` model and add after `engagementSyncedAt`:

```prisma
deliveryLogId  String?
```

- [ ] **Step 4: Add lastEmailSentAt to ParentEnquiry model**

Find the `ParentEnquiry` model and add after `updatedAt`:

```prisma
lastEmailSentAt  DateTime?
```

- [ ] **Step 5: Push schema to local database**

Run: `npx prisma db push`
Expected: Schema synced successfully

- [ ] **Step 6: Push schema to production database**

Run: `DATABASE_URL="<railway-url>" npx prisma db push`
Expected: Schema synced successfully

- [ ] **Step 7: Generate Prisma client**

Run: `npx prisma generate`

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add EmailTemplate model and extend DeliveryLog/MarketingPost/ParentEnquiry"
```

---

### Task 2: Create Marketing Email Layout + Rendering Utilities

**Files:**
- Create: `src/lib/email-marketing-layout.ts`

- [ ] **Step 1: Create the marketing layout and block rendering utilities**

```typescript
/**
 * Parent-facing email layout + block-to-HTML rendering + placeholder interpolation.
 *
 * Unlike baseLayout() in email-templates.ts (internal/system branding),
 * this wrapper is for parent-facing marketing emails: clean branding,
 * no "EOS Dashboard" subtitle, no "automated email" footer.
 */

// ── Types ─────────────────────────────────────────────────────

export interface EmailBlock {
  type: "heading" | "text" | "image" | "button" | "divider" | "spacer";
  // heading
  text?: string;
  level?: "h1" | "h2" | "h3";
  // text
  content?: string;
  // image
  url?: string;
  alt?: string;
  linkUrl?: string;
  // button
  label?: string;
  color?: string;
  // spacer
  height?: number;
}

// ── Layout ────────────────────────────────────────────────────

export function marketingLayout(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color:#004E64;padding:24px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">
                Amana OSHC
              </h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
                Amana OSHC &bull; <a href="https://amanaoshc.com.au" style="color:#9ca3af;">amanaoshc.com.au</a><br/>
                <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Block Rendering ───────────────────────────────────────────

const HEADING_STYLES: Record<string, string> = {
  h1: "margin:0 0 16px;font-size:24px;font-weight:700;color:#111827;line-height:1.3;",
  h2: "margin:0 0 12px;font-size:20px;font-weight:600;color:#111827;line-height:1.3;",
  h3: "margin:0 0 8px;font-size:16px;font-weight:600;color:#374151;line-height:1.3;",
};

function renderBlock(block: EmailBlock): string {
  switch (block.type) {
    case "heading":
      return `<${block.level || "h2"} style="${HEADING_STYLES[block.level || "h2"]}">${escapeHtml(block.text || "")}</${block.level || "h2"}>`;

    case "text":
      return `<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">${escapeHtml(block.content || "").replace(/\n/g, "<br/>")}</p>`;

    case "image": {
      const img = `<img src="${escapeHtml(block.url || "")}" alt="${escapeHtml(block.alt || "")}" style="max-width:100%;height:auto;border-radius:8px;display:block;margin:0 auto 16px;" />`;
      return block.linkUrl
        ? `<a href="${escapeHtml(block.linkUrl)}" target="_blank">${img}</a>`
        : img;
    }

    case "button":
      return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
  <tr>
    <td align="center">
      <a href="${escapeHtml(block.url || block.linkUrl || "#")}" target="_blank" style="display:inline-block;background-color:${block.color || "#004E64"};color:#ffffff;font-size:15px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">
        ${escapeHtml(block.label || "Click Here")}
      </a>
    </td>
  </tr>
</table>`;

    case "divider":
      return `<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />`;

    case "spacer":
      return `<div style="height:${block.height || 24}px;"></div>`;

    default:
      return "";
  }
}

export function renderBlocksToHtml(
  blocks: EmailBlock[],
  variables?: Record<string, string>,
): string {
  const blockHtml = blocks.map(renderBlock).join("\n");
  const interpolated = variables
    ? interpolateVariables(blockHtml, variables)
    : blockHtml;
  return marketingLayout(interpolated);
}

// ── Interpolation ─────────────────────────────────────────────

export function interpolateVariables(
  html: string,
  variables: Record<string, string>,
): string {
  return html.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key] ?? "";
  });
}

// ── Helpers ───────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds (no imports yet, just utilities)

- [ ] **Step 3: Commit**

```bash
git add src/lib/email-marketing-layout.ts
git commit -m "feat: add marketing email layout, block renderer, and placeholder interpolation"
```

---

## Chunk 2: API Routes

### Task 3: Email Template CRUD API

**Files:**
- Create: `src/app/api/email-templates/route.ts`
- Create: `src/app/api/email-templates/[id]/route.ts`
- Create: `src/app/api/email-templates/[id]/duplicate/route.ts`

- [ ] **Step 1: Create the list + create route**

Create `src/app/api/email-templates/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.enum(["welcome", "newsletter", "event", "announcement", "custom"]).default("custom"),
  subject: z.string().min(1).max(500),
  htmlContent: z.string().optional().nullable(),
  blocks: z.array(z.object({
    type: z.enum(["heading", "text", "image", "button", "divider", "spacer"]),
    text: z.string().optional(),
    level: z.enum(["h1", "h2", "h3"]).optional(),
    content: z.string().optional(),
    url: z.string().optional(),
    alt: z.string().optional(),
    linkUrl: z.string().optional(),
    label: z.string().optional(),
    color: z.string().optional(),
    height: z.number().optional(),
  })).optional().nullable(),
  isDefault: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin", "coordinator"]);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");

  const where: Record<string, unknown> = {};
  if (category) where.category = category;

  const templates = await prisma.emailTemplate.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: { createdBy: { select: { id: true, name: true } } },
  });

  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const data = parsed.data;

  // If setting as default, unset any existing default for this category
  if (data.isDefault) {
    await prisma.emailTemplate.updateMany({
      where: { category: data.category, isDefault: true },
      data: { isDefault: false },
    });
  }

  const template = await prisma.emailTemplate.create({
    data: {
      name: data.name,
      category: data.category,
      subject: data.subject,
      htmlContent: data.htmlContent || null,
      blocks: data.blocks || undefined,
      isDefault: data.isDefault || false,
      createdById: session.user.id,
    },
    include: { createdBy: { select: { id: true, name: true } } },
  });

  return NextResponse.json(template, { status: 201 });
}
```

- [ ] **Step 2: Create the single template route (GET/PATCH/DELETE)**

Create `src/app/api/email-templates/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  category: z.enum(["welcome", "newsletter", "event", "announcement", "custom"]).optional(),
  subject: z.string().min(1).max(500).optional(),
  htmlContent: z.string().optional().nullable(),
  blocks: z.array(z.object({
    type: z.enum(["heading", "text", "image", "button", "divider", "spacer"]),
    text: z.string().optional(),
    level: z.enum(["h1", "h2", "h3"]).optional(),
    content: z.string().optional(),
    url: z.string().optional(),
    alt: z.string().optional(),
    linkUrl: z.string().optional(),
    label: z.string().optional(),
    color: z.string().optional(),
    height: z.number().optional(),
  })).optional().nullable(),
  isDefault: z.boolean().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin", "coordinator"]);
  if (error) return error;

  const { id } = await params;
  const template = await prisma.emailTemplate.findUnique({
    where: { id },
    include: { createdBy: { select: { id: true, name: true } } },
  });

  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  return NextResponse.json(template);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const existing = await prisma.emailTemplate.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const data = parsed.data;

  // If setting as default, unset existing defaults for the target category
  if (data.isDefault) {
    const cat = data.category || existing.category;
    await prisma.emailTemplate.updateMany({
      where: { category: cat, isDefault: true, id: { not: id } },
      data: { isDefault: false },
    });
  }

  const updated = await prisma.emailTemplate.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.subject !== undefined && { subject: data.subject }),
      ...(data.htmlContent !== undefined && { htmlContent: data.htmlContent }),
      ...(data.blocks !== undefined && { blocks: data.blocks }),
      ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
    },
    include: { createdBy: { select: { id: true, name: true } } },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { id } = await params;
  const existing = await prisma.emailTemplate.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  await prisma.emailTemplate.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Create the duplicate route**

Create `src/app/api/email-templates/[id]/duplicate/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { id } = await params;
  const original = await prisma.emailTemplate.findUnique({ where: { id } });
  if (!original) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const clone = await prisma.emailTemplate.create({
    data: {
      name: `${original.name} (Copy)`,
      category: original.category,
      subject: original.subject,
      htmlContent: original.htmlContent,
      blocks: original.blocks || undefined,
      isDefault: false,
      createdById: session.user.id,
    },
    include: { createdBy: { select: { id: true, name: true } } },
  });

  return NextResponse.json(clone, { status: 201 });
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/email-templates/
git commit -m "feat: add email template CRUD + duplicate API routes"
```

---

### Task 4: Email Campaign Send + Preview API

**Files:**
- Create: `src/app/api/email/campaign/send/route.ts`
- Create: `src/app/api/email/preview/route.ts`

- [ ] **Step 1: Create the campaign send route**

Create `src/app/api/email/campaign/send/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import {
  isBrevoConfigured,
  sendTransactionalEmail,
  sendCampaignEmail,
} from "@/lib/brevo";
import {
  renderBlocksToHtml,
  interpolateVariables,
  marketingLayout,
  type EmailBlock,
} from "@/lib/email-marketing-layout";

const sendSchema = z.object({
  templateId: z.string().optional().nullable(),
  subject: z.string().min(1).max(500),
  htmlContent: z.string().optional().nullable(),
  blocks: z.array(z.any()).optional().nullable(),
  serviceIds: z.array(z.string()).optional(),
  allCentres: z.boolean().optional(),
  scheduledAt: z.string().datetime().optional().nullable(),
  enquiryId: z.string().optional().nullable(),
  postId: z.string().optional().nullable(),
  variables: z.record(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin", "coordinator"]);
  if (error) return error;

  if (!isBrevoConfigured()) {
    return NextResponse.json(
      { error: "Email delivery not configured (missing BREVO_API_KEY)" },
      { status: 503 },
    );
  }

  try {
    // Read body once upfront (NextRequest.json() can only be called once)
    const body = await req.json();

    // Coordinators can only send enquiry emails (not marketing campaigns)
    if (session.user.role === "coordinator" && !body.enquiryId) {
      return NextResponse.json({ error: "Coordinators can only send enquiry emails" }, { status: 403 });
    }

    const parsed = sendSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const data = parsed.data;

    // Double-send protection: check if post already sent
    if (data.postId) {
      const post = await prisma.marketingPost.findUnique({
        where: { id: data.postId },
        select: { deliveryLogId: true },
      });
      if (post?.deliveryLogId) {
        return NextResponse.json(
          { error: "This post has already been sent as an email" },
          { status: 409 },
        );
      }
    }

    // 1. Resolve HTML content
    let finalHtml: string;
    const variables = data.variables || {};

    if (data.templateId) {
      const template = await prisma.emailTemplate.findUnique({
        where: { id: data.templateId },
      });
      if (!template) {
        return NextResponse.json({ error: "Template not found" }, { status: 404 });
      }

      if (template.blocks && Array.isArray(template.blocks)) {
        finalHtml = renderBlocksToHtml(template.blocks as EmailBlock[], variables);
      } else if (template.htmlContent) {
        finalHtml = interpolateVariables(template.htmlContent, variables);
      } else {
        return NextResponse.json({ error: "Template has no content" }, { status: 400 });
      }
    } else if (data.blocks && Array.isArray(data.blocks)) {
      finalHtml = renderBlocksToHtml(data.blocks as EmailBlock[], variables);
    } else if (data.htmlContent) {
      finalHtml = interpolateVariables(
        marketingLayout(data.htmlContent),
        variables,
      );
    } else {
      return NextResponse.json({ error: "No content provided" }, { status: 400 });
    }

    // 2. Resolve recipients
    let recipients: Array<{ email: string; name?: string }>;

    if (data.enquiryId) {
      // Single recipient: the enquiry parent
      const enquiry = await prisma.parentEnquiry.findUnique({
        where: { id: data.enquiryId },
        include: { service: { select: { name: true, code: true } } },
      });
      if (!enquiry) {
        return NextResponse.json({ error: "Enquiry not found" }, { status: 404 });
      }
      if (!enquiry.parentEmail) {
        return NextResponse.json({ error: "Enquiry has no email address" }, { status: 400 });
      }
      recipients = [{ email: enquiry.parentEmail, name: enquiry.parentName }];
    } else {
      // Marketing campaign: resolve from CentreContact
      const contactWhere: Record<string, unknown> = { subscribed: true };

      if (!data.allCentres && data.serviceIds && data.serviceIds.length > 0) {
        contactWhere.serviceId = { in: data.serviceIds };
      }

      const contacts = await prisma.centreContact.findMany({
        where: contactWhere,
        select: { email: true, firstName: true, lastName: true },
      });

      // Deduplicate by email
      const seen = new Set<string>();
      recipients = [];
      for (const c of contacts) {
        const lower = c.email.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || undefined;
          recipients.push({ email: c.email, name });
        }
      }

      if (recipients.length === 0) {
        return NextResponse.json({ error: "No recipients found for selected centres" }, { status: 400 });
      }
    }

    // 3. Send via Brevo
    let externalId: string;
    const status = data.scheduledAt ? "scheduled" : "sent";

    if (recipients.length < 50) {
      const result = await sendTransactionalEmail({
        to: recipients,
        subject: data.subject,
        htmlContent: finalHtml,
        scheduledAt: data.scheduledAt || undefined,
      });
      externalId = result.messageId;
    } else {
      const result = await sendCampaignEmail({
        recipients,
        subject: data.subject,
        htmlContent: finalHtml,
        scheduledAt: data.scheduledAt || undefined,
      });
      externalId = `campaign-${result.campaignId}`;
    }

    // 4. Create DeliveryLog
    const deliveryLog = await prisma.deliveryLog.create({
      data: {
        channel: "email",
        messageType: data.enquiryId ? "welcome" : "campaign",
        externalId,
        recipientCount: recipients.length,
        status,
        subject: data.subject,
        templateId: data.templateId || null,
        entityType: data.enquiryId ? "ParentEnquiry" : data.postId ? "MarketingPost" : null,
        entityId: data.enquiryId || data.postId || null,
        renderedHtml: finalHtml,
        payload: {
          subject: data.subject,
          recipientCount: recipients.length,
          templateId: data.templateId || null,
          serviceIds: data.serviceIds || [],
          allCentres: data.allCentres || false,
        },
      },
    });

    // 5. Update linked entities
    if (data.enquiryId) {
      await prisma.parentEnquiry.update({
        where: { id: data.enquiryId },
        data: { lastEmailSentAt: new Date() },
      });
    }

    if (data.postId) {
      await prisma.marketingPost.update({
        where: { id: data.postId },
        data: { deliveryLogId: deliveryLog.id },
      });
    }

    // 6. Activity log
    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: "email_sent",
        entityType: "DeliveryLog",
        entityId: deliveryLog.id,
        details: {
          subject: data.subject,
          recipientCount: recipients.length,
          status,
          templateId: data.templateId || null,
          enquiryId: data.enquiryId || null,
          postId: data.postId || null,
        },
      },
    });

    return NextResponse.json({
      success: true,
      deliveryLogId: deliveryLog.id,
      recipientCount: recipients.length,
      status,
    });
  } catch (err) {
    console.error("[Email Campaign Send]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send email" },
      { status: 500 },
    );
  }
}
```

**Note**: The `requireAuth` call reads the body internally. Since `req.json()` can only be called once, the route reads body after auth. Check that `requireAuth` in this project does NOT read the body (it uses session, not body). This is correct — `requireAuth` uses `getServerSession()`.

- [ ] **Step 2: Create the preview route**

Create `src/app/api/email/preview/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import {
  renderBlocksToHtml,
  interpolateVariables,
  marketingLayout,
  type EmailBlock,
} from "@/lib/email-marketing-layout";

const previewSchema = z.object({
  templateId: z.string().optional().nullable(),
  htmlContent: z.string().optional().nullable(),
  blocks: z.array(z.any()).optional().nullable(),
  variables: z.record(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin", "coordinator"]);
  if (error) return error;

  const body = await req.json();
  const parsed = previewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const data = parsed.data;
  const sampleVars: Record<string, string> = {
    parentName: "Jane Smith",
    parentFirstName: "Jane",
    serviceName: "Amana OSHC Auburn",
    serviceCode: "AUB",
    enquiryDate: "17 March 2026",
    centreName: "Amana OSHC Auburn",
    centreAddress: "123 Example St, Auburn NSW 2144",
    centrePhone: "(02) 1234 5678",
    ...data.variables,
  };

  let html: string;

  if (data.templateId) {
    const template = await prisma.emailTemplate.findUnique({
      where: { id: data.templateId },
    });
    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    if (template.blocks && Array.isArray(template.blocks)) {
      html = renderBlocksToHtml(template.blocks as EmailBlock[], sampleVars);
    } else if (template.htmlContent) {
      html = interpolateVariables(template.htmlContent, sampleVars);
    } else {
      html = marketingLayout("<p>No content in template.</p>");
    }
  } else if (data.blocks && Array.isArray(data.blocks)) {
    html = renderBlocksToHtml(data.blocks as EmailBlock[], sampleVars);
  } else if (data.htmlContent) {
    html = interpolateVariables(marketingLayout(data.htmlContent), sampleVars);
  } else {
    html = marketingLayout("<p>No content to preview.</p>");
  }

  return NextResponse.json({ html });
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/email/campaign/ src/app/api/email/preview/
git commit -m "feat: add email campaign send and preview API routes"
```

---

### Task 5: React Query Hooks for Email Templates + Sending

**Files:**
- Create: `src/hooks/useEmailTemplates.ts`

- [ ] **Step 1: Create the hooks file**

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/Toast";

// ── Types ─────────────────────────────────────────────────────

export interface EmailTemplateData {
  id: string;
  name: string;
  category: "welcome" | "newsletter" | "event" | "announcement" | "custom";
  subject: string;
  htmlContent: string | null;
  blocks: unknown[] | null;
  isDefault: boolean;
  createdBy?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

interface CreateTemplateInput {
  name: string;
  category?: string;
  subject: string;
  htmlContent?: string | null;
  blocks?: unknown[] | null;
  isDefault?: boolean;
}

interface UpdateTemplateInput {
  name?: string;
  category?: string;
  subject?: string;
  htmlContent?: string | null;
  blocks?: unknown[] | null;
  isDefault?: boolean;
}

interface SendEmailInput {
  templateId?: string | null;
  subject: string;
  htmlContent?: string | null;
  blocks?: unknown[] | null;
  serviceIds?: string[];
  allCentres?: boolean;
  scheduledAt?: string | null;
  enquiryId?: string | null;
  postId?: string | null;
  variables?: Record<string, string>;
}

interface PreviewInput {
  templateId?: string | null;
  htmlContent?: string | null;
  blocks?: unknown[] | null;
  variables?: Record<string, string>;
}

// ── Helpers ───────────────────────────────────────────────────

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return res.json();
}

// ── Template Hooks ────────────────────────────────────────────

export function useEmailTemplates(category?: string) {
  const params = category ? `?category=${category}` : "";
  return useQuery<EmailTemplateData[]>({
    queryKey: ["email-templates", category || "all"],
    queryFn: () => apiFetch(`/api/email-templates${params}`),
  });
}

export function useEmailTemplate(id: string | null) {
  return useQuery<EmailTemplateData>({
    queryKey: ["email-template", id],
    queryFn: () => apiFetch(`/api/email-templates/${id}`),
    enabled: !!id,
  });
}

export function useCreateEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTemplateInput) =>
      apiFetch<EmailTemplateData>("/api/email-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-templates"] });
      toast({ description: "Template created" });
    },
    onError: (err: Error) => toast({ description: err.message }),
  });
}

export function useUpdateEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateTemplateInput & { id: string }) =>
      apiFetch<EmailTemplateData>(`/api/email-templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-templates"] });
      toast({ description: "Template updated" });
    },
    onError: (err: Error) => toast({ description: err.message }),
  });
}

export function useDeleteEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/email-templates/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-templates"] });
      toast({ description: "Template deleted" });
    },
    onError: (err: Error) => toast({ description: err.message }),
  });
}

export function useDuplicateEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<EmailTemplateData>(`/api/email-templates/${id}/duplicate`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-templates"] });
      toast({ description: "Template duplicated" });
    },
    onError: (err: Error) => toast({ description: err.message }),
  });
}

// ── Send + Preview Hooks ──────────────────────────────────────

export function useSendEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SendEmailInput) =>
      apiFetch<{ success: boolean; recipientCount: number; status: string }>(
        "/api/email/campaign/send",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      ),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["email-templates"] });
      qc.invalidateQueries({ queryKey: ["marketing-posts"] });
      qc.invalidateQueries({ queryKey: ["enquiry"] });
      toast({ description: `Email ${data.status} to ${data.recipientCount} recipient${data.recipientCount === 1 ? "" : "s"}` });
    },
    onError: (err: Error) => toast({ description: err.message }),
  });
}

export function useEmailPreview() {
  return useMutation({
    mutationFn: (input: PreviewInput) =>
      apiFetch<{ html: string }>("/api/email/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
  });
}

// ── Email History (for enquiry detail) ────────────────────────

interface EmailHistoryEntry {
  id: string;
  subject: string | null;
  status: string;
  recipientCount: number;
  createdAt: string;
}

export function useEmailHistory(entityType: string, entityId: string | null) {
  return useQuery<EmailHistoryEntry[]>({
    queryKey: ["email-history", entityType, entityId],
    queryFn: async () => {
      // Query DeliveryLog by entityType + entityId
      const res = await fetch(
        `/api/email/history?entityType=${entityType}&entityId=${entityId}`,
      );
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!entityId,
  });
}
```

- [ ] **Step 2: Create the email history API route**

Create `src/app/api/email/history/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");

  if (!entityType || !entityId) {
    return NextResponse.json({ error: "entityType and entityId required" }, { status: 400 });
  }

  const logs = await prisma.deliveryLog.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      subject: true,
      status: true,
      recipientCount: true,
      createdAt: true,
    },
  });

  return NextResponse.json(logs);
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useEmailTemplates.ts src/app/api/email/history/
git commit -m "feat: add email template hooks, send/preview mutations, and email history API"
```

---

## Chunk 3: Email UI Components

### Task 6: Email Block Editor Component

**Files:**
- Create: `src/components/email/EmailBlockEditor.tsx`

- [ ] **Step 1: Create the block editor**

```typescript
"use client";

import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import type { EmailBlock } from "@/lib/email-marketing-layout";

interface Props {
  blocks: EmailBlock[];
  onChange: (blocks: EmailBlock[]) => void;
}

const BLOCK_TYPES = [
  { type: "heading", label: "Heading" },
  { type: "text", label: "Text" },
  { type: "image", label: "Image" },
  { type: "button", label: "Button" },
  { type: "divider", label: "Divider" },
  { type: "spacer", label: "Spacer" },
] as const;

function defaultBlock(type: EmailBlock["type"]): EmailBlock {
  switch (type) {
    case "heading":
      return { type: "heading", level: "h2", text: "" };
    case "text":
      return { type: "text", content: "" };
    case "image":
      return { type: "image", url: "", alt: "" };
    case "button":
      return { type: "button", label: "Click Here", url: "" };
    case "divider":
      return { type: "divider" };
    case "spacer":
      return { type: "spacer", height: 24 };
  }
}

export function EmailBlockEditor({ blocks, onChange }: Props) {
  function updateBlock(index: number, patch: Partial<EmailBlock>) {
    const updated = [...blocks];
    updated[index] = { ...updated[index], ...patch };
    onChange(updated);
  }

  function removeBlock(index: number) {
    onChange(blocks.filter((_, i) => i !== index));
  }

  function moveBlock(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= blocks.length) return;
    const updated = [...blocks];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    onChange(updated);
  }

  function addBlock(type: EmailBlock["type"]) {
    onChange([...blocks, defaultBlock(type)]);
  }

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => (
        <div
          key={i}
          className="rounded-lg border border-gray-200 bg-white p-3"
        >
          {/* Block header */}
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
              {block.type}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => moveBlock(i, -1)}
                disabled={i === 0}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => moveBlock(i, 1)}
                disabled={i === blocks.length - 1}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => removeBlock(i)}
                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Block fields */}
          {block.type === "heading" && (
            <div className="space-y-2">
              <select
                value={block.level || "h2"}
                onChange={(e) =>
                  updateBlock(i, { level: e.target.value as "h1" | "h2" | "h3" })
                }
                className="rounded border border-gray-300 px-2 py-1 text-sm"
              >
                <option value="h1">H1 — Large</option>
                <option value="h2">H2 — Medium</option>
                <option value="h3">H3 — Small</option>
              </select>
              <input
                value={block.text || ""}
                onChange={(e) => updateBlock(i, { text: e.target.value })}
                placeholder="Heading text..."
                className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
              />
            </div>
          )}

          {block.type === "text" && (
            <textarea
              value={block.content || ""}
              onChange={(e) => updateBlock(i, { content: e.target.value })}
              placeholder="Paragraph text..."
              rows={3}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm resize-none"
            />
          )}

          {block.type === "image" && (
            <div className="space-y-2">
              <input
                value={block.url || ""}
                onChange={(e) => updateBlock(i, { url: e.target.value })}
                placeholder="Image URL..."
                className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
              />
              <input
                value={block.alt || ""}
                onChange={(e) => updateBlock(i, { alt: e.target.value })}
                placeholder="Alt text..."
                className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
              />
              <input
                value={block.linkUrl || ""}
                onChange={(e) => updateBlock(i, { linkUrl: e.target.value })}
                placeholder="Click-through URL (optional)..."
                className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
              />
            </div>
          )}

          {block.type === "button" && (
            <div className="grid grid-cols-2 gap-2">
              <input
                value={block.label || ""}
                onChange={(e) => updateBlock(i, { label: e.target.value })}
                placeholder="Button text..."
                className="rounded border border-gray-300 px-3 py-1.5 text-sm"
              />
              <input
                value={block.url || block.linkUrl || ""}
                onChange={(e) => updateBlock(i, { url: e.target.value })}
                placeholder="Button URL..."
                className="rounded border border-gray-300 px-3 py-1.5 text-sm"
              />
            </div>
          )}

          {block.type === "spacer" && (
            <input
              type="number"
              value={block.height || 24}
              onChange={(e) =>
                updateBlock(i, { height: parseInt(e.target.value) || 24 })
              }
              className="w-24 rounded border border-gray-300 px-3 py-1.5 text-sm"
              min={4}
              max={120}
            />
          )}
        </div>
      ))}

      {/* Add block dropdown */}
      <div className="flex flex-wrap gap-2 pt-2">
        {BLOCK_TYPES.map((bt) => (
          <button
            key={bt.type}
            type="button"
            onClick={() => addBlock(bt.type)}
            className="flex items-center gap-1 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-500 hover:border-brand hover:text-brand transition-colors"
          >
            <Plus className="h-3 w-3" />
            {bt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/email/EmailBlockEditor.tsx
git commit -m "feat: add EmailBlockEditor component with block CRUD and reorder"
```

---

### Task 7: Email HTML Editor + Preview Components

**Files:**
- Create: `src/components/email/EmailHtmlEditor.tsx`
- Create: `src/components/email/EmailPreview.tsx`

- [ ] **Step 1: Create the HTML editor**

Create `src/components/email/EmailHtmlEditor.tsx`:

```typescript
"use client";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function EmailHtmlEditor({ value, onChange }: Props) {
  return (
    <div className="flex flex-col">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[400px] w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 font-mono text-sm text-gray-800 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand resize-y"
        placeholder="Paste your HTML email template here..."
        spellCheck={false}
      />
      <p className="mt-1 text-xs text-gray-500">
        Paste raw HTML from Zoho or other email builders. Placeholders like {"{{parentName}}"} will be replaced at send time.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Create the preview component**

Create `src/components/email/EmailPreview.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Monitor, Smartphone } from "lucide-react";

interface Props {
  html: string;
}

export function EmailPreview({ html }: Props) {
  const [width, setWidth] = useState<"desktop" | "mobile">("desktop");

  return (
    <div className="flex h-full flex-col">
      {/* Width toggle */}
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setWidth("desktop")}
          className={`rounded-lg p-1.5 transition-colors ${
            width === "desktop"
              ? "bg-brand/10 text-brand"
              : "text-gray-400 hover:text-gray-600"
          }`}
        >
          <Monitor className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setWidth("mobile")}
          className={`rounded-lg p-1.5 transition-colors ${
            width === "mobile"
              ? "bg-brand/10 text-brand"
              : "text-gray-400 hover:text-gray-600"
          }`}
        >
          <Smartphone className="h-4 w-4" />
        </button>
        <span className="text-xs text-gray-500">
          {width === "desktop" ? "600px" : "375px"}
        </span>
      </div>

      {/* Preview iframe */}
      <div
        className="mx-auto flex-1 overflow-hidden rounded-lg border border-gray-200 bg-white transition-all"
        style={{ width: width === "desktop" ? 600 : 375 }}
      >
        <iframe
          srcDoc={html || "<p style='padding:32px;color:#9ca3af;'>No content to preview</p>"}
          title="Email Preview"
          className="h-full w-full border-0"
          sandbox="allow-same-origin"
          style={{ minHeight: 400 }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/email/EmailHtmlEditor.tsx src/components/email/EmailPreview.tsx
git commit -m "feat: add EmailHtmlEditor and EmailPreview components"
```

---

### Task 8: Template Picker + Import Modals

**Files:**
- Create: `src/components/email/TemplatePickerModal.tsx`
- Create: `src/components/email/ImportTemplateModal.tsx`

- [ ] **Step 1: Create template picker modal**

Create `src/components/email/TemplatePickerModal.tsx`:

```typescript
"use client";

import { X, FileText, Star } from "lucide-react";
import { useEmailTemplates, type EmailTemplateData } from "@/hooks/useEmailTemplates";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (template: EmailTemplateData) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  welcome: "Welcome",
  newsletter: "Newsletter",
  event: "Event",
  announcement: "Announcement",
  custom: "Custom",
};

export function TemplatePickerModal({ open, onClose, onSelect }: Props) {
  const { data: templates, isLoading } = useEmailTemplates();

  if (!open) return null;

  const grouped = (templates || []).reduce<Record<string, EmailTemplateData[]>>((acc, t) => {
    const key = t.category;
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="flex w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl max-h-[80vh]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Choose a Template</h2>
            <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="overflow-y-auto px-6 py-4">
            {isLoading && <p className="text-sm text-gray-500">Loading templates...</p>}

            {!isLoading && (!templates || templates.length === 0) && (
              <p className="text-sm text-gray-500">
                No templates yet. Create one or import from Zoho.
              </p>
            )}

            {Object.entries(grouped).map(([category, items]) => (
              <div key={category} className="mb-6">
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  {CATEGORY_LABELS[category] || category}
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {items.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        onSelect(t);
                        onClose();
                      }}
                      className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 text-left hover:border-brand hover:bg-brand/5 transition-colors"
                    >
                      <FileText className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <span className="truncate text-sm font-medium text-gray-900">
                            {t.name}
                          </span>
                          {t.isDefault && <Star className="h-3 w-3 text-amber-500" />}
                        </div>
                        <p className="truncate text-xs text-gray-500">{t.subject}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex shrink-0 justify-end border-t border-gray-200 px-6 py-3">
            <button
              onClick={() => {
                onSelect({ id: "", name: "", category: "custom", subject: "", htmlContent: null, blocks: null, isDefault: false, createdAt: "", updatedAt: "" });
                onClose();
              }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Start Blank
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Create import template modal**

Create `src/components/email/ImportTemplateModal.tsx`:

```typescript
"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useCreateEmailTemplate } from "@/hooks/useEmailTemplates";

interface Props {
  open: boolean;
  onClose: () => void;
}

const CATEGORIES = [
  { value: "welcome", label: "Welcome" },
  { value: "newsletter", label: "Newsletter" },
  { value: "event", label: "Event" },
  { value: "announcement", label: "Announcement" },
  { value: "custom", label: "Custom" },
] as const;

export function ImportTemplateModal({ open, onClose }: Props) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("custom");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");

  const createTemplate = useCreateEmailTemplate();

  function reset() {
    setName("");
    setCategory("custom");
    setSubject("");
    setHtml("");
    setError("");
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleImport() {
    if (!name.trim()) { setError("Name is required"); return; }
    if (!subject.trim()) { setError("Subject line is required"); return; }
    if (!html.trim()) { setError("HTML content is required"); return; }

    createTemplate.mutate(
      {
        name: name.trim(),
        category,
        subject: subject.trim(),
        htmlContent: html.trim(),
      },
      {
        onSuccess: handleClose,
        onError: (err) => setError(err instanceof Error ? err.message : "Import failed"),
      },
    );
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={handleClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="flex w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl max-h-[85vh]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Import Template from Zoho</h2>
            <button onClick={handleClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4 overflow-y-auto px-6 py-4">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Template Name <span className="text-red-500">*</span>
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                placeholder="e.g., Monthly Newsletter"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Subject Line <span className="text-red-500">*</span>
                </label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                  placeholder="Email subject..."
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                HTML Content <span className="text-red-500">*</span>
              </label>
              <p className="mb-2 text-xs text-gray-500">
                In Zoho Campaigns, go to your template → Export → Copy HTML. Paste it below.
              </p>
              <textarea
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                rows={12}
                className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 font-mono text-xs focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand resize-none"
                placeholder="<!DOCTYPE html>..."
              />
            </div>
          </div>

          <div className="flex shrink-0 justify-end gap-3 border-t border-gray-200 px-6 py-4">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={createTemplate.isPending}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
            >
              {createTemplate.isPending ? "Importing..." : "Import Template"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/email/TemplatePickerModal.tsx src/components/email/ImportTemplateModal.tsx
git commit -m "feat: add TemplatePickerModal and ImportTemplateModal components"
```

---

### Task 9: Full Email Composer Component + Page Route

**Files:**
- Create: `src/components/email/EmailComposer.tsx`
- Create: `src/app/(dashboard)/marketing/email/compose/page.tsx`

- [ ] **Step 1: Create the email composer component**

Create `src/components/email/EmailComposer.tsx`:

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Send, Clock, Eye } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { EmailBlockEditor } from "./EmailBlockEditor";
import { EmailHtmlEditor } from "./EmailHtmlEditor";
import { EmailPreview } from "./EmailPreview";
import { TemplatePickerModal } from "./TemplatePickerModal";
import {
  useSendEmail,
  useEmailPreview,
  useEmailTemplate,
  type EmailTemplateData,
} from "@/hooks/useEmailTemplates";
import type { EmailBlock } from "@/lib/email-marketing-layout";

type EditorMode = "blocks" | "html";

export function EmailComposer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const postId = searchParams.get("postId");
  const templateIdParam = searchParams.get("templateId");

  // State
  const [subject, setSubject] = useState("");
  const [blocks, setBlocks] = useState<EmailBlock[]>([
    { type: "heading", level: "h2", text: "" },
    { type: "text", content: "" },
  ]);
  const [htmlContent, setHtmlContent] = useState("");
  const [mode, setMode] = useState<EditorMode>("blocks");
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [allCentres, setAllCentres] = useState(true);
  const [scheduledAt, setScheduledAt] = useState("");
  const [showSchedule, setShowSchedule] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);

  const sendEmail = useSendEmail();
  const preview = useEmailPreview();

  // Load template if templateId param
  const { data: initialTemplate } = useEmailTemplate(templateIdParam || null);

  // Load post data if postId param (for "Send as Email" from existing post)
  const { data: postData } = useQuery<{ title: string; content: string | null }>({
    queryKey: ["marketing-post", postId],
    queryFn: async () => {
      const res = await fetch(`/api/marketing/posts/${postId}`);
      if (!res.ok) throw new Error("Failed to load post");
      return res.json();
    },
    enabled: !!postId,
  });

  // Pre-fill from post data
  useEffect(() => {
    if (postData) {
      setSubject(postData.title);
      if (postData.content) {
        setBlocks([{ type: "text", content: postData.content }]);
      }
    }
  }, [postData]);

  // Load services for recipient selection
  const { data: services } = useQuery<{ id: string; name: string; code: string }[]>({
    queryKey: ["services-list"],
    queryFn: async () => {
      const res = await fetch("/api/services?status=active");
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((s: { id: string; name: string; code: string }) => ({
        id: s.id,
        name: s.name,
        code: s.code,
      }));
    },
  });

  // Recipient count
  const { data: recipientCount } = useQuery<number>({
    queryKey: ["recipient-count", allCentres, selectedServiceIds],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (!allCentres && selectedServiceIds.length > 0) {
        selectedServiceIds.forEach((id) => params.append("serviceId", id));
      }
      const res = await fetch(`/api/email/recipient-count?${params.toString()}`);
      if (!res.ok) return 0;
      const data = await res.json();
      return data.count;
    },
  });

  // Apply initial template
  useEffect(() => {
    if (initialTemplate) {
      applyTemplate(initialTemplate);
    }
  }, [initialTemplate]);

  function applyTemplate(t: EmailTemplateData) {
    setSubject(t.subject);
    if (t.blocks && Array.isArray(t.blocks) && t.blocks.length > 0) {
      setBlocks(t.blocks as EmailBlock[]);
      setMode("blocks");
    } else if (t.htmlContent) {
      setHtmlContent(t.htmlContent);
      setMode("html");
    }
  }

  // Debounced preview
  const updatePreview = useCallback(() => {
    if (mode === "blocks" && blocks.length > 0) {
      preview.mutate({ blocks });
    } else if (mode === "html" && htmlContent) {
      preview.mutate({ htmlContent });
    }
  }, [mode, blocks, htmlContent]);

  useEffect(() => {
    const timer = setTimeout(updatePreview, 500);
    return () => clearTimeout(timer);
  }, [updatePreview]);

  useEffect(() => {
    if (preview.data?.html) {
      setPreviewHtml(preview.data.html);
    }
  }, [preview.data]);

  function handleSend() {
    sendEmail.mutate(
      {
        subject,
        ...(mode === "blocks" ? { blocks } : { htmlContent }),
        serviceIds: allCentres ? undefined : selectedServiceIds,
        allCentres,
        scheduledAt: showSchedule && scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        postId: postId || undefined,
      },
      {
        onSuccess: () => {
          setConfirmSend(false);
          router.push("/marketing");
        },
      },
    );
  }

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/marketing")}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900">Compose Email</h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTemplatePicker(true)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Templates
          </button>
          <button
            onClick={() => setConfirmSend(true)}
            disabled={!subject.trim() || sendEmail.isPending}
            className="flex items-center gap-2 rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {showSchedule && scheduledAt ? "Schedule" : "Send"}
          </button>
        </div>
      </div>

      {/* Split pane */}
      <div className="flex min-h-0 flex-1">
        {/* Left: Editor */}
        <div className="flex w-1/2 flex-col overflow-y-auto border-r border-gray-200 p-4">
          {/* Subject */}
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">Subject</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              placeholder="Email subject line..."
            />
          </div>

          {/* Mode toggle */}
          <div className="mb-4 flex items-center gap-2">
            <button
              onClick={() => setMode("blocks")}
              className={`rounded-lg px-3 py-1 text-sm font-medium transition-colors ${
                mode === "blocks"
                  ? "bg-brand/10 text-brand"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Block Editor
            </button>
            <button
              onClick={() => setMode("html")}
              className={`rounded-lg px-3 py-1 text-sm font-medium transition-colors ${
                mode === "html"
                  ? "bg-brand/10 text-brand"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              HTML
            </button>
          </div>

          {/* Editor */}
          {mode === "blocks" ? (
            <EmailBlockEditor blocks={blocks} onChange={setBlocks} />
          ) : (
            <EmailHtmlEditor value={htmlContent} onChange={setHtmlContent} />
          )}

          {/* Recipients */}
          <div className="mt-6 border-t border-gray-200 pt-4">
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Recipients</h3>

            <label className="mb-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allCentres}
                onChange={(e) => setAllCentres(e.target.checked)}
                className="rounded border-gray-300"
              />
              All Centres
            </label>

            {!allCentres && (
              <div className="mb-2 flex flex-wrap gap-2">
                {services?.map((s) => (
                  <label key={s.id} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedServiceIds.includes(s.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedServiceIds((prev) => [...prev, s.id]);
                        } else {
                          setSelectedServiceIds((prev) => prev.filter((id) => id !== s.id));
                        }
                      }}
                      className="rounded border-gray-300"
                    />
                    {s.name} ({s.code})
                  </label>
                ))}
              </div>
            )}

            <p className="text-xs text-gray-500">
              Will send to {recipientCount ?? "..."} contact{recipientCount !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Schedule */}
          <div className="mt-4 border-t border-gray-200 pt-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showSchedule}
                onChange={(e) => setShowSchedule(e.target.checked)}
                className="rounded border-gray-300"
              />
              <Clock className="h-4 w-4 text-gray-500" />
              Schedule for later
            </label>
            {showSchedule && (
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            )}
          </div>
        </div>

        {/* Right: Preview */}
        <div className="flex w-1/2 flex-col p-4">
          <div className="mb-2 flex items-center gap-2">
            <Eye className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Preview</span>
            {preview.isPending && (
              <span className="text-xs text-gray-400">Updating...</span>
            )}
          </div>
          <EmailPreview html={previewHtml} />
        </div>
      </div>

      {/* Confirm send dialog */}
      {confirmSend && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setConfirmSend(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-gray-900">
                {showSchedule && scheduledAt ? "Schedule Email?" : "Send Email?"}
              </h3>
              <p className="mt-2 text-sm text-gray-600">
                {showSchedule && scheduledAt
                  ? `This will schedule the email to ${recipientCount ?? 0} recipients. This cannot be undone.`
                  : `This will send the email to ${recipientCount ?? 0} recipients across ${allCentres ? "all centres" : `${selectedServiceIds.length} centre${selectedServiceIds.length === 1 ? "" : "s"}`}. This cannot be undone.`}
              </p>
              <div className="mt-4 flex justify-end gap-3">
                <button
                  onClick={() => setConfirmSend(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSend}
                  disabled={sendEmail.isPending}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
                >
                  {sendEmail.isPending ? "Sending..." : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Template picker */}
      <TemplatePickerModal
        open={showTemplatePicker}
        onClose={() => setShowTemplatePicker(false)}
        onSelect={applyTemplate}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create the recipient count API route**

Create `src/app/api/email/recipient-count/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const serviceIds = searchParams.getAll("serviceId");

  const where: Record<string, unknown> = { subscribed: true };
  if (serviceIds.length > 0) {
    where.serviceId = { in: serviceIds };
  }

  const contacts = await prisma.centreContact.findMany({
    where,
    select: { email: true },
  });

  // Deduplicate by email
  const unique = new Set(contacts.map((c) => c.email.toLowerCase()));

  return NextResponse.json({ count: unique.size });
}
```

- [ ] **Step 3: Create the composer page route**

Create `src/app/(dashboard)/marketing/email/compose/page.tsx`:

```typescript
import { EmailComposer } from "@/components/email/EmailComposer";

export default function EmailComposePage() {
  return <EmailComposer />;
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/components/email/EmailComposer.tsx src/app/api/email/recipient-count/ src/app/\\(dashboard\\)/marketing/email/
git commit -m "feat: add full email composer component with split-pane editor/preview and compose page route"
```

---

## Chunk 4: Marketing + Page Registration

### Task 10: Register Email Compose Page + Update PostsTab

**Files:**
- Modify: `src/lib/nav-config.ts`
- Modify: `src/components/layout/TopBar.tsx`
- Modify: `src/lib/role-permissions.ts`
- Modify: `src/components/marketing/PostsTab.tsx`

- [ ] **Step 1: Add to nav-config.ts**

In `src/lib/nav-config.ts`, find the Marketing entry under the Engagement section. The email compose route is a sub-page (accessed via button, not sidebar), so no sidebar entry is needed. However, ensure the `/marketing/email/compose` path is recognized by the nav system. If there's a route matching pattern, add it as a child of `/marketing`.

- [ ] **Step 2: Add page title to TopBar.tsx**

Find the `pageTitles` object in `src/components/layout/TopBar.tsx` and add:

```typescript
"/marketing/email/compose": "Compose Email",
```

- [ ] **Step 3: Add to role-permissions.ts**

In `src/lib/role-permissions.ts`, find the `allPages` array and add `"/marketing/email/compose"`. Then in `rolePageAccess`, add it to the `owner`, `head_office`, and `admin` arrays.

- [ ] **Step 4: Update PostsTab with "+ New Email" button and "Send as Email" action**

In `src/components/marketing/PostsTab.tsx`, add a "+ New Email" button next to the existing "+ New Post" button in the header area, and an "Import Template" button. The "+ New Email" button navigates to `/marketing/email/compose`. Add an "Import Template" modal trigger.

Find the button area in the PostsTab and add:

```typescript
import { useRouter } from "next/navigation";
import { ImportTemplateModal } from "@/components/email/ImportTemplateModal";
```

Add state for import modal: `const [showImport, setShowImport] = useState(false);`
Add router: `const router = useRouter();`

Add alongside the existing "+ New Post" button:

```tsx
<button
  onClick={() => router.push("/marketing/email/compose")}
  className="flex items-center gap-2 rounded-lg border border-brand px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand/5 transition-colors"
>
  + New Email
</button>
<button
  onClick={() => setShowImport(true)}
  className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
>
  Import Template
</button>
```

At the bottom of the component, add:
```tsx
<ImportTemplateModal open={showImport} onClose={() => setShowImport(false)} />
```

Also add a "Send as Email" action in the post row actions (wherever the post detail action menu exists). This should navigate to `/marketing/email/compose?postId={post.id}`.

- [ ] **Step 5: Verify build**

Run: `npm run build`

- [ ] **Step 6: Commit**

```bash
git add src/lib/nav-config.ts src/components/layout/TopBar.tsx src/lib/role-permissions.ts src/components/marketing/PostsTab.tsx
git commit -m "feat: register email compose page and add New Email + Import Template buttons to PostsTab"
```

---

## Chunk 5: Enquiries Integration

### Task 11: Send Welcome Email Modal

**Files:**
- Create: `src/components/enquiries/SendWelcomeEmailModal.tsx`

- [ ] **Step 1: Create the welcome email modal**

```typescript
"use client";

import { useState, useEffect } from "react";
import { X, Send } from "lucide-react";
import {
  useEmailTemplates,
  useSendEmail,
  useEmailPreview,
  type EmailTemplateData,
} from "@/hooks/useEmailTemplates";
import { EmailPreview } from "@/components/email/EmailPreview";

interface Props {
  open: boolean;
  onClose: () => void;
  enquiry: {
    id: string;
    parentName: string;
    parentEmail: string | null;
    service: { id: string; name: string; code: string };
  };
}

export function SendWelcomeEmailModal({ open, onClose, enquiry }: Props) {
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");

  const { data: templates } = useEmailTemplates("welcome");
  const sendEmail = useSendEmail();
  const preview = useEmailPreview();

  // Auto-fill from default welcome template
  useEffect(() => {
    if (!open) return;

    const defaultTemplate = templates?.find((t) => t.isDefault) || templates?.[0];

    setSubject(
      interpolate(
        defaultTemplate?.subject || `Welcome to Amana OSHC — ${enquiry.service.name}`,
        enquiry,
      ),
    );

    if (defaultTemplate?.blocks && Array.isArray(defaultTemplate.blocks)) {
      // We'll show blocks as-is in preview
      setBodyText("");
    } else {
      setBodyText(
        defaultTemplate
          ? ""
          : `Dear ${enquiry.parentName},\n\nThank you for your enquiry about ${enquiry.service.name}. We'd love to welcome your family to our centre.\n\nPlease don't hesitate to reach out if you have any questions.\n\nWarm regards,\nAmana OSHC Team`,
      );
    }
  }, [open, templates, enquiry]);

  // Live preview
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      const defaultTemplate = templates?.find((t) => t.isDefault) || templates?.[0];
      const vars = buildVariables(enquiry);

      if (defaultTemplate?.id) {
        preview.mutate({ templateId: defaultTemplate.id, variables: vars });
      } else if (bodyText) {
        preview.mutate({
          blocks: [
            { type: "heading", level: "h2", text: `Welcome to ${enquiry.service.name}` },
            { type: "text", content: bodyText },
          ],
          variables: vars,
        });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [open, bodyText, templates, enquiry]);

  useEffect(() => {
    if (preview.data?.html) setPreviewHtml(preview.data.html);
  }, [preview.data]);

  function handleSend() {
    const defaultTemplate = templates?.find((t) => t.isDefault) || templates?.[0];
    const vars = buildVariables(enquiry);

    sendEmail.mutate(
      {
        subject,
        templateId: defaultTemplate?.id || undefined,
        ...(!defaultTemplate && {
          blocks: [
            { type: "heading", level: "h2", text: `Welcome to ${enquiry.service.name}` },
            { type: "text", content: bodyText },
          ],
        }),
        enquiryId: enquiry.id,
        variables: vars,
      },
      { onSuccess: onClose },
    );
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="flex w-full max-w-4xl flex-col rounded-xl bg-white shadow-xl max-h-[85vh]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Send Welcome Email to {enquiry.parentName}
            </h2>
            <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex min-h-0 flex-1 overflow-hidden">
            {/* Left: Edit */}
            <div className="w-1/2 overflow-y-auto border-r border-gray-200 p-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">To</label>
                <input
                  value={enquiry.parentEmail || ""}
                  disabled
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Subject</label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
              {bodyText !== "" && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Message</label>
                  <textarea
                    value={bodyText}
                    onChange={(e) => setBodyText(e.target.value)}
                    rows={10}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand resize-none"
                  />
                </div>
              )}
              {templates && templates.length > 0 && (
                <p className="text-xs text-gray-500">
                  Using template: {templates.find((t) => t.isDefault)?.name || templates[0]?.name}
                </p>
              )}
            </div>

            {/* Right: Preview */}
            <div className="w-1/2 overflow-y-auto p-4">
              <EmailPreview html={previewHtml} />
            </div>
          </div>

          <div className="flex shrink-0 justify-end gap-3 border-t border-gray-200 px-6 py-4">
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={sendEmail.isPending || !enquiry.parentEmail}
              className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {sendEmail.isPending ? "Sending..." : "Send Email"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Helpers ────────────────────────────────────────────────────

function interpolate(text: string, enquiry: Props["enquiry"]): string {
  return text
    .replace(/\{\{parentName\}\}/g, enquiry.parentName)
    .replace(/\{\{parentFirstName\}\}/g, enquiry.parentName.split(" ")[0])
    .replace(/\{\{serviceName\}\}/g, enquiry.service.name)
    .replace(/\{\{serviceCode\}\}/g, enquiry.service.code)
    .replace(/\{\{centreName\}\}/g, enquiry.service.name);
}

function buildVariables(enquiry: Props["enquiry"]): Record<string, string> {
  return {
    parentName: enquiry.parentName,
    parentFirstName: enquiry.parentName.split(" ")[0],
    serviceName: enquiry.service.name,
    serviceCode: enquiry.service.code,
    centreName: enquiry.service.name,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/enquiries/SendWelcomeEmailModal.tsx
git commit -m "feat: add SendWelcomeEmailModal component for enquiry welcome emails"
```

---

### Task 12: Email History Section + Enquiry Detail Panel Integration

**Files:**
- Create: `src/components/enquiries/EmailHistorySection.tsx`
- Modify: `src/components/enquiries/EnquiryDetailPanel.tsx`

- [ ] **Step 1: Create email history section**

Create `src/components/enquiries/EmailHistorySection.tsx`:

```typescript
"use client";

import { Mail, RefreshCw } from "lucide-react";
import { useEmailHistory, useSendEmail } from "@/hooks/useEmailTemplates";
import { toast } from "@/components/ui/Toast";

interface Props {
  enquiryId: string;
  parentEmail?: string | null;
  parentName?: string;
}

export function EmailHistorySection({ enquiryId, parentEmail, parentName }: Props) {
  const { data: emails, isLoading } = useEmailHistory("ParentEnquiry", enquiryId);
  const resend = useSendEmail();

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
        <div className="h-10 w-full animate-pulse rounded bg-gray-200" />
      </div>
    );
  }

  if (!emails || emails.length === 0) {
    return (
      <div className="text-sm text-gray-500">
        No emails sent yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {emails.map((email) => (
        <div
          key={email.id}
          className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"
        >
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-gray-400" />
            <div>
              <p className="text-sm font-medium text-gray-900">
                {email.subject || "No subject"}
              </p>
              <p className="text-xs text-gray-500">
                {new Date(email.createdAt).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                email.status === "sent"
                  ? "bg-green-100 text-green-700"
                  : email.status === "scheduled"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {email.status}
            </span>
            {parentEmail && (
              <button
                onClick={() => {
                  if (!window.confirm("Resend this email?")) return;
                  resend.mutate({
                    subject: email.subject || "Welcome to Amana OSHC",
                    enquiryId,
                    templateId: undefined,
                    htmlContent: undefined,
                    variables: {
                      parentName: parentName || "",
                      parentFirstName: parentName?.split(" ")[0] || "",
                    },
                  });
                }}
                disabled={resend.isPending}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-brand"
                title="Resend"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Integrate into EnquiryDetailPanel**

In `src/components/enquiries/EnquiryDetailPanel.tsx`:

Add imports:
```typescript
import { SendWelcomeEmailModal } from "./SendWelcomeEmailModal";
import { EmailHistorySection } from "./EmailHistorySection";
```

Add state:
```typescript
const [showWelcomeEmail, setShowWelcomeEmail] = useState(false);
```

Add after the existing quick actions section (look for buttons like "Send Info Pack", "Log Phone Call"):

```tsx
{/* Send Welcome Email button */}
<button
  onClick={() => setShowWelcomeEmail(true)}
  disabled={!enquiry.parentEmail}
  title={
    !enquiry.parentEmail
      ? "No email address on this enquiry"
      : enquiry.lastEmailSentAt
      ? `Welcome email already sent on ${new Date(enquiry.lastEmailSentAt).toLocaleDateString("en-AU")}`
      : undefined
  }
  className="flex items-center gap-2 rounded-lg border border-brand px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
>
  <Mail className="h-4 w-4" />
  {enquiry.lastEmailSentAt ? "Resend Welcome Email" : "Send Welcome Email"}
</button>
```

Add after the touchpoint timeline section:

```tsx
{/* Email History */}
<div className="mt-6 border-t border-gray-200 pt-4">
  <h4 className="mb-2 text-sm font-semibold text-gray-900">Emails</h4>
  <EmailHistorySection enquiryId={enquiry.id} parentEmail={enquiry.parentEmail} parentName={enquiry.parentName} />
</div>
```

Add at the bottom of the component (before the closing fragment/div):

```tsx
{showWelcomeEmail && enquiry.parentEmail && (
  <SendWelcomeEmailModal
    open={showWelcomeEmail}
    onClose={() => setShowWelcomeEmail(false)}
    enquiry={{
      id: enquiry.id,
      parentName: enquiry.parentName,
      parentEmail: enquiry.parentEmail,
      service: enquiry.service,
    }}
  />
)}
```

Add `Mail` to the lucide-react import.

- [ ] **Step 3: Verify build**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/components/enquiries/EmailHistorySection.tsx src/components/enquiries/EnquiryDetailPanel.tsx
git commit -m "feat: add email history section and welcome email button to enquiry detail panel"
```

---

## Chunk 6: Final Verification

### Task 13: Full Build Verification + Fix Marketing Post Modal Bug

**Files:**
- Modify: `src/components/marketing/CreatePostModal.tsx` (fix the submit bug — the form structure has the submit button outside the `<form>` tag due to the closing `</div>` on line 373 ending the scrollable area before the footer)

- [ ] **Step 1: Fix CreatePostModal form structure**

The current CreatePostModal has the submit buttons inside the `<form>` tag but the form content `</div>` closes early on line 373. Check that the `<form>` tag wraps both the content area and the footer buttons. The current structure looks correct (form opens at line 156, buttons at 376-391, form closes at 392). However, the modal itself at line 139 uses `flex items-center justify-center` which might cause the modal to be centered but cut off.

**Check**: The modal wrapper is `fixed inset-0` with `max-h-[90vh]` which should be fine. The issue might be that the form `onSubmit` event needs `e.preventDefault()` which it already has.

**Investigate the actual bug**: Look at the `useCreatePost` hook in `useMarketing.ts` to ensure the mutation function is correct. Check if the POST `/api/marketing/posts` route has validation issues that would silently fail.

- [ ] **Step 2: Run full build**

Run: `npm run build`
Expected: No TypeScript errors, all pages compile

- [ ] **Step 3: Manual checklist**

Verify these work:
- [ ] `/marketing` — Posts tab shows "+ New Email" and "Import Template" buttons
- [ ] `/marketing/email/compose` — Full email composer loads with block editor + preview
- [ ] Template picker modal opens and lists templates
- [ ] Import template modal saves imported HTML template
- [ ] Enquiry detail panel shows "Send Welcome Email" button (disabled if no email)
- [ ] Enquiry detail panel shows "Emails" section at bottom

- [ ] **Step 4: Final commit if any fixes**

```bash
git add -A
git commit -m "fix: final polish and bug fixes for email integration"
```

- [ ] **Step 5: Push to main**

```bash
git push origin main
```
