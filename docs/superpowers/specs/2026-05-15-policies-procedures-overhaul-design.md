# Policies & Procedures Overhaul

**Date**: 2026-05-15
**Status**: Approved (3 design questions confirmed by Jayden)
**Predecessor spec**: `2026-04-22-documents-policies-compliance-design.md` (deferred document versioning)

## Overview

Replace the URL-based `Policy` model with a fully versioned, file-backed Policies & Procedures library. Staff acknowledge per-version: when a new version is uploaded, prior acknowledgements no longer count, so everyone is automatically pending re-ack.

## Confirmed decisions (from brainstorming)

1. **New dedicated tables** (not extending existing `Policy` or `Document`). Existing `Policy` / `PolicyAcknowledgement` URL-based models are replaced.
2. **Company-wide scope** — no `centreId` / `serviceId` on the new tables. Every document is visible to every staff member.
3. **Drop the existing 3-tab `/policies` layout** (policies/compliance/heat-map). The spec's "View Acknowledgements" per-document panel covers the compliance use case. Heat-map deferred.
4. **10MB max PDF size** — matches existing `saveBase64File` helper.

## Schema

New enum + 3 models (company-wide; no centre scope):

```prisma
enum PolicyDocumentCategory {
  policy
  procedure
  other
}

model PolicyDocument {
  id               String                  @id @default(cuid())
  title            String                  @unique
  description      String?                 @db.Text
  category         PolicyDocumentCategory  @default(policy)
  currentVersionId String?                 @unique
  currentVersion   PolicyDocumentVersion?  @relation("Current", fields: [currentVersionId], references: [id], onDelete: SetNull)
  versions         PolicyDocumentVersion[] @relation("Versions")
  isArchived       Boolean                 @default(false)
  createdAt        DateTime                @default(now())
  updatedAt        DateTime                @updatedAt
  @@index([category])
  @@index([isArchived])
}

model PolicyDocumentVersion {
  id              String   @id @default(cuid())
  documentId      String
  document        PolicyDocument @relation("Versions", fields: [documentId], references: [id], onDelete: Cascade)
  versionNumber   Int
  fileUrl         String   // Vercel Blob URL — server-side only, never sent to client
  fileName        String
  fileSize        Int
  uploadedById    String?
  uploadedBy      User?    @relation("PolicyDocVersionUploader", fields: [uploadedById], references: [id], onDelete: SetNull)
  uploadedAt      DateTime @default(now())
  acknowledgements PolicyDocumentAcknowledgement[]
  currentOf       PolicyDocument? @relation("Current")
  @@unique([documentId, versionNumber])
  @@index([documentId])
}

model PolicyDocumentAcknowledgement {
  id             String   @id @default(cuid())
  versionId      String
  version        PolicyDocumentVersion @relation(fields: [versionId], references: [id], onDelete: Cascade)
  userId         String
  user           User     @relation("PolicyDocAcknowledger", fields: [userId], references: [id], onDelete: Cascade)
  acknowledgedAt DateTime @default(now())
  @@unique([versionId, userId])
  @@index([versionId])
  @@index([userId])
}
```

Old `Policy`, `PolicyAcknowledgement`, `PolicyStatus`, `User.policyAcks` are removed. No data migration — existing URL-based policies are not portable to file-backed (no PDFs to move). Migration logs a count of dropped rows for transparency.

## File storage

- Vercel Blob (existing). Add `"policies"` to `UploadType` in `src/app/api/_lib/upload.ts`.
- Refactor `saveBase64File` so its validation logic is reusable from a buffer (multipart) path. New helper: `saveUploadedFile(buffer, filename, mimeType, type, opts)` validating size, extension, MIME, and magic bytes.
- Policy uploads accept ONLY `application/pdf` (route-level guard).
- Blob URL is stored in `PolicyDocumentVersion.fileUrl` and **never exposed to the client**. All PDF serving goes through an authenticated proxy.

## API routes (under `/api/policies/*`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/policies` | List non-archived documents with current version info + my-ack status |
| POST | `/api/policies` | Create document + initial version (multipart: title, description, category, file) |
| GET | `/api/policies/[id]` | Single document with full version history |
| PATCH | `/api/policies/[id]` | Update title/description/category |
| PATCH | `/api/policies/[id]/archive` | Soft-delete (`isArchived = true`) |
| POST | `/api/policies/[id]/versions` | Upload new version (multipart: file). Auto-bumps `versionNumber`, updates `currentVersionId`. No ack rows for new version → everyone is pending. |
| GET | `/api/policies/[id]/acknowledgements` | All acks across all versions + summary "X of Y on current vN" |
| GET | `/api/policies/[id]/file` | Authenticated PDF proxy — fetches blob server-side, streams as `application/pdf` |
| POST | `/api/policies/[id]/acknowledge` | Record ack for current version by current user (upsert-guard against duplicate) |
| GET | `/api/policies/my-pending` | Staff: documents where I haven't acked the current version |
| GET | `/api/policies/my-pending/count` | Just `{ count: number }` — for nav badge |

All authenticated via `withApiAuth`. Admin endpoints gated to roles `[owner, head_office, admin]`. Acknowledge endpoint accessible to all authenticated non-marketing roles. PDF proxy accessible to all authenticated roles (including marketing) — read-only.

Old routes removed: `/api/policies/compliance`, `/api/policies/heat-map`, `/api/policies/seed`.

## Frontend

**Admin** (`/policies` page, when `isAdminRole`):
- List view: title, category, current version (`v3`), date last updated, action buttons (Upload New Version, Edit Details, Archive, View Acknowledgements)
- "Add New Document" button → modal with PDF upload
- "Upload New Version" → modal with PDF upload + success toast "All staff will be required to re-acknowledge"
- "View Acknowledgements" → modal with table (staff name | version | date) + summary line

**Staff** (`/policies` page, non-admin):
- List view: title, category, current version, "Acknowledged" / "Acknowledgement Required" badge. Unacknowledged sort to top.
- Click → full-screen modal: PDF rendered via `<iframe src="/api/policies/[id]/file">` + Acknowledge button (disabled for first 5s with countdown)
- On ack: optimistic update to "Acknowledged" badge + toast
- Nav badge: red dot/count on "Policies & Procedures" item when `my-pending/count > 0`

**Nav rename**: `src/lib/nav-config.ts` label "Policies" → "Policies & Procedures". NavItem grows an optional `badgeCount?: () => number` resolver for the pending badge.

**Role gates**: marketing keeps access (per existing `ALL_NON_MARKETING`); marketing can view & ack but cannot manage.

## Tests

- Vitest unit: upload validators (size, MIME, magic bytes), pending-pick logic, route handlers (auth, validation, happy path, archive, version bump, ack uniqueness, dup-ack rejection).
- Integration not required for v1; happy-path covered by unit + manual smoke test.

## Out of scope (defer)

- Cron emails on new version uploaded
- Bulk re-ack reminders
- Per-service scoping
- PDF previews on cards
- OCR / full-text search
- Heat-map view (was in old `/policies`, will return as a follow-up if needed)

## Rollback

Migration drops old `Policy`/`PolicyAcknowledgement` — these were URL-based and not file-portable. To roll back, revert the migration; old empty tables come back; no data preserved either way.
