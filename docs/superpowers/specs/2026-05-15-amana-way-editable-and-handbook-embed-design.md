# Amana Way editable + Handbook embed — design

**Date**: 2026-05-15
**Branch**: claude/hungry-fermat-2d812f
**Author**: Jayden (with Claude)

## Problem

Two requests, shipped together:

1. **Make the Amana Way panel editable from the dashboard UI.** Today
   `src/components/shared/AmanaWayPanel.jsx` is 851 lines of hardcoded JSX —
   every string, image and item array is baked into the React source. The
   only way to fix a typo or swap a logo is to push a code change. Owner and
   admin should be able to enter an Edit mode on the page itself, change
   content inline, Save / Cancel, and have changes persist. Lower-tier roles
   (member, staff, marketing) keep the exact current read-only experience.

2. **Embed the Amana Educators Handbook.** A vendor-supplied
   `AmanaHandbookPanel.jsx` (1216 lines, data-driven via a `SECTIONS` array
   + block renderer) needs to drop in next to The Amana Way as a separate
   sidebar entry called **Handbook** at `/tools/handbook`. The Handbook's
   `ClubsBlock` currently renders emoji placeholders for the 8 club names —
   we have real branded SVGs at `/public/amana-assets/club-*.svg` (all 8)
   that should replace them at ~40×40.

## Non-goals (v1)

- **Adding new sections or items.** Editing existing content only. Arrays
  keep their length; admins can rewrite cells but not add a 6th value to
  IHSAN. Out of scope on purpose — adding inline list-row controls roughly
  doubles the work and isn't in the spec.
- **Full rich-text formatting.** ContentEditable gives plain text only.
  Bold / italic / link inserts can come later.
- **Handbook editability v1.** The handbook also gets the wrapper system,
  but the priority is Amana Way per the spec.
- **Revision history / undo across saves.** Save replaces overrides. The
  worst case is "use git history of `AmanaContent` row in Prisma Studio".

## Architecture

### Content-override layer (NOT a data-driven refactor)

The AmanaWayPanel's JSX stays as the source of truth for layout and
default content. We add a thin override layer:

```
Render time:
  hardcoded default text  ──┐
                            ▼
  <E k="way.hero.title">  ──► reads override from context
                            │   if override exists: render override
                            └── else: render hardcoded default

Edit time:
  same wrapper             ──► renders a contentEditable span with
                               value = current draft (override or default)
                               onBlur: write to draft

Save:
  context.draft  ──► PATCH /api/amana-content/[key]  ──► AmanaContent.data
```

**Why not a data-driven refactor?** Extracting all content into a SECTIONS
array would touch every line of the 851-line file and risks visual
regression. The override layer is additive — non-admin users (and admins
in view mode) get byte-identical output to today, because the wrappers
render the same default values they're given.

### Editable wrappers

Three components, all in `src/components/shared/editable.tsx`:

| Component | For | Default fallback | Edit mode UI |
|-----------|-----|------------------|--------------|
| `<E k="...">default text</E>` | strings | children | `contentEditable` span with dotted outline |
| `<EImg k="..." default="/path" alt="..." style={...} />` | images | `default` prop | `<img>` + hover overlay with "Upload" button |
| `<EArrText k="..." default={[...]} render={(items) => ...} />` | arrays of strings | `default` prop | renders each item via passed render-fn; each cell wraps in `<E>` |

Only `<E>` and `<EImg>` are strictly needed for v1 — arrays of strings get
edited cell-by-cell using `<E>` keyed by index (e.g. `way.foundation.values.0.name`).
`<EArrText>` is a convenience wrapper for flat string arrays where item
indexes are stable. For complex arrays (clubs, roles), we just wrap each
cell of each row with `<E>` / `<EImg>` directly — no array-level editor.

### Provider + context

`<AmanaContentProvider contentKey="amana-way">` is mounted by the page.
Responsibilities:

- On mount: `GET /api/amana-content/amana-way` → load overrides into state
- Holds `mode: "view" | "edit"`, `overrides: Record<string, string>`,
  `draft: Record<string, string>` (snapshot when entering edit), `dirty: boolean`
- Exposes `getValue(key, default)`, `setDraft(key, value)`, `enterEdit()`,
  `cancelEdit()`, `save()`
- Renders `<EditBar />` as a floating header bar when `canEdit` is true,
  with Edit / Save / Cancel buttons and a dirty indicator

`canEdit` comes from a `useSession()` check inside the provider: only
visible to roles `owner` and `admin`.

### Database

New Prisma model:

```prisma
model AmanaContent {
  key       String   @id          // "amana-way" or "amana-handbook"
  data      Json                  // { "way.hero.title": "..." , ... }
  updatedAt DateTime @updatedAt
  updatedBy String?               // user id of last editor
}
```

`data` is a flat `Record<string, string>` of override values. Missing
keys fall back to the hardcoded defaults in the wrappers. This means:

- Day-1 deploy: zero rows in the table → both panels render exactly as
  today.
- An admin saves changes → row gets created/updated with just the
  overridden keys. Rendering merges over the defaults.

### API routes

`src/app/api/amana-content/[key]/route.ts`:

```ts
GET    → withApiAuth(handler)                    // any authed user
PATCH  → withApiAuth(handler, { roles: ["owner", "admin"] })
```

`GET` returns `{ data: Record<string, string> }` (empty object if no
row). `PATCH` body: `{ data: Record<string, string> }` — replaces the row
wholesale (simpler than per-key merging; the client already has the
merged state in its draft).

`src/app/api/amana-content/[key]/upload/route.ts`:

```ts
POST → withApiAuth(handler, { roles: ["owner", "admin"] })
```

Accepts `multipart/form-data` with a single `file` field. Validates
content-type (image/png, image/jpeg, image/svg+xml, image/webp) and
size (max 2 MB). Writes to `public/uploads/amana-content/<key>/<sha256>.<ext>`
and returns `{ url: "/uploads/amana-content/<key>/<sha>.<ext>" }`. The
override stores that URL string.

### Nav + page

- New file: `src/app/(dashboard)/tools/handbook/page.tsx` mirroring
  the existing `tools/the-amana-way/page.tsx` (full-bleed container,
  `<AmanaHandbookPanel />` inside `<AmanaContentProvider contentKey="amana-handbook">`).
- `src/lib/nav-config.ts`: insert
  `{ href: "/tools/handbook", label: "Handbook", icon: BookOpen, section: "Admin", tooltip: "Educators handbook" }`
  immediately after the existing `/tools/the-amana-way` entry (same
  section, no role allowlist → visible to all roles that pass
  `canAccessPage`).
- `src/lib/role-permissions.ts`: add `/tools/handbook` to `allPages`
  and to the marketing, member, staff role allowlists (owner /
  head_office / admin inherit via `allPages`).

### Club images for the handbook

Replace emoji in the handbook's `ClubsBlock` items:

| Club | Asset |
|------|-------|
| Rise & Shine Club | `/amana-assets/club-rise-shine.svg` |
| Iqra Circle | `/amana-assets/club-iqra.svg` |
| Little Champions Club | `/amana-assets/club-little-champions.svg` |
| Fuel Up with Amana | `/amana-assets/club-fuel-up.svg` |
| Amana Afternoons | `/amana-assets/club-afternoons.svg` |
| Homework Heroes | `/amana-assets/club-homework.svg` |
| Imagination Station | `/amana-assets/club-imagination.svg` |
| Holiday Quest | `/amana-assets/club-holiday-quest.svg` |

Implementation: switch the items array from `{ name, emoji, desc }` to
`{ name, img, desc }` and have `ClubsBlock` render `<img src={img} alt={name}
style={{ width: 40, height: 40, objectFit: "contain" }} />` when `img`
is set, else fallback to the emoji.

## Edit-mode UX

- Edit bar appears as a top-right floating button cluster inside the
  panel chrome — won't shift content layout.
- View mode: single "Edit content" button (only for owner/admin).
- Edit mode: panel grows a dashed outline; each editable text gets a
  faint dotted underline on hover. Cursor goes I-beam over editable
  strings. Images get a small "Replace" overlay on hover.
- Save: button disabled until any draft value differs from current
  override; spinner during PATCH; toast on success/error.
- Cancel: discards draft, returns to view mode. If draft is dirty, ask
  for confirmation via `window.confirm`.

## Failure modes

| Failure | Behaviour |
|---------|-----------|
| `GET /api/amana-content/amana-way` errors | Render hardcoded defaults; log to console; no edit button shown. |
| `PATCH` errors | Stay in edit mode; toast with error message. |
| Image upload fails | Toast; don't update draft. |
| Non-admin force-navigates with edit query string | `canEdit` is computed from session role; no escalation possible. |
| Race: two admins editing simultaneously | Last-write-wins. Acceptable. |

## Testing

- API route tests for `GET`/`PATCH` of `/api/amana-content/[key]`:
  - 401 unauthenticated
  - 200 anyone authed for GET
  - 403 non-admin for PATCH
  - 200 owner/admin PATCH replaces row
  - 400 malformed body
- Image upload route test:
  - 403 non-admin
  - 400 missing file / wrong MIME / oversize
  - 200 happy path writes file and returns URL
- Manual end-to-end:
  - Log in as admin → Amana Way → Edit → change hero title → Save →
    reload → confirm persisted
  - Log in as staff → Amana Way → no edit button visible
  - Log in as admin → upload logo → see new logo in place
  - Visit /tools/handbook as each role → confirm rendering + nav presence

## Out of scope (follow-ups)

- Make the handbook ALSO editable (same provider, just point at
  `amana-handbook` key). Possible v1 if time allows; otherwise v2.
- Add/remove items in arrays.
- Rich-text formatting in edit mode.
- Version history.
- Image library / asset picker UI.
