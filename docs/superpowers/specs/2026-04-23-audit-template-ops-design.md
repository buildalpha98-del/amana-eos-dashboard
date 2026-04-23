# Audit Template Ops — Apply / Edit / Add Items

**Date**: 2026-04-23
**Status**: Approved (brainstorming complete — 2026-04-23 session)
**Area**: Compliance & Audit

## Problem

The Compliance & Audit tab has three blockers for manually managing audit templates:

1. **No way to apply a template to selected services.** Today, `Upload Calendar` auto-generates instances for *all active services* (all-or-nothing). `Add Audit` creates instances one-at-a-time (template × 1 service × 1 month). There is no middle path to take an existing template and push it to a chosen subset of services for a year. For 10 services × 12 audits this is 120 clicks.

2. **No way to edit template metadata.** Once a calendar is uploaded, the parsed template is frozen — name, NQS reference, quality area, frequency, `scheduledMonths`, and response format cannot be edited from the UI. Only individual checklist items inside the template can be edited / reordered / deleted.

3. **No way to add questions manually.** The only way to add checklist items to a template is to upload a `.docx`. If the user wants to append their own question, they must edit a Word doc and re-upload.

All three are frontend-scoped plus one new API route. The data model already supports everything needed.

## Overview

Three tightly-coupled features, all on `/compliance/templates`:

1. **Apply to Services** — per-template action that bulk-generates `AuditInstance` records for user-selected services + year + months. Template stays reusable (can be applied again later).
2. **Edit Template** — per-template action to change metadata (name, QA, frequency, scheduled months, response format, etc.). When `scheduledMonths` changes and instances exist, user is asked whether to respread future instances or leave them alone.
3. **Add Item manually** — inline "+ Add item" form on the expanded template detail, next to "Upload Items".

Permission: all three restricted to `owner | head_office | admin` (matches existing pattern).

## Baseline

- Current tests: 700/700 passing, 46 test files
- Data model is complete — no schema changes needed
- `AuditTemplate` model already has all needed fields (`name`, `qualityArea`, `nqsReference`, `frequency`, `scheduledMonths`, `responseFormat`, `estimatedMinutes`, `isActive`, `sortOrder`)
- `AuditInstance` has `@@unique([templateId, serviceId, scheduledMonth, scheduledYear])` — safe for duplicate-prevention on bulk apply
- `PATCH /api/audits/templates/[id]` already exists with full field support
- `POST /api/audits/templates/[id]/items` already exists and accepts a `items[]` array (N≥1) — can be reused for single-item add

## In scope — stacked commits

| # | Commit subject | Category | Files (approx.) |
|---|---|---|---|
| 1 | `feat(api): POST /api/audits/templates/[id]/apply — bulk generate instances for selected services` | API | 2 (route + test) |
| 2 | `feat(templates): EditTemplateModal + respread-instances prompt on scheduledMonths change` | Feature | ~4 |
| 3 | `feat(templates): ApplyToServicesModal — bulk assign template to N services × year` | Feature | ~3 |
| 4 | `feat(templates): inline "Add item" form on TemplateDetail` | Feature | 2 |
| 5 | `test(audits): cover new apply route + respread flag on PATCH` | Tests | 1 |

~5 commits. No changes to calendar import, audit instances UI, audit results tab, or any cowork route.

## Key design decisions

### New API: `POST /api/audits/templates/[id]/apply`

**Request body (Zod-validated):**
```ts
{
  serviceIds: string[];        // non-empty, cuid-validated
  year: number;                // 2024..2030
  months?: number[];           // optional override; 1..12, non-empty if provided
}
```

**Response:**
```ts
{
  created: number;
  skipped: number;     // existing instances that hit the @@unique
  total: number;       // created + skipped
  serviceIds: string[]; // echo for client-side invalidation
}
```

**Behaviour:**
- If `months` omitted → use `template.scheduledMonths`
- For each (service × month) pair:
  - Check `AuditInstance` uniqueness; skip if exists
  - Create `AuditInstance` with `status: "scheduled"`, `dueDate = last day of month`, `totalItems = template.items.length`
  - Bulk-seed `AuditItemResponse` records with `result: "not_answered"` (same pattern as calendar import, lines 216–232)
- Wrap the per-month loop in a single `prisma.$transaction` per service so partial failures don't leave orphaned instances
- Past-month skipping: **do not apply** the "skip months before current month" rule that the calendar import uses — on manual apply, user may legitimately want to backfill. Document this clearly.
- Write `ActivityLog` entry: `action: "apply"`, `entityType: "AuditTemplate"`, `entityId: [id]`, `details: { serviceCount, year, months, created, skipped }`

**Roles:** `["owner", "head_office", "admin"]` via `withApiAuth`.

**Rate limit:** default 60 req/min per user per endpoint (matches wrapper default).

### Respread flag on `PATCH /api/audits/templates/[id]`

Extend existing PATCH body schema with one optional field:

```ts
respreadFutureInstances?: boolean  // default false
```

When `true` AND `scheduledMonths` present in the body AND the template has existing instances:
- Scope: only instances with `dueDate >= today` (future only — past audits preserved)
- For each future instance:
  - If instance's current `scheduledMonth` is in the new `scheduledMonths` array → leave alone
  - Otherwise → delete the instance (cascade removes its `AuditItemResponse` rows)
- Then re-generate instances in the new months for the same service/year (reusing apply logic, but only for services that had an instance before)

**Why delete-and-recreate not update:** if a user was part-way through a January instance and we move it to March, keeping partial responses is confusing. Delete-and-recreate gives a fresh scheduled instance. In-progress and completed instances are never touched (filter on `status: "scheduled"` only).

Response extended with:
```ts
{
  ...templateFields,
  respread?: { deleted: number; recreated: number; }
}
```

### Frontend — template row layout

Current: single ⬆️ upload button on the right of the row.

New: `[edit] [apply] [upload]` cluster, still on the right. Icons with `title` tooltips:
- `Pencil` — Edit template
- `CalendarPlus` — Apply to services
- `Upload` — Upload checklist items (existing)

3 icons fit within existing row spacing. No overflow menu needed at current sizes.

### Frontend — `ApplyToServicesModal`

**State:**
```ts
{
  serviceIds: string[];           // selected
  year: number;                   // defaults to current year
  overrideMonths: boolean;        // default false
  months: number[];               // only used when overrideMonths true
}
```

**UI sections:**
1. Header: template name + template's `scheduledMonths` shown as read-only chips
2. Service multi-select: checkbox list of active services (from `/api/services?limit=100`), with "Select all active" / "Clear" buttons; shows count (`3 of 10 selected`)
3. Year: prev/current/next picker (same control as calendar upload modal)
4. Months override:
   - Toggle: "Use custom months"
   - When off: muted helper text "Will use template's scheduled months: Jan, Jul"
   - When on: 12-month checkbox grid pre-filled with `scheduledMonths`
5. Preview strip: `Will create up to {services × months} instances. Existing instances will be skipped.`
6. Footer: Cancel + "Apply to {N} services"

**Submit:** calls `useApplyTemplateToServices` → toast `Created {created} instance(s), skipped {skipped} duplicate(s)` → invalidate `audit-instances` query (all variants) + close modal.

**Validation:** submit disabled when `serviceIds.length === 0` or (overrideMonths && months.length === 0).

### Frontend — `EditTemplateModal`

**Fields (all editable):**
- `name` (text, required)
- `nqsReference` (text)
- `qualityArea` (select 1–7)
- `frequency` (select: monthly / half_yearly / yearly)
- `responseFormat` (select: yes_no / rating_1_5 / compliant / reverse_yes_no / review_date / inventory)
- `estimatedMinutes` (number, optional)
- `scheduledMonths` (12-month checkbox grid)
- `isActive` (toggle)

**Respread flow:** if `scheduledMonths` changed from initial value AND `template._count.instances > 0`:
- Show secondary confirm dialog **before** submitting PATCH:
  - Title: "Respread existing audits?"
  - Body: "This template has {N} existing audits. Should future audits be moved to the new months, or left on their current months? Past and in-progress audits are always left alone."
  - Actions: `Leave alone` (primary, default) → PATCH with `respreadFutureInstances: false` | `Respread future` → PATCH with `respreadFutureInstances: true` | `Cancel` → abort
- If `scheduledMonths` did not change → skip dialog, submit directly

**Submit:** `useUpdateTemplate` (existing hook, extend to pass `respreadFutureInstances` through) → toast with summary (including respread counts when present) → close modal.

### Frontend — `AddItemInlineForm` in `TemplateDetail`

New `+ Add item` button in the TemplateDetail header, next to `Upload Items`.

Clicking expands an inline form at the top of the items list (not a modal):

```
Section (optional)      [_______________]
Question *              [_______________]
Guidance (optional)     [_______________]
Response format         [Use template default ▾]   [Save] [Cancel]
```

- Auto-focus `question` on open
- `responseFormat` defaults to "Use template default" (stores `null`, which renders as template's fallback)
- Save → calls existing `POST /api/audits/templates/[id]/items` with `items: [one]` → invalidate detail → collapse form + clear fields
- Cancel / Escape → collapse without saving
- `Ctrl+Enter` → save

New hook: `useAddTemplateItem` (wraps the existing POST, clearer name than reusing `useImportAuditItems`).

### Hooks (new)

```ts
// src/hooks/useAudits.ts
export function useApplyTemplateToServices() { /* POST /apply, invalidates audit-instances */ }
export function useAddTemplateItem()         { /* POST /items with single-item body, invalidates audit-template-detail */ }
```

`useUpdateTemplate` extended to accept optional `respreadFutureInstances` — no signature break since it already takes `[key: string]: unknown`.

All three mutations follow the house style: `onError` toast with `destructive` variant, `onSuccess` invalidates affected queries.

## Edge cases

- **Apply: zero services selected** → client disables submit; server rejects with 400 (defence-in-depth).
- **Apply: template has zero items** → still create instances (`totalItems: 0`), no response rows seeded. Audit is essentially an empty shell — user can add items via #3 after and the next apply will include them. Non-blocking.
- **Apply: months array contains invalid values (0, 13, -1)** → Zod `z.array(z.number().int().min(1).max(12)).min(1)` rejects with 400.
- **Apply: service does not exist / is inactive** → Prisma FK fails; treat as skip + surface in response. Alternatively, filter `serviceIds` against `status: "active"` before the loop and return a `unknownServices` field. Decision: filter upfront + return `unknownServiceIds: string[]` in response for UX clarity.
- **Edit template: delete all `scheduledMonths`** → Zod accepts empty array, but UI warns "Template will have no scheduled months — future uploads of this calendar won't auto-generate instances." Allow it (matches existing schema flexibility).
- **Edit template: rename to a name that already exists** → unique constraint on `AuditTemplate.name` throws P2002. Catch at route level → 409 Conflict with `{ error: "A template with this name already exists." }`.
- **Respread: instance in `in_progress` or `completed` status** → filter `status: "scheduled"` only. Past dates already imply non-future but status filter is the reliable signal.
- **Add item: duplicate question within template** → no unique constraint, allow. Users may legitimately repeat questions across sections.
- **Concurrent apply + edit** → no explicit locking; if user edits `scheduledMonths` while another tab is applying, the apply uses whatever `scheduledMonths` were in memory when the modal opened. Acceptable — neither op is destructive to existing data beyond the documented respread.

## Out of scope

- **Bulk apply multiple templates at once** — the brainstorm considered a "bulk assign" view (N templates × N services). Deferred — the per-template apply covers 90% of the use case and we can add bulk later if the single-template flow proves tedious in production.
- **Calendar-upload services selector** — not touching the calendar import modal. Its existing "generate for all active services" behaviour stays as-is.
- **Template archive / soft-delete** — `isActive: false` already exists and is editable via the new modal. No full delete flow added.
- **Dragging items between sections** — existing drag-reorder stays within one list; cross-section drag is not changed.

## Testing

**Vitest (new):**
- `src/__tests__/api/audit-template-apply.test.ts`
  - 401 unauthenticated
  - 403 non-admin role
  - 400 empty `serviceIds`
  - 400 invalid month values
  - 200 happy path: creates N×M instances + seeds responses
  - 200 skip duplicates: re-running returns non-zero `skipped`
  - 200 unknown service filtered out, returned in `unknownServiceIds`
  - ActivityLog row written

- Extend `src/__tests__/api/audits.test.ts` with PATCH respread cases:
  - `respreadFutureInstances: false` → existing instances untouched
  - `respreadFutureInstances: true` + month change → future scheduled instances deleted + recreated
  - `respreadFutureInstances: true` but no month change → no-op
  - In-progress / completed instances never touched regardless of flag
  - Response includes `respread: { deleted, recreated }`

**Manual QA on preview:**
- Apply to 2 services with default months → verify calendar tab shows new entries in correct months
- Apply again same config → verify toast shows `skipped` count matching service×month product
- Edit a template's `scheduledMonths` with existing instances → verify respread prompt appears
- Choose "Leave alone" → verify no instances changed
- Choose "Respread" → verify future instances moved; past instances untouched
- Add an item manually → verify it appears at the bottom of the list with correct sort order
- Upload `.docx` to a template that has manually-added items → verify "Append" mode preserves them

## Risk and rollout

- **Risk level**: low. No schema changes, existing model supports everything, permission gates match existing pattern.
- **Blast radius**: limited to `/compliance/templates` page + one new API route. Audit Calendar + Results tabs consume `AuditInstance` via existing query hooks — new instances appear automatically.
- **Rollback**: revert the stack; no data migration to undo. The new route is additive. PATCH respread flag is optional and default-false.
- **Feature flag**: not needed — all changes hide behind admin role.
