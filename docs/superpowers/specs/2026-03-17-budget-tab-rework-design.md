# Budget Tab Rework + Financials Feed

**Date:** 2026-03-17
**Status:** Approved

## Problem

The budget tab in services has several UX issues and missing functionality:
- Attendance tab shows a capacity column that isn't needed
- Budget defaults to monthly view; staff think in weeks
- "Equipment" terminology is misleading — centres buy groceries, cleaning supplies, and other items too
- Total equipment spend is conflated with the equipment budget allocation
- Purchase data doesn't flow into the financials page
- No configurable budget allocation system for centre purchases

## Changes Overview

1. Remove capacity column from attendance tab
2. Default budget view to weekly
3. Rename "Equipment" to "Centre Purchases" throughout
4. Add `groceries` category to `BudgetItemCategory` enum
5. Separate budget allocation from actual spend in summary cards
6. Configurable tiered budget allocation (org-wide + per-service override)
7. Real-time financials feed when purchases are created/updated/deleted

---

## 1. Attendance Tab — Remove Capacity

**File:** `src/components/services/ServiceAttendanceTab.tsx`

Remove all capacity-related UI:
- Desktop grid: remove the "Cap" column header and capacity cells
- Mobile cards: remove capacity display
- CSV import: remove `{ key: "capacity", label: "Capacity" }` column config
- Remove capacity warning highlighting (red border when enrolled > capacity)
- Remove `capacity` from the grid state and save payload

The `capacity` field stays in the DB and on `DailyAttendance` model — it's used by anomaly detection and other systems. We only remove it from the attendance UI.

---

## 2. Default Weekly View

**File:** `src/components/services/ServiceBudgetTab.tsx`

Change the initial state of the period toggle from `"monthly"` to `"weekly"`. The toggle remains so users can switch to monthly if needed.

---

## 3. Renaming

**File:** `src/components/services/ServiceBudgetTab.tsx`

| Location | Current | New |
|----------|---------|-----|
| Section heading | "Equipment Purchases" | "Centre Purchases" |
| Add button | "+Add Equipment" | "+Add Purchase" |
| Empty state text | "No equipment purchases" | "No purchases" |
| Form modal title | "Add Equipment" / "Edit Equipment" | "Add Purchase" / "Edit Purchase" |
| Delete confirmation | "Delete this equipment item?" | "Delete this purchase?" |
| Any other "equipment" references | "equipment" | "purchase" |

API routes and DB model (`BudgetItem`) keep their names — renaming is UI-only.

---

## 4. Add Groceries Category

**File:** `prisma/schema.prisma`

Add `groceries` to the `BudgetItemCategory` enum:

```prisma
enum BudgetItemCategory {
  groceries    // NEW
  kitchen
  sports
  art_craft
  furniture
  technology
  cleaning
  safety
  other
}
```

**File:** `src/components/services/ServiceBudgetTab.tsx`

Add "Groceries" filter pill with green colour badge (`bg-green-100 text-green-700`).

---

## 5. Summary Cards — Budget vs Spend

**File:** `src/components/services/ServiceBudgetTab.tsx`

Replace the current 4 summary cards with:

### Card 1: Grocery Spend (green)
- Current week's grocery cost calculated from attendance x per-head rates
- Label: "Grocery Spend"
- Subtitle: "This week" or "This month" depending on period toggle

### Card 2: Centre Purchase Budget (blue → amber → red)
- Shows: `$spent / $allocated`
- Progress bar underneath: percentage of monthly allocation used
- Colour logic:
  - Blue: <80% used
  - Amber: 80-100% used
  - Red: >100% (over budget)
- Allocation from configurable tiers (Section 6)
- Label: "Purchase Budget"
- Subtitle: shows the tier (e.g. "100+ children — $300/mo")

### Card 3: Total Weekly Spend (purple)
- Sum of grocery spend + centre purchases for the current week
- Label: "Total Spend"

### Card 4: Budget Remaining (emerald)
- Monthly allocation minus month-to-date centre purchase spend
- Negative values shown in red
- Label: "Budget Remaining"
- Subtitle: "This month"

---

## 6. Configurable Budget Tiers

### Data Model

**OrgSettings** — add `purchaseBudgetTiers` JSON field:

```prisma
// On existing OrgSettings model
purchaseBudgetTiers  Json?  // Array of { minWeeklyChildren: number, monthlyBudget: number }
```

Default value (seeded):
```json
[
  { "minWeeklyChildren": 100, "monthlyBudget": 300 },
  { "minWeeklyChildren": 0, "monthlyBudget": 150 }
]
```

Tiers are sorted descending by `minWeeklyChildren`. The first matching tier wins.

**Service** — add optional override:

```prisma
// On existing Service model
monthlyPurchaseBudget  Float?  // If set, overrides org-wide tier
```

### Tier Resolution Logic

```
function getMonthlyBudget(service, orgTiers):
  if service.monthlyPurchaseBudget is set:
    return service.monthlyPurchaseBudget  // per-service override

  weeklyAttendance = sum of last 4 weeks average attendance for this service
  for tier in orgTiers (sorted by minWeeklyChildren DESC):
    if weeklyAttendance >= tier.minWeeklyChildren:
      return tier.monthlyBudget

  return orgTiers[last].monthlyBudget  // fallback to lowest tier
```

### Settings UI

**File:** `src/app/(dashboard)/settings/SettingsContent.tsx`

New section visible to owner/head_office: "Centre Purchase Budget Tiers"

- Table with columns: Min Weekly Children | Monthly Budget ($) | Actions
- Add Tier / Edit / Delete buttons
- Saved via `PATCH /api/org-settings`
- Shown between API Keys and AI Usage sections

### Per-Service Override

**File:** `src/components/services/ServiceBudgetTab.tsx`

Small "Override budget" link next to the Purchase Budget card (admin/owner only). Opens inline input to set a custom monthly budget for this specific service. Shows "(override)" label when active, with option to clear and revert to tier-based.

Saved via `PATCH /api/services/[id]` with `monthlyPurchaseBudget` field.

---

## 7. Real-time Financials Feed

### On Purchase Create/Update/Delete

**Files:**
- `src/app/api/services/[id]/budget/equipment/route.ts` (POST)
- `src/app/api/services/[id]/budget/equipment/[itemId]/route.ts` (PATCH, DELETE)

After each purchase mutation, call a shared helper:

```typescript
async function syncPurchaseToFinancials(
  serviceId: string,
  purchaseDate: Date,
  amount: number,          // positive for create/update, negative for delete
  category: BudgetItemCategory,
  previousAmount?: number  // for updates: the old amount to subtract
)
```

Logic:
1. Determine the week start for `purchaseDate`
2. Upsert `FinancialPeriod` where `serviceId + periodType:"weekly" + periodStart:weekStart`
3. If category is `groceries`: increment `foodCosts` by delta
4. If category is anything else: increment `suppliesCosts` by delta
5. Recalculate `totalCosts` and `grossProfit` on the period

For updates: delta = newAmount - previousAmount
For deletes: delta = -amount

### Existing Fields Used

The `FinancialPeriod` model already has:
- `foodCosts: Float?` — maps to grocery purchases
- `suppliesCosts: Float?` — maps to all other centre purchases

No new fields needed.

---

## Files Affected

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `groceries` to enum, `purchaseBudgetTiers` on OrgSettings, `monthlyPurchaseBudget` on Service |
| `src/components/services/ServiceAttendanceTab.tsx` | Remove capacity column, warnings, CSV config |
| `src/components/services/ServiceBudgetTab.tsx` | Rename labels, add groceries category, new summary cards with budget vs spend, default weekly, per-service override UI |
| `src/app/api/services/[id]/budget/route.ts` | Return budget allocation in summary, tier resolution |
| `src/app/api/services/[id]/budget/equipment/route.ts` | Sync to financials on POST |
| `src/app/api/services/[id]/budget/equipment/[itemId]/route.ts` | Sync to financials on PATCH/DELETE |
| `src/app/(dashboard)/settings/SettingsContent.tsx` | Budget tiers config section |
| `src/app/api/org-settings/route.ts` | Handle `purchaseBudgetTiers` in PATCH |
| `src/hooks/useBudget.ts` | No changes needed (existing hooks work) |

## Out of Scope

- Grocery purchases auto-logging from attendance (stays as calculated cost)
- Historical budget tier changes (retroactive recalculation)
- Approval workflow for over-budget purchases
- Budget alerts/notifications (could be added later)
