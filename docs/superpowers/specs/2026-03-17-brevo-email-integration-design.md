# Brevo Email Integration — Design Spec

**Date**: 2026-03-17
**Status**: Approved (rev 2 — post-review fixes)

## Overview

Integrate Brevo email sending into the Marketing and Enquiries tabs, replacing Zoho Campaigns. Staff can import existing Zoho templates (paste HTML), create new emails with a lightweight block editor, send campaigns to centre contact lists, and send welcome/follow-up emails to enquiry parents — all from within the dashboard.

Brevo acts as the delivery pipe only. The dashboard handles all composing, template management, and recipient resolution. Resend continues to handle system/transactional emails (password resets, notifications, digests).

**Note**: The enquiry model is `ParentEnquiry` in Prisma (not `Enquiry`). All references in this spec use "enquiry" colloquially but map to `ParentEnquiry` in code.

## 1. Email Template System

### EmailTemplate Prisma Model

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
  subject     String                // supports {{placeholders}}
  htmlContent String?               @db.Text  // raw HTML (imported Zoho templates)
  blocks      Json?                 // block-editor JSON (new templates)
  isDefault   Boolean               @default(false)
  createdById String?
  createdBy   User?                 @relation(fields: [createdById], references: [id])
  createdAt   DateTime              @default(now())
  updatedAt   DateTime              @updatedAt
}
```

### Template Storage

- **Imported templates**: `htmlContent` stores the raw HTML from Zoho export. `blocks` is null.
- **Block-editor templates**: `blocks` stores the ordered block array. `htmlContent` is null (rendered on demand from blocks + branded wrapper).
- **Hybrid**: If a user edits an imported template in HTML mode, `htmlContent` is updated directly.

### Template Categories

| Category | Use Case |
|---|---|
| `welcome` | Enquiry follow-up emails |
| `newsletter` | Regular parent updates |
| `event` | Holiday programs, open days |
| `announcement` | Policy changes, closures |
| `custom` | Anything else |

### Import from Zoho

One-time import flow:
1. Staff exports a Zoho campaign template as HTML
2. In dashboard: clicks "Import Template" → pastes HTML into a text area
3. Gives it a name and category
4. Saved as an `EmailTemplate` with `htmlContent` populated

### Duplicate & Edit

- Any template can be cloned via a "Duplicate" action
- Creates a copy with "(Copy)" appended to the name
- Both HTML mode and block mode available for editing

### Block Types

Templates created with the block editor use an ordered array of blocks:

| Type | Fields | Renders As |
|---|---|---|
| `heading` | text, level (h1/h2/h3) | Styled heading in brand font |
| `text` | content (plain text, supports line breaks) | Paragraph |
| `image` | url, alt, linkUrl? | Centred image with optional click-through |
| `button` | label, url, color? | CTA button (defaults to brand colour) |
| `divider` | — | Horizontal rule |
| `spacer` | height (px, default 24) | Empty space |

Block JSON example:
```json
[
  { "type": "heading", "level": "h1", "text": "Welcome to {{serviceName}}" },
  { "type": "text", "content": "Dear {{parentName}},\n\nThank you for your enquiry..." },
  { "type": "image", "url": "https://...", "alt": "Our centre" },
  { "type": "button", "label": "Book a Tour", "url": "https://..." },
  { "type": "divider" },
  { "type": "text", "content": "If you have any questions..." }
]
```

### Block-to-HTML Rendering

A shared utility `renderBlocksToHtml(blocks, variables)` converts the block array into email-safe HTML wrapped in a new `marketingLayout()` wrapper. This utility:
1. Iterates blocks, rendering each to inline-styled HTML (email-safe, no CSS classes)
2. Interpolates `{{placeholder}}` variables
3. Wraps in a new `marketingLayout()` wrapper (parent-facing branding — Amana logo, no "EOS Dashboard" subtitle, no "automated email" footer, includes unsubscribe link)

**Note**: The existing `baseLayout()` in `email-templates.ts` is for internal/system emails and has unsuitable branding for parent-facing marketing emails. A new `marketingLayout()` function will be created in `src/lib/email-marketing-layout.ts` with appropriate parent-facing branding.

### Placeholder Interpolation

Templates support these variables, resolved at send time:

| Placeholder | Source |
|---|---|
| `{{parentName}}` | `${firstName} ${lastName}`.trim() from ParentEnquiry or CentreContact (handles nulls) |
| `{{parentFirstName}}` | firstName from ParentEnquiry or CentreContact |
| `{{serviceName}}` | Service.name |
| `{{serviceCode}}` | Service.code |
| `{{enquiryDate}}` | Enquiry.createdAt formatted |
| `{{centreName}}` | Same as serviceName |
| `{{centreAddress}}` | Service.address |
| `{{centrePhone}}` | Service.phone |

Unresolved placeholders are left as empty strings (not shown to recipients).

## 2. Marketing Tab — Email Campaigns

### Entry Points

1. **"Send as Email" button** on any existing post (in post detail or list action menu)
   - Pre-fills email composer with post title as subject, post content as body text block
   - Staff picks recipients and template wrapper, then sends

2. **"+ New Email" button** on Posts tab (alongside existing "+ New Post")
   - Opens email composer modal/page
   - Can start from a template or blank

### Email Composer UI

Full-page composer (not a modal — needs space for preview):

**Left pane — Editor:**
- Template selector dropdown (optional — pick a saved template to start from)
- Subject line input
- Block editor OR HTML editor (toggle between modes)
  - Block mode: ordered list of blocks with add/remove/reorder (up/down arrows)
  - HTML mode: code editor textarea for imported/advanced templates
- Recipient selector:
  - Multi-select centres (from Service list)
  - "All Centres" option
  - Shows live recipient count: "Will send to X contacts"
- Schedule: "Send Now" or date/time picker

**Right pane — Preview:**
- Rendered HTML preview of the email
- Updates live as blocks/content change
- Desktop width by default, toggle to mobile width (375px)

### Send Flow

1. Staff clicks "Send" or "Schedule"
2. Confirmation dialog: "Send to X recipients across Y centres? This cannot be undone."
3. On confirm:
   - Resolve recipients from `CentreContact` (filtered by selected services, `subscribed: true`)
   - Render final HTML (blocks → HTML or use raw htmlContent)
   - Interpolate placeholders
   - Call Brevo via existing `sendTransactionalEmail()` (< 50 recipients) or `sendCampaignEmail()` (≥ 50)
   - Create `DeliveryLog` entry
   - If triggered from a post, update the post status and link to the delivery log
4. Toast: "Email sent to X recipients" or "Email scheduled for [date]"

### Post Integration

When platform is `email`:
- Post list shows recipient count and delivery status instead of likes/shares/reach
- Post detail shows delivery log info (sent at, recipient count, status)
- New field on `MarketingPost`: `deliveryLogId String?` linking to the `DeliveryLog`

## 3. Enquiries Tab — Welcome Emails

### Entry Point

**"Send Welcome Email" button** on the enquiry detail panel.

### Flow

1. Staff clicks "Send Welcome Email" on an enquiry
2. Modal opens with:
   - Pre-selected default "Welcome" category template
   - Subject pre-filled: "Welcome to Amana OSHC — {{serviceName}}"
   - Body pre-filled with template content, placeholders auto-resolved (parent name, service, etc.)
   - Editable — staff can tweak subject and body before sending
   - Preview pane showing rendered email
3. Staff clicks "Send"
4. Email sent via Brevo `sendTransactionalEmail()` (single recipient)
5. Logged in `DeliveryLog` with `entityType: "ParentEnquiry"` and `entityId: enquiry.id`
6. ParentEnquiry's `lastEmailSentAt` updated
7. Toast: "Welcome email sent to [parentName]"

### Schema Changes

```prisma
// Add to ParentEnquiry model:
lastEmailSentAt  DateTime?

// Add to DeliveryLog model:
entityType   String?    // "ParentEnquiry", "MarketingPost"
entityId     String?
subject      String?
templateId   String?    // link to EmailTemplate used
renderedHtml String?    @db.Text  // snapshot of what was actually sent

@@index([entityType, entityId])
```

```prisma
// Add to MarketingPost model:
deliveryLogId  String?
```

**Validation**: The "Send Welcome Email" button is disabled when `ParentEnquiry.parentEmail` is null (with tooltip "No email address on this enquiry").

### Email History on Enquiry

The enquiry detail panel shows an "Emails" section listing all delivery logs for that enquiry:
- Date sent, subject, status (sent/failed)
- "Resend" button to re-send the same email

### Smart Defaults

- If no "Welcome" template exists, the system uses a hardcoded default welcome email (similar to existing `email-templates.ts` patterns)
- Button is disabled with tooltip "Welcome email already sent on [date]" if `lastEmailSentAt` is set (staff can still resend via the email history section)

## 4. API Routes

### Email Template CRUD

```
GET    /api/email-templates              — list all templates (optional ?category= filter)
POST   /api/email-templates              — create template
GET    /api/email-templates/[id]         — get single template
PATCH  /api/email-templates/[id]         — update template
DELETE /api/email-templates/[id]         — hard delete template (consistent with codebase pattern)
POST   /api/email-templates/[id]/duplicate — clone template
```

Auth: `requireAuth(["owner", "head_office", "admin"])`

### Email Send (Dashboard)

```
POST   /api/email/send                   — send email from dashboard
```

Body:
```json
{
  "templateId": "optional — if using saved template",
  "subject": "Email subject",
  "htmlContent": "optional — raw HTML override",
  "blocks": "optional — block array to render",
  "serviceIds": ["service-1", "service-2"],
  "allCentres": false,
  "scheduledAt": "optional ISO 8601",
  "enquiryId": "optional — if sending from enquiry",
  "postId": "optional — if sending from marketing post",
  "variables": { "parentName": "John", "serviceName": "..." }
}
```

This route:
1. Resolves template (from templateId or inline content)
2. Renders blocks to HTML if needed
3. Interpolates variables
4. Resolves recipients (from serviceIds or enquiryId)
5. Calls Brevo (transactional or campaign based on count)
6. Creates DeliveryLog
7. Updates enquiry.lastEmailSentAt or post.deliveryLogId if applicable

Auth: `requireAuth(["owner", "head_office", "admin"])`

### Email Preview

```
POST   /api/email/preview                — render template with sample data
```

Returns rendered HTML for the preview pane. Uses sample/placeholder data so staff can see what the email looks like before sending.

## 5. UI Components

### New Components

| Component | Location | Purpose |
|---|---|---|
| `EmailBlockEditor` | `src/components/email/EmailBlockEditor.tsx` | Block editor with add/remove/reorder |
| `EmailHtmlEditor` | `src/components/email/EmailHtmlEditor.tsx` | Raw HTML textarea editor |
| `EmailPreview` | `src/components/email/EmailPreview.tsx` | Rendered HTML preview iframe |
| `EmailComposer` | `src/components/email/EmailComposer.tsx` | Full composer (editor + preview + recipients + send) |
| `TemplatePickerModal` | `src/components/email/TemplatePickerModal.tsx` | Template selection grid |
| `ImportTemplateModal` | `src/components/email/ImportTemplateModal.tsx` | Paste HTML import flow |
| `SendWelcomeEmailModal` | `src/components/enquiries/SendWelcomeEmailModal.tsx` | Enquiry welcome email modal |
| `EmailHistorySection` | `src/components/enquiries/EmailHistorySection.tsx` | Email log on enquiry detail |

### Marketing Tab Changes

- Posts tab: Add "+ New Email" button alongside "+ New Post"
- Post list: Show delivery status for email-platform posts
- Post detail/actions: Add "Send as Email" action
- New route: `/marketing/email/compose` for the full-page composer

### Enquiries Tab Changes

- Enquiry detail panel: Add "Send Welcome Email" button
- Enquiry detail panel: Add "Emails" history section

## 6. Existing Infrastructure Used

| Component | How Used |
|---|---|
| `src/lib/brevo.ts` | `sendTransactionalEmail()` and `sendCampaignEmail()` — unchanged |
| `src/lib/email-marketing-layout.ts` | New `marketingLayout()` wrapper for parent-facing emails |
| `DeliveryLog` model | Tracks all sends |
| `CentreContact` model | Recipient source |
| `ActivityLog` model | Audit trail |
| `isBrevoConfigured()` | Gate — show "Brevo not configured" if API key missing |

## 7. Permissions

| Action | Roles |
|---|---|
| Manage templates (CRUD) | owner, head_office, admin |
| Send marketing emails | owner, head_office, admin |
| Send enquiry welcome emails | owner, head_office, admin, coordinator |
| View email history | All authenticated users |

## 8. Registration & Safety

### New Page Registration

The `/marketing/email/compose` route must be added to:
1. `nav-config.ts` (under Engagement > Marketing)
2. `TopBar.tsx` pageTitles
3. `role-permissions.ts` allPages + rolePageAccess

### Double-Send Protection

The `POST /api/email/send` endpoint includes:
- Confirmation dialog on the frontend ("Send to X recipients? This cannot be undone.")
- Server-side check: if `postId` is provided and already has a `deliveryLogId`, return 409 Conflict
- For enquiry welcome emails: warn (not block) if `lastEmailSentAt` is already set

### Scheduling

- Scheduled sends use Brevo's native scheduling (`scheduledAt` param)
- `DeliveryLog.status` set to `"scheduled"` with the scheduled datetime
- No cancellation support in v1 (out of scope)
- All datetimes are in UTC; the frontend converts from the user's local timezone

## 9. Out of Scope (for now)

- Drag-and-drop block reordering (using up/down arrows instead)
- Rich text editing within blocks (plain text + line breaks only)
- Email analytics (open rates, click rates) — future Brevo webhook integration
- Automated email sequences/drip campaigns
- Contact list management UI (contacts managed via staff sync)
- Unsubscribe handling (managed by Brevo's built-in unsubscribe)
