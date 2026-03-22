# PageHeader + BottomSheet — Design Spec

**Date:** 2026-03-22
**Status:** Approved
**Goal:** Single biggest UX improvement — subtract clutter, enforce consistency, add soul

## Problem

Every page has an ad-hoc header with inconsistent structure. The Todos page has 15 controls above the fold. On mobile, toolbar buttons wrap into 2-3 rows consuming 40% of viewport. Hover-dependent controls (delete, select) are invisible on touch devices.

## Solution

Two new primitives (`BottomSheet`, `PageHeader`) applied to all 6 core pages in one pass.

---

## Component 1: `BottomSheet`

**File:** `src/components/ui/BottomSheet.tsx`

Reusable slide-up panel for mobile action menus, filters, confirmations.

### Props
```ts
interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}
```

### Behavior
- Fixed overlay with `bg-black/40` backdrop, click-to-dismiss
- Content slides up from bottom with `transition-transform duration-300`
- Drag handle at top (centered gray pill, 40px × 4px)
- `pb-[env(safe-area-inset-bottom)]` for notched devices
- `z-50`, `rounded-t-2xl`, `max-h-[70vh]`, scrollable content
- Renders via portal to avoid stacking context issues

### Sub-component: `BottomSheetItem`
```ts
interface BottomSheetItemProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  active?: boolean;      // Shows checkmark when toggled on
  destructive?: boolean; // Red text for delete actions
}
```
- 48px min-height, full-width tap target
- Icon left, label center, optional checkmark right
- Hover/active state: `bg-surface`

---

## Component 2: `PageHeader`

**File:** `src/components/layout/PageHeader.tsx`

Standardized page header replacing all ad-hoc header divs.

### Props
```ts
interface PageHeaderAction {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  variant?: "primary" | "secondary" | "destructive";
  loading?: boolean;
  hidden?: boolean;
}

interface PageHeaderToggle {
  options: Array<{ icon: LucideIcon; label: string; value: string }>;
  value: string;
  onChange: (value: string) => void;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  badge?: string;                    // e.g. "Q1 2026"
  helpTooltipId?: string;
  helpTooltipContent?: string;
  primaryAction?: PageHeaderAction;
  secondaryActions?: PageHeaderAction[];
  toggles?: PageHeaderToggle[];
  children?: React.ReactNode;        // Slot for custom inline content
}
```

### Desktop Layout (md+)
```
┌──────────────────────────────────────────────────────────┐
│  Title [badge] [?]          [toggles] [secondary] [+CTA] │
│  description                                              │
└──────────────────────────────────────────────────────────┘
```
- Title: `text-xl font-semibold text-foreground font-heading`
- Description: `text-sm text-muted mt-0.5`
- Badge: `px-2.5 py-0.5 rounded-full text-xs font-semibold bg-accent/20 text-brand border border-accent/30`
- Secondary actions: Rendered as `Button variant="secondary" size="sm"`
- Primary action: `Button variant="primary" size="sm"` with icon
- Toggles: Segmented control (`bg-surface rounded-lg p-0.5`)

### Mobile Layout (<md)
```
┌──────────────────────┐
│  Title        [+] [...] │  <- Row 1: title + primary + overflow
│  description            │
│  [toggle group]         │  <- Row 2: view toggles (if any)
└──────────────────────┘
```
- `[...]` = `MoreHorizontal` icon button, opens BottomSheet
- Secondary actions move into the BottomSheet
- Toggles stay visible (they're small, always needed)
- Primary action stays visible (it's THE action)

### Animation
- Entrance: `animate-fade-in` (0.3s ease-out)
- No transform (respects the modal positioning fix)

---

## Migration Plan

### Page 1: Todos (`src/app/(dashboard)/todos/page.tsx`)

**Before:** 15 controls (3 view toggles, archive, filter, export, bulk, templates, add, all/weekly, week selector, filter presets, select-all, stats)

**After:**
- **Always visible:** Title, description, view toggles, "Add To-Do" primary button
- **Mobile overflow (BottomSheet):** Export CSV, Bulk Create, Templates, Show Completed toggle, Filters toggle
- **Below header (unchanged):** All/Weekly toggle, WeekSelector, filter row, filter presets, stats bar, quick-add input

**What moves:** 5 buttons collapse into overflow on mobile. Desktop shows them inline.

### Page 2: Services (`src/app/(dashboard)/services/page.tsx`)

**Before:** Search, sort dropdown, bulk select, create service button + stat cards

**After:**
- **Always visible:** Title, search (inline), "Add Service" primary button
- **Mobile overflow:** Sort, bulk select/actions

### Page 3: Enquiries (`src/app/(dashboard)/enquiries/page.tsx`)

**Before:** Title, service filter, export, "New Enquiry" button

**After:**
- **Always visible:** Title, service filter, "New Enquiry" primary button
- **Mobile overflow:** Export CSV

### Pages 4-6: Rocks, Issues, Scorecard

Apply same pattern — primary CTA visible, secondary actions in overflow on mobile.

---

## Files Changed

| File | Change Type |
|------|------------|
| `src/components/ui/BottomSheet.tsx` | NEW |
| `src/components/layout/PageHeader.tsx` | NEW |
| `src/app/(dashboard)/todos/page.tsx` | MODIFY — replace header div with PageHeader |
| `src/app/(dashboard)/services/page.tsx` | MODIFY — replace header div with PageHeader |
| `src/app/(dashboard)/enquiries/page.tsx` | MODIFY — replace header div with PageHeader |
| `src/app/(dashboard)/rocks/page.tsx` | MODIFY — replace header div with PageHeader |
| `src/app/(dashboard)/issues/page.tsx` | MODIFY — replace header div with PageHeader |
| `src/app/(dashboard)/scorecard/page.tsx` | MODIFY — replace header div with PageHeader |

## What This Does NOT Touch

- No API changes
- No data flow changes
- No hook changes
- No logic changes
- All existing functionality preserved — just reorganized visually
- Desktop users see the same buttons, just better organized
- Mobile users get dramatically less clutter
