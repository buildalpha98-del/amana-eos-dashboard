# Contract Templates — Design Spec

**Date:** 2026-05-04
**Author:** Jayden + Claude (brainstorming session)
**Status:** Approved for planning
**Tracking:** Replaces / extends the existing `/contracts` page with a template library (Employment Hero–style) plus a "issue from template" flow that ties back into the existing per-staff `EmploymentContract` system.

## Problem

The current `/contracts` page tracks **issued** employment contracts — one row per staff member, with pay rate, hours, dates, and an optional uploaded PDF (`documentUrl`). There is no way to author or reuse contract templates inside the dashboard. Today, contracts are written in Word / Employment Hero, exported to PDF, and uploaded manually for each new hire.

Jayden wants the contracts tab to also work as a **template library**: view, edit, and create reusable contract templates with merge tags (e.g. `{{staff.firstName}}`, `{{contract.startDate}}`), and issue them to specific staff members in a few clicks.

The existing per-staff issued-contract tracker must keep working — it is read by the new roster wage-cost projection chip (PR #55) and by the staff portal's "my contracts" view.

## Goals (v1)

- Author, edit, clone, disable, and view employment-contract templates inside the dashboard.
- Insert merge-tag chips into a rich-text editor; the chips resolve to live data when a contract is issued.
- Allow templates to declare **manual fields** (e.g. probation period, custom clauses, fixed-term end date) that the issuer fills in at issue time.
- Issue a template to a specific staff member: render → PDF → store → create `EmploymentContract` row → email the staff member.
- Existing acknowledgement flow (`acknowledgedByStaff`, `acknowledgedAt` on `EmploymentContract`) is reused unchanged.
- Templates CRUD restricted to admin + owner (matches existing `/contracts` access).

## Non-goals (v1, explicit)

- E-signatures (signature pad, signed-PDF stamping, signing audit trail) — Phase 2.
- Template versioning. Issued contracts are frozen via the stored PDF + `templateValues` snapshot, so editing a template never retroactively affects anything already issued; that makes versioning unnecessary in v1.
- Template categories beyond "Employment Contracts". Factsheets, policies, onboarding letters etc. live in other dashboard sections.
- Bulk-issue (issue same template to multiple staff at once).
- Template import from Word / PDF / HTML.
- Public template gallery / "starter templates" shipped with the product.

## Architecture overview

```
┌─────────────────────────────┐
│  /contracts (Tabs)          │
│  ┌─────────┐  ┌──────────┐  │
│  │ Issued  │  │ Templates│  │   ◄── existing + new tabs
│  └─────────┘  └──────────┘  │
└─────────────────────────────┘
        │                │
        │                ▼
        │        /contracts/templates/[id]
        │        ┌──────────────────────┐
        │        │  TipTap editor       │
        │        │  + Merge-tag panel   │
        │        │  + Manual-fields     │
        │        │    config            │
        │        └──────────────────────┘
        │                │
        ▼                ▼  (POST issue-from-template)
┌──────────────────────────────────────┐
│  /api/contracts/issue-from-template  │
│  1. Resolve auto tags from DB        │
│  2. Render HTML (contract-renderer)  │
│  3. Render PDF (Sparticuz Chromium)  │
│  4. Upload to Document storage       │
│  5. Create EmploymentContract row    │
│  6. Email staff (Resend)             │
│  7. ActivityLog entry                │
└──────────────────────────────────────┘
```

The user touches templates in two places only:
1. **Templates list** (`/contracts?tab=templates`) — table of all templates with row actions.
2. **Template editor** (`/contracts/templates/[id]`) — full-page authoring view.

The issue flow is a single modal off the existing **Issued** tab — the user picks "from template" instead of "blank", picks a template + staff member, fills any manual fields, previews the rendered HTML, and issues.

## Data model

### New table — `ContractTemplate`

```prisma
enum ContractTemplateStatus {
  active
  disabled
}

model ContractTemplate {
  id              String                  @id @default(cuid())
  name            String
  description     String?                 @db.Text
  contentJson     Json                    // TipTap document tree, source of truth
  manualFields    Json                    // ManualField[] — see below
  status          ContractTemplateStatus  @default(active)
  createdById     String
  createdBy       User                    @relation("TemplateCreator", fields: [createdById], references: [id])
  updatedById     String?
  updatedBy       User?                   @relation("TemplateUpdater", fields: [updatedById], references: [id])
  issuedContracts EmploymentContract[]    @relation("ContractFromTemplate")
  createdAt       DateTime                @default(now())
  updatedAt       DateTime                @updatedAt

  @@index([status])
  @@index([name])
}
```

**`manualFields` JSON shape** (validated by Zod on every write):

```ts
type ManualField = {
  key: string;            // e.g. "probationPeriod" — used as merge-tag identifier
  label: string;          // e.g. "Probation period"
  type: "text" | "longtext" | "date" | "number";
  required: boolean;
  default?: string;       // string-encoded; coerced at render time per `type`
};
```

### Two columns added to `EmploymentContract`

```prisma
templateId      String?
template        ContractTemplate?  @relation("ContractFromTemplate", fields: [templateId], references: [id], onDelete: SetNull)
templateValues  Json?              // snapshot of resolved values at issue time
```

`templateValues` stores **both** the auto-resolved tag dictionary and the manual-field values used to render the PDF. The rendered PDF is the legal snapshot; `templateValues` is the structured audit trail and lets us regenerate a contract from the same inputs if ever needed.

### Soft delete

Templates are never hard-deleted. Once a `ContractTemplate` has issued any `EmploymentContract`, the only destructive action is `status = "disabled"` — disabled templates are hidden from the issue-flow picker but remain visible in the Templates list (filtered) and remain queryable via the FK on issued contracts.

If a template has zero issued contracts, the UI may offer hard-delete. Server-side guard: `DELETE` returns 409 if any `EmploymentContract.templateId` still references it.

## Page + editor UX

### `/contracts` — two-tab page

`?tab=` URL param (defaults to `issued`).

- **Issued** (default) — existing per-staff contracts table. Untouched.
- **Templates** — new template library:

| Name | Last edited | Updated by | Status | Actions |
|---|---|---|---|---|
| Director of Service - PT Permanent | 23/01/2026 | Akram | Active | View · Edit · Clone · Disable |

Filter bar: search-by-name input + status dropdown (active / disabled / all). "New Template" primary action in the page header (admin only).

### Template editor — `/contracts/templates/[id]`

Full-page route. Three columns on desktop; stacked on mobile.

**Header bar:**
- Inline-editable template name
- Status pill (active / disabled) + toggle
- "Preview" button → opens preview modal rendered against sample data
- "Save" button (autosaves every 5s + on blur; Save button shows dirty state)

**Main column — TipTap editor:**
Toolbar buttons: paragraph / heading 1-3, bold, italic, underline, strikethrough, ordered list, bullet list, blockquote, table, alignment, link, page-break marker. Minimum viable formatting set; can grow later.

**Right column — Merge Tags panel** (collapsible):
A categorized list of merge tags. Click a tag → inserts a TipTap node ("merge-tag chip") at the cursor. The chip renders as a styled blue pill in the editor (matches the Employment Hero look) and stores `{ type: "mergeTag", attrs: { key: "staff.firstName" } }` in the doc JSON.

Catalog (v1):

| Group | Tag key | Source |
|---|---|---|
| Staff | `staff.firstName`, `staff.lastName`, `staff.fullName`, `staff.email`, `staff.phone`, `staff.address`, `staff.city`, `staff.state`, `staff.postcode` | `User` record |
| Service | `service.name`, `service.address`, `service.entityName` | `Service` record (via `User.serviceId`) |
| Contract | `contract.startDate`, `contract.endDate`, `contract.payRate`, `contract.hoursPerWeek`, `contract.position`, `contract.contractType`, `contract.awardLevel` | values entered on the issue form |
| Manager | `manager.firstName`, `manager.lastName`, `manager.fullName`, `manager.title` | currently the assigned State Manager / Director of Service of the staff member's service; falls back to "Director" if unresolved |
| System | `today`, `letterDate` | `new Date()` at issue time |
| Manual | (per-template, declared in Manual Fields panel) | issue form |

Tags whose source resolves to `null` are flagged red in the editor preview and block issue (see Issue flow).

**Bottom column — Manual Fields panel:**
Repeatable form rows: `key`, `label`, type dropdown (text / longtext / date / number), `required` toggle, `default` value. Each declared field appears under "Manual" in the merge-tag panel above so the author can drop it into the doc.

## Issue flow

Entry point: existing **"New Contract"** button on the Issued tab opens a modal with a tab-style toggle at the top:

1. **From template** (new, default if any active templates exist)
2. **Blank** (existing NewContractModal flow, unchanged)

### From-template steps

A single multi-step modal (existing modal styling, no full page navigation):

**Step 1 — Template + staff:**
- Template dropdown (active templates only)
- Staff member dropdown (existing user list, same as current modal)

**Step 2 — Auto-resolve review (read-only):**
- Server returns the resolved auto-tag dictionary for the chosen staff + template
- UI shows each tag with its resolved value, e.g. `staff.firstName = "Sarah"`, `service.name = "Bonnyrigg OSHC"`
- Any tag the template uses that resolves to `null` (e.g. staff has no address) shows a red flag with a "Fix on staff profile →" deep link
- Issue button is disabled until all referenced auto tags resolve

**Step 3 — Manual fields:**
- Form rendered from the template's `manualFields` config
- Skipped entirely if the template has no manual fields
- Standard validation: required, type coercion

**Step 4 — Standard contract metadata:**
- Same fields the existing `NewContractModal` asks for: contract type, award level, pay rate, hours per week, start date, end date
- These are stored on `EmploymentContract` (existing columns) and also exposed as `contract.*` merge tags
- Where a manual-field key collides with a contract-meta key (e.g. both define `endDate`), the contract-meta value wins and the manual field is hidden

**Step 5 — Preview + confirm:**
- Right-side panel shows a rendered HTML preview (the same HTML that will be PDF-rendered)
- Primary action: **"Issue & Email"**
- Secondary: "Back" to revise

### Server-side issue handler

`POST /api/contracts/issue-from-template`:

1. `withApiAuth({ feature: "contracts.create" })`
2. Zod-validate body: `{ templateId, userId, contractMeta: { contractType, awardLevel, awardLevelCustom?, payRate, hoursPerWeek?, startDate, endDate? }, manualValues: Record<string, string> }`
3. Load template (fail if `disabled`)
4. Call `resolveTemplateData({ userId, contractMeta })` → returns auto-tag dict; throws on null required fields
5. Call `renderTemplateHtml({ contentJson, autoData, manualValues })` → returns HTML + CSS string
6. Call `renderContractPdf(html)` → returns PDF Buffer
7. Upload PDF to Document storage at `contracts/issued/{cuid}.pdf`; receive `Document` record
8. Create `EmploymentContract` row in a transaction:
   - `status: "active"`, `templateId`, `templateValues: { auto, manual }`, `documentId`, `documentUrl`, plus all `contractMeta` fields
9. Enqueue email via Resend (new template `contractIssuedEmail` in `email-templates.ts`) with PDF link to the staff member's portal
10. `ActivityLog` entry: `action: "issue_from_template"`, `entityType: "EmploymentContract"`, `entityId: <newId>`, `details: { templateId, templateName }`
11. Return the new contract row

### Existing acknowledge flow

Untouched. Staff opens `/parent/...` (or staff portal — existing) → sees the contract → clicks "I acknowledge" → `acknowledgedByStaff` and `acknowledgedAt` set on the same `EmploymentContract` row.

## PDF rendering pipeline

### `src/lib/contract-renderer.ts` (pure, server-only)

```ts
export type ResolvedTemplateData = {
  auto: Record<string, string>;       // e.g. { "staff.firstName": "Sarah", ... }
  manual: Record<string, string>;     // e.g. { "probationPeriod": "6 months" }
};

export function resolveTemplateData(args: {
  userId: string;
  contractMeta: ContractMetaInput;
}): Promise<ResolvedTemplateData["auto"]>;

export function renderTemplateHtml(args: {
  contentJson: TipTapDoc;
  data: ResolvedTemplateData;
}): { html: string; usedTags: string[]; missingRequiredTags: string[] };
```

`renderTemplateHtml` walks the TipTap doc tree, replaces `mergeTag` nodes with the resolved value (or `<span class="missing">{{key}}</span>` if not in `data`), and returns a single self-contained HTML string with inline `<style>`. Escapes all data values to prevent HTML injection from user input. Pure / sync / fully unit-testable.

### `src/lib/pdf/render-contract.ts` (server-only)

```ts
export async function renderContractPdf(html: string): Promise<Buffer>;
```

- `puppeteer-core` + `@sparticuz/chromium` (the maintained fork that works on Vercel/AWS Lambda; the older `chrome-aws-lambda` is unmaintained)
- Browser singleton kept warm across invocations within a Lambda: `globalThis.__contractBrowser`
- `page.setContent(html, { waitUntil: "networkidle0" })` then `page.pdf({ format: "A4", margin: "20mm", displayHeaderFooter: true, headerTemplate: <Amana logo>, footerTemplate: <page numbers> })`
- Returns the PDF buffer; caller uploads to storage

### Storage

Reuses the existing `Document` table and storage backing (whatever `documentUrl` already points to). Filename pattern: `contracts/issued/{cuid}.pdf`. Sets `Document.uploadedById` to the issuing user.

### Vercel config

The `/api/contracts/issue-from-template` route gets `export const maxDuration = 30` (seconds). Cold start of Sparticuz Chromium is ~3s; rendering a 30-page PDF is ~2s; 30s gives comfortable margin for the largest realistic contract. All other routes stay on the default.

## API surface

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/contract-templates` | admin/owner | List templates (filter `status`, `search`) |
| POST | `/api/contract-templates` | admin/owner | Create template |
| GET | `/api/contract-templates/[id]` | admin/owner | Fetch one (full content) |
| PATCH | `/api/contract-templates/[id]` | admin/owner | Partial update — `name`, `description`, `contentJson`, `manualFields`, `status` |
| DELETE | `/api/contract-templates/[id]` | admin/owner | Hard-delete; 409 if any issued contract references it |
| POST | `/api/contract-templates/[id]/clone` | admin/owner | Duplicate template (returns new id) |
| POST | `/api/contract-templates/[id]/preview` | admin/owner | Render preview HTML against sample data; no PDF, no DB write |
| POST | `/api/contracts/issue-from-template` | admin/owner | Full issue flow described above |

All routes wrapped in `withApiAuth({ feature: "contracts.manage" })` (or `contracts.create` for the issue route — matches existing `POST /api/contracts`). Zod validation on every write. `parseJsonBody(req)` for safe parsing.

## Permissions

- **Templates CRUD:** admin + owner only. `head_office` ("State Manager") explicitly excluded — same model as the existing contracts page guard.
- **Issue from template:** admin + owner only.
- **Staff portal:** unchanged — staff sees their issued contracts (the rendered PDF + acknowledge button); never sees template content.

## Activity logging

Every meaningful action logs to `ActivityLog`:

| Action | entityType | Trigger |
|---|---|---|
| `create` | `ContractTemplate` | `POST /api/contract-templates` |
| `update` | `ContractTemplate` | `PATCH /api/contract-templates/[id]` (logs which fields changed) |
| `clone` | `ContractTemplate` | `POST /api/contract-templates/[id]/clone` (details: `sourceId`) |
| `disable` / `enable` | `ContractTemplate` | status flip on PATCH |
| `delete` | `ContractTemplate` | hard delete |
| `issue_from_template` | `EmploymentContract` | issue route (details: `templateId`, `templateName`) |

## Testing

### Unit tests
- `contract-renderer.test.ts` — pure HTML renderer:
  - Auto-tag resolution (each catalog group)
  - Manual-tag resolution
  - Missing required tag → returns `missingRequiredTags`
  - HTML escaping of user input (e.g. staff name with `<script>`)
  - TipTap node walker handles nested marks, lists, tables
- `manual-fields.test.ts` — Zod schema for `manualFields` config; rejects bad shapes

### Route tests (Vitest)
- `contract-templates.test.ts` — auth (401), validation (400), happy path, role rejection (403), DELETE-with-references (409)
- `contract-templates-clone.test.ts` — round-trip clone produces independent record
- `contract-templates-preview.test.ts` — preview returns HTML, no DB writes, no PDF generation
- `issue-from-template.test.ts` — happy path (with mocked Puppeteer + storage), template-disabled (400), missing required auto tag (400), creates `EmploymentContract` + `ActivityLog` + email queued (mocked Resend), all in transaction

### Integration / E2E
- One Playwright e2e: admin issues a contract from a seeded template → staff sees it in portal → acknowledges → contract row reflects ack.  Mocks the PDF renderer (returns dummy buffer) — the goal is to test the data flow, not Chromium itself.

### What we deliberately do not test
- Sparticuz Chromium internals — that's the library's job. Smoke-test via a dev script that the binary boots on Vercel preview.
- TipTap editor internals.
- Resend delivery — mocked.

## Migration

- Single Prisma migration: adds `ContractTemplate` table, `ContractTemplateStatus` enum, two columns on `EmploymentContract` (`templateId`, `templateValues`).
- No data backfill required. Existing issued contracts get `templateId = null`, `templateValues = null` — they continue to display normally (the Templates column on the existing list will say "—" for those rows).

## Rollout

- Single PR — schema + API + UI + tests together (matches recent feature-shipping pattern, e.g. roster v1 PRs).
- No feature flag — feature is admin-only, low blast radius, and Jayden is the primary admin who can validate end-to-end before announcing.
- After merge: seed one or two real templates from existing Word contracts to verify the editor + render flow before announcing internally.

## Open questions / followups (Phase 2 candidates)

- E-signatures (signature pad + signed PDF stamping + audit trail).
- Template versioning (only if Jayden ever wants "regenerate all active contracts from new template version" — currently out of scope).
- Bulk-issue (same template to multiple staff at once).
- Template import from .docx via `mammoth` or similar.
- Move "Factsheets" / "Policies" / "Onboarding letters" out of their current dashboard sections into this template engine if Jayden wants a single doc-templating system later.
