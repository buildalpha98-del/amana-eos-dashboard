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
- Desktop grid: remove the "Cap" column header and capacity input cells
- Mobile cards: remove capacity display
- CSV import: remove `{ key: "capacity", label: "Capacity" }` column config
- Remove capacity warning highlighting (red border when enrolled > capacity)
- Remove `capacity` from the grid state and save payload
- Remove the `capacity` prop usage from the component (passed from parent service)

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
| Chart legend label | "Equipment" | "Centre Purchases" |
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

- Add "Groceries" to `CATEGORY_LABELS` map: `groceries: "Groceries"`
- Add "Groceries" to `CATEGORY_COLORS` map: `groceries: "bg-green-100 text-green-700"`
- Add "Groceries" filter pill

**Files:** Zod schema updates required in:
- `src/app/api/services/[id]/budget/equipment/route.ts` — add `"groceries"` to category enum in `createItemSchema`
- `src/app/api/services/[id]/budget/equipment/[itemId]/route.ts` — add `"groceries"` to category enum in `updateItemSchema`

---

## 5. Summary Cards — Budget vs Spend

**File:** `src/components/services/ServiceBudgetTab.tsx`

Replace the current 4 summary cards with:

### Card 1: Grocery Spend (green)
- Current week's grocery cost calculated from attendance x per-head rates
- Label: "Grocery Spend"
- Subtitle: "This week" or "This month" depending on period toggle
- Source: existing `groceryBudget.total` from the budget summary API (scoped to selected period)

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
- Spend: sum of all non-grocery `BudgetItem` amounts for the current month

### Card 3: Total Weekly Spend (purple)
- Sum of grocery spend + centre purchases for the selected week
- Label: "Total Spend"
- Source: current period bucket from API response

### Card 4: Budget Remaining (emerald)
- Monthly allocation minus month-to-date non-grocery purchase spend
- Negative values shown in red
- Label: "Budget Remaining"
- Subtitle: "This month"

**API change:** The budget summary API (`GET /api/services/[id]/budget`) will return two additional fields:
- `monthlyAllocation: number` — the resolved budget for this service
- `monthToDatePurchaseSpend: number` — non-grocery BudgetItem spend for current month

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

  avgWeeklyAttendance = average weekly total attended (BSC + ASC + VC combined)
                        over the last 4 complete weeks
  // Calculated as: sum of all DailyAttendance.attended for the service
  // over the last 28 days, divided by 4

  for tier in orgTiers (sorted by minWeeklyChildren DESC):
    if avgWeeklyAttendance >= tier.minWeeklyChildren:
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

### Approach: Recalculation (not deltas)

After any BudgetItem mutation (create, update, delete), recalculate totals for the affected week(s) rather than using fragile incremental deltas. This handles edge cases like date changes and category changes on updates cleanly.

### On Purchase Create/Update/Delete

**Files:**
- `src/app/api/services/[id]/budget/equipment/route.ts` (POST)
- `src/app/api/services/[id]/budget/equipment/[itemId]/route.ts` (PATCH, DELETE)

After each purchase mutation, call a shared helper:

```typescript
async function recalcFinancialsForWeek(serviceId: string, weekStart: Date) {
  // 1. Aggregate all BudgetItems for this service in this week
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);

  const items = await prisma.budgetItem.findMany({
    where: { serviceId, date: { gte: weekStart, lt: weekEnd } },
  });

  const groceryCost = items
    .filter(i => i.category === "groceries")
    .reduce((sum, i) => sum + i.amount, 0);

  const suppliesCost = items
    .filter(i => i.category !== "groceries")
    .reduce((sum, i) => sum + i.amount, 0);

  // 2. Upsert FinancialPeriod for this week
  await prisma.financialPeriod.upsert({
    where: { serviceId_periodType_periodStart: {
      serviceId, periodType: "weekly", periodStart: weekStart
    }},
    update: { suppliesCosts: suppliesCost },
    create: { serviceId, periodType: "weekly", periodStart: weekStart,
              suppliesCosts: suppliesCost },
  });
}
```

**Important:** All BudgetItem purchases (including groceries category) write to `suppliesCosts` on FinancialPeriod. The `foodCosts` field remains owned by the attendance-to-financials weekly cron (which calculates grocery costs from attendance × per-head rates). This avoids double-counting.

The grocery spend shown on the budget tab's Card 1 is a calculated display value (attendance × rates), not from BudgetItem records. The `groceries` category in BudgetItem is for staff to log actual grocery receipts for tracking/auditing — these flow to `suppliesCosts` alongside other centre purchases.

**Edge cases handled by recalculation:**
- Purchase date changes → recalc both old week and new week
- Category changes → no special handling needed (recalc sums all items)
- Concurrent mutations → recalc produces correct totals regardless of order
- Failed partial updates → wrapped in Prisma transaction

### Existing Fields Used

- `FinancialPeriod.suppliesCosts: Float?` — all BudgetItem purchases (groceries + other)
- `FinancialPeriod.foodCosts: Float?` — remains attendance-calculated only (via weekly cron)

No new fields needed on FinancialPeriod.

---

## Files Affected

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `groceries` to enum, `purchaseBudgetTiers` on OrgSettings, `monthlyPurchaseBudget` on Service |
| `src/components/services/ServiceAttendanceTab.tsx` | Remove capacity column, warnings, CSV config |
| `src/components/services/ServiceBudgetTab.tsx` | Rename labels, add groceries to CATEGORY_LABELS/COLORS, new summary cards with budget vs spend, default weekly, per-service override UI, chart legend update |
| `src/app/api/services/[id]/budget/route.ts` | Return budget allocation + month-to-date spend in summary, tier resolution logic |
| `src/app/api/services/[id]/budget/equipment/route.ts` | Add `groceries` to Zod schema, sync to financials on POST |
| `src/app/api/services/[id]/budget/equipment/[itemId]/route.ts` | Add `groceries` to Zod schema, sync to financials on PATCH/DELETE (recalc old+new weeks on date change) |
| `src/app/(dashboard)/settings/SettingsContent.tsx` | Budget tiers config section |
| `src/app/api/org-settings/route.ts` | Handle `purchaseBudgetTiers` in PATCH, validate tier array structure |
| `src/app/api/services/[id]/route.ts` | Accept `monthlyPurchaseBudget` in PATCH for per-service override |
| `src/hooks/useBudget.ts` | Update `BudgetSummary` interface to include `monthlyAllocation` and `monthToDatePurchaseSpend` |
| `src/lib/budget-helpers.ts` | NEW — shared `recalcFinancialsForWeek()` and `getMonthlyBudget()` helpers |

## Out of Scope

- Grocery cost auto-logging from attendance (stays as calculated cost via weekly cron)
- Historical budget tier changes (retroactive recalculation)
- Approval workflow for over-budget purchases
- Budget alerts/notifications (could be added later)
