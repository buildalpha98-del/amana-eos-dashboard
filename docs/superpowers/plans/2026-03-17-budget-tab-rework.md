# Budget Tab Rework Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the services budget tab to support groceries + centre purchases with configurable tiered budgets and real-time financials feed.

**Architecture:** Split budget into two categories (groceries = attendance-calculated, centre purchases = fixed allocation with configurable tiers). All BudgetItem mutations sync to FinancialPeriod.suppliesCosts via recalculation. Tier config lives on OrgSettings JSON, with per-service overrides on Service.monthlyPurchaseBudget.

**Tech Stack:** Next.js 16, Prisma 5.22, PostgreSQL, React Query, Tailwind CSS, Zod validation.

**Spec:** `docs/superpowers/specs/2026-03-17-budget-tab-rework-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `prisma/schema.prisma` | Modify | Add `groceries` to enum, `purchaseBudgetTiers` on OrgSettings, `monthlyPurchaseBudget` on Service |
| `src/lib/budget-helpers.ts` | Create | Shared `recalcFinancialsForWeek()` and `getMonthlyBudget()` helpers |
| `src/components/services/ServiceAttendanceTab.tsx` | Modify | Remove all capacity UI |
| `src/components/services/ServiceBudgetTab.tsx` | Modify | Rename, groceries category, new summary cards, default weekly, override UI |
| `src/app/api/services/[id]/budget/route.ts` | Modify | Return budget allocation + tier info in summary |
| `src/app/api/services/[id]/budget/equipment/route.ts` | Modify | Add groceries to Zod, call recalcFinancialsForWeek on POST |
| `src/app/api/services/[id]/budget/equipment/[itemId]/route.ts` | Modify | Add groceries to Zod, call recalcFinancialsForWeek on PATCH/DELETE |
| `src/hooks/useBudget.ts` | Modify | Update BudgetSummary interface for new API fields |
| `src/app/api/org-settings/route.ts` | Modify | Accept purchaseBudgetTiers in PATCH |
| `src/app/api/services/[id]/route.ts` | Modify | Accept monthlyPurchaseBudget in PATCH |
| `src/app/(dashboard)/settings/SettingsContent.tsx` | Modify | Add Budget Tiers config section |

---

## Chunk 1: Schema + Shared Helpers

### Task 1: Update Prisma Schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add `groceries` to BudgetItemCategory enum**

In `prisma/schema.prisma`, find the `BudgetItemCategory` enum (around line 122) and add `groceries` as the first value:

```prisma
enum BudgetItemCategory {
  groceries
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

- [ ] **Step 2: Add `purchaseBudgetTiers` to OrgSettings model**

Find the `OrgSettings` model (around line 1896) and add:

```prisma
  purchaseBudgetTiers  Json?  // Array of { minWeeklyChildren: number, monthlyBudget: number }
```

Add it after the `accentColor` field.

- [ ] **Step 3: Add `monthlyPurchaseBudget` to Service model**

Find the `Service` model (around line 1226), after the grocery rate fields (`vcGroceryRate`, around line 1249), add:

```prisma
  monthlyPurchaseBudget  Float?  // If set, overrides org-wide tier for centre purchase budget
```

- [ ] **Step 4: Generate Prisma client and push schema**

```bash
npx prisma generate
npx prisma db push
```

Expected: "Your database is now in sync with your Prisma schema"

- [ ] **Step 5: Push schema to Railway production**

```bash
export DATABASE_URL=$(grep "^DATABASE_URL" .env.local | cut -d'"' -f2) && npx prisma db push
```

Expected: "Your database is now in sync"

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma
git commit -m "schema: add groceries category, purchaseBudgetTiers, monthlyPurchaseBudget"
```

---

### Task 2: Create Shared Budget Helpers

**Files:**
- Create: `src/lib/budget-helpers.ts`

- [ ] **Step 1: Create the budget helpers file**

Create `src/lib/budget-helpers.ts` with two exported functions:

```typescript
import { prisma } from "@/lib/prisma";
import type { BudgetItemCategory } from "@prisma/client";

/**
 * Recalculate FinancialPeriod.suppliesCosts for a given service + week.
 * Called after any BudgetItem create/update/delete.
 * All BudgetItem purchases (including groceries category) go to suppliesCosts.
 * foodCosts remains owned by the attendance-to-financials weekly cron.
 */
export async function recalcFinancialsForWeek(serviceId: string, weekStartDate: Date) {
  // Normalise to Monday 00:00
  const weekStart = getWeekStart(weekStartDate);
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);

  // Aggregate all BudgetItems for this service in this week
  const result = await prisma.budgetItem.aggregate({
    where: {
      serviceId,
      date: { gte: weekStart, lt: weekEnd },
    },
    _sum: { amount: true },
  });

  const totalSpend = result._sum.amount || 0;

  // Upsert the FinancialPeriod for this week
  await prisma.financialPeriod.upsert({
    where: {
      serviceId_periodType_periodStart: {
        serviceId,
        periodType: "weekly",
        periodStart: weekStart,
      },
    },
    update: {
      suppliesCosts: totalSpend,
    },
    create: {
      serviceId,
      periodType: "weekly",
      periodStart: weekStart,
      periodEnd: weekEnd,
      suppliesCosts: totalSpend,
    },
  });
}

interface BudgetTier {
  minWeeklyChildren: number;
  monthlyBudget: number;
}

/**
 * Resolve the monthly centre purchase budget for a service.
 * Priority: per-service override > org-wide tier matching > fallback $150.
 */
export async function getMonthlyBudget(serviceId: string): Promise<{
  amount: number;
  source: "override" | "tier";
  tierLabel?: string;
}> {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { monthlyPurchaseBudget: true },
  });

  // Per-service override takes precedence
  if (service?.monthlyPurchaseBudget != null) {
    return { amount: service.monthlyPurchaseBudget, source: "override" };
  }

  // Load org-wide tiers
  const orgSettings = await prisma.orgSettings.findUnique({
    where: { id: "singleton" },
    select: { purchaseBudgetTiers: true },
  });

  const tiers = (orgSettings?.purchaseBudgetTiers as BudgetTier[] | null) || [
    { minWeeklyChildren: 100, monthlyBudget: 300 },
    { minWeeklyChildren: 0, monthlyBudget: 150 },
  ];

  // Calculate average weekly attendance over last 4 complete weeks
  const fourWeeksAgo = new Date(Date.now() - 28 * 86400000);
  const attendanceResult = await prisma.dailyAttendance.aggregate({
    where: {
      serviceId,
      date: { gte: fourWeeksAgo },
    },
    _sum: { attended: true },
  });

  const totalAttended = attendanceResult._sum.attended || 0;
  const avgWeeklyAttendance = totalAttended / 4;

  // Match tier (sorted descending by minWeeklyChildren)
  const sortedTiers = [...tiers].sort((a, b) => b.minWeeklyChildren - a.minWeeklyChildren);
  for (const tier of sortedTiers) {
    if (avgWeeklyAttendance >= tier.minWeeklyChildren) {
      return {
        amount: tier.monthlyBudget,
        source: "tier",
        tierLabel: `${tier.minWeeklyChildren}+ children — $${tier.monthlyBudget}/mo`,
      };
    }
  }

  // Fallback — use the lowest tier (last in sorted array)
  const fallback = sortedTiers[sortedTiers.length - 1];
  const fallbackAmount = fallback?.monthlyBudget ?? 150;
  return {
    amount: fallbackAmount,
    source: "tier" as const,
    tierLabel: `$${fallbackAmount}/mo (base tier)`,
  };
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
```

- [ ] **Step 2: Verify build compiles**

```bash
npm run build 2>&1 | tail -5
```

Expected: "Compiled successfully"

- [ ] **Step 3: Commit**

```bash
git add src/lib/budget-helpers.ts
git commit -m "feat: add shared budget helpers — recalcFinancialsForWeek, getMonthlyBudget"
```

---

## Chunk 2: API Changes

### Task 3: Update Equipment API Routes — Add Groceries + Financials Sync

**Files:**
- Modify: `src/app/api/services/[id]/budget/equipment/route.ts`
- Modify: `src/app/api/services/[id]/budget/equipment/[itemId]/route.ts`

- [ ] **Step 1: Update POST route — add groceries to Zod + financials sync**

In `src/app/api/services/[id]/budget/equipment/route.ts`:

1. Add import at top:
```typescript
import { recalcFinancialsForWeek } from "@/lib/budget-helpers";
```

2. Find the Zod schema `category` field (around line 10) and add `"groceries"` to the enum:
```typescript
category: z.enum(["groceries", "kitchen", "sports", "art_craft", "furniture", "technology", "cleaning", "safety", "other"]),
```

3. After the `BudgetItem` is created (after the `prisma.budgetItem.create` call) and before the return, add:
```typescript
  // Sync to financials
  await recalcFinancialsForWeek(serviceId, new Date(body.date));
```

- [ ] **Step 2: Update PATCH/DELETE route — add groceries to Zod + financials sync**

In `src/app/api/services/[id]/budget/equipment/[itemId]/route.ts`:

1. Add import at top:
```typescript
import { recalcFinancialsForWeek } from "@/lib/budget-helpers";
```

2. Find the Zod update schema `category` field (around line 10) and add `"groceries"`:
```typescript
category: z.enum(["groceries", "kitchen", "sports", "art_craft", "furniture", "technology", "cleaning", "safety", "other"]).optional(),
```

3. In the PATCH handler, before the existing item is updated, fetch the old item to check for date changes:
```typescript
  const oldItem = await prisma.budgetItem.findUnique({ where: { id: itemId }, select: { date: true } });
```

4. After the `prisma.budgetItem.update` call, add:
```typescript
  // Sync financials — recalc old week and new week if date changed
  const newDate = body.date ? new Date(body.date) : oldItem!.date;
  await recalcFinancialsForWeek(serviceId, newDate);
  if (oldItem && body.date && new Date(body.date).getTime() !== oldItem.date.getTime()) {
    await recalcFinancialsForWeek(serviceId, oldItem.date);
  }
```

5. In the DELETE handler, fetch the item's date before deleting:
```typescript
  const item = await prisma.budgetItem.findUnique({ where: { id: itemId }, select: { date: true } });
```

6. After the `prisma.budgetItem.delete` call, add:
```typescript
  if (item) {
    await recalcFinancialsForWeek(serviceId, item.date);
  }
```

- [ ] **Step 3: Verify build**

```bash
npm run build 2>&1 | tail -5
```

Expected: "Compiled successfully"

- [ ] **Step 4: Commit**

```bash
git add src/app/api/services/[id]/budget/equipment/route.ts src/app/api/services/[id]/budget/equipment/\[itemId\]/route.ts
git commit -m "feat: add groceries to Zod schemas, sync BudgetItem mutations to FinancialPeriod"
```

---

### Task 4: Update Budget Summary API — Return Allocation + Tier Info

**Files:**
- Modify: `src/app/api/services/[id]/budget/route.ts`

- [ ] **Step 1: Add budget allocation to summary response**

In `src/app/api/services/[id]/budget/route.ts`:

1. Add import:
```typescript
import { getMonthlyBudget } from "@/lib/budget-helpers";
```

2. Inside the GET handler, after the existing aggregation logic, add:
```typescript
  // Resolve budget allocation
  const budgetAllocation = await getMonthlyBudget(serviceId);

  // Calculate month-to-date non-grocery purchase spend
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const monthToDateResult = await prisma.budgetItem.aggregate({
    where: {
      serviceId,
      date: { gte: monthStart },
      category: { not: "groceries" },
    },
    _sum: { amount: true },
  });
  const monthToDatePurchaseSpend = monthToDateResult._sum.amount || 0;
```

3. Add these fields to the JSON response object (alongside existing `groceryBudget`, `equipmentBudget`, etc.):
```typescript
  monthlyAllocation: budgetAllocation.amount,
  allocationSource: budgetAllocation.source,
  allocationLabel: budgetAllocation.tierLabel || `Override — $${budgetAllocation.amount}/mo`,
  monthToDatePurchaseSpend,
  budgetRemaining: budgetAllocation.amount - monthToDatePurchaseSpend,
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/services/[id]/budget/route.ts
git commit -m "feat: return budget allocation + month-to-date spend in budget summary API"
```

---

### Task 5: Update Org Settings API — Accept Budget Tiers

**Files:**
- Modify: `src/app/api/org-settings/route.ts`

- [ ] **Step 1: Update requireAuth to allow head_office**

Find the `requireAuth(["owner"])` call in the PATCH handler (around line 38) and change to:
```typescript
requireAuth(["owner", "head_office"])
```

- [ ] **Step 2: Add purchaseBudgetTiers to the PATCH validation schema**

Find the Zod schema (around line 24) and add:
```typescript
  purchaseBudgetTiers: z.array(z.object({
    minWeeklyChildren: z.number().min(0),
    monthlyBudget: z.number().min(0),
  })).optional(),
```

- [ ] **Step 2: Include purchaseBudgetTiers in the upsert data**

In the `prisma.orgSettings.upsert` call, add `purchaseBudgetTiers: body.purchaseBudgetTiers` to both the `update` and `create` objects (only if provided — use spread: `...(body.purchaseBudgetTiers && { purchaseBudgetTiers: body.purchaseBudgetTiers })`).

- [ ] **Step 3: Return purchaseBudgetTiers in GET response**

In the GET handler, add `purchaseBudgetTiers` to the select fields so it's returned to the frontend.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/org-settings/route.ts
git commit -m "feat: accept purchaseBudgetTiers in org settings PATCH"
```

---

### Task 6: Update Service API — Accept monthlyPurchaseBudget

**Files:**
- Modify: `src/app/api/services/[id]/route.ts`

- [ ] **Step 1: Add monthlyPurchaseBudget to the updatable fields array**

The PATCH handler uses a `fields` array whitelist (around line 87) and loops over it to build the update data. Add `"monthlyPurchaseBudget"` to the `fields` array:

```typescript
const fields = ["name", "code", ..., "monthlyPurchaseBudget"];
```

The existing loop (`if (body[f] !== undefined) { data[f] = body[f]; }`) will correctly handle both setting a value and clearing it with `null`, since `null !== undefined` evaluates to `true`.

- [ ] **Step 2: Commit**

```bash
git add src/app/api/services/[id]/route.ts
git commit -m "feat: accept monthlyPurchaseBudget in service PATCH for per-service budget override"
```

---

## Chunk 3: Frontend — Attendance + Budget Tab UI

### Task 7: Remove Capacity from Attendance Tab

**Files:**
- Modify: `src/components/services/ServiceAttendanceTab.tsx`

- [ ] **Step 1: Remove capacity from Props interface**

Find `capacity?: number | null` (around line 39) and remove it.

- [ ] **Step 2: Remove capacity from GridRow type**

Find the `GridRow` type (around line 78). Change:
```typescript
bsc: { enrolled: number; attended: number; capacity: number };
asc: { enrolled: number; attended: number; capacity: number };
```
to:
```typescript
bsc: { enrolled: number; attended: number };
asc: { enrolled: number; attended: number };
```

- [ ] **Step 3: Remove defaultCap and capacity from grid state initialization**

Find `const defaultCap = capacity || 0` (around line 135) and remove it.

In the grid state construction (around lines 155–165), remove all `capacity:` assignments from both `bsc` and `asc` objects.

- [ ] **Step 4: Remove capacity overflow warning logic**

Find the overflow check lines (around lines 411, 431):
```typescript
const bscOver = row.bsc.capacity > 0 && row.bsc.enrolled > row.bsc.capacity;
```
Remove these variables and all conditional styling/icons that reference `bscOver` and `ascOver`.

- [ ] **Step 5: Remove capacity column from desktop grid**

In the desktop table (around lines 470–556), remove:
- The "Cap" column header `<th>`
- The capacity `<td>` cells (input fields for BSC cap and ASC cap)
- Remove capacity from the save payload

- [ ] **Step 6: Remove capacity from mobile cards**

Find the mobile card layout and remove any capacity display or capacity input.

- [ ] **Step 7: Remove capacity from CSV import column config**

Find the column config array (around lines 42–51) and remove:
```typescript
{ key: "capacity", label: "Capacity" }
```

- [ ] **Step 8: Remove capacity from the save/handleSave function**

Remove `capacity` from the data sent to the API in the save handler. Since the `AttendanceInput` type in `src/hooks/useAttendance.ts` (line 62) has `capacity: number` as required, send `capacity: 0` as a default value in the save payload to satisfy the type without affecting the UI. The field stays in the DB for anomaly detection.

- [ ] **Step 9: Verify build**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 10: Commit**

```bash
git add src/components/services/ServiceAttendanceTab.tsx
git commit -m "refactor: remove capacity column from attendance tab UI"
```

---

### Task 8: Update Budget Tab — Renaming, Groceries Category, Default Weekly

**Files:**
- Modify: `src/components/services/ServiceBudgetTab.tsx`
- Modify: `src/hooks/useBudget.ts`

- [ ] **Step 1: Update useBudget.ts — extend BudgetSummary interface**

In `src/hooks/useBudget.ts`, add these fields to the `BudgetSummary` interface:
```typescript
  monthlyAllocation: number;
  allocationSource: "override" | "tier";
  allocationLabel: string;
  monthToDatePurchaseSpend: number;
  budgetRemaining: number;
```

- [ ] **Step 2: Add groceries to CATEGORY_LABELS (around line 43)**

Add at the top of the map:
```typescript
groceries: "Groceries",
```

- [ ] **Step 3: Add groceries to CATEGORY_COLORS (around line 54)**

Add:
```typescript
groceries: "#16a34a",  // green-600
```

- [ ] **Step 4: Change default period from "monthly" to "weekly"**

Find line 92:
```typescript
const [period, setPeriod] = useState<"weekly" | "monthly">("monthly")
```
Change to:
```typescript
const [period, setPeriod] = useState<"weekly" | "monthly">("weekly")
```

- [ ] **Step 5: Rename all "equipment" → "purchase" / "centre purchase" labels**

Search and replace in `ServiceBudgetTab.tsx`:
- `"Equipment Purchases"` → `"Centre Purchases"`
- `"Add Equipment"` → `"Add Purchase"`
- `"No equipment purchases"` → `"No purchases"`
- `"Add Equipment Item"` → `"Add Purchase"`
- `"Edit Equipment Item"` → `"Edit Purchase"`
- `"Delete this equipment"` → `"Delete this purchase"`
- Chart data key in `chartData` useMemo (around line 129): `Equipment: Math.round(...)` → `"Centre Purchases": Math.round(...)`
- Chart `<Bar>` component (around line 333): `dataKey="Equipment"` → `dataKey="Centre Purchases"`
- Any remaining "equipment" display strings → "purchase" / "centre purchase"
- Remove unused `StatCard` import if it becomes unused after Step 6

- [ ] **Step 6: Replace the 4 summary cards with new budget-aware cards**

Replace the existing StatCard section (around lines 154–187) with:

```tsx
{/* Summary Cards */}
<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
  {/* Card 1: Grocery Spend */}
  <div className="bg-white rounded-xl border border-gray-200 p-4">
    <p className="text-xs font-medium text-gray-500 mb-1">Grocery Spend</p>
    <p className="text-2xl font-bold text-emerald-700">
      ${summary?.groceryBudget?.total?.toFixed(0) || "0"}
    </p>
    <p className="text-xs text-gray-400 mt-1">
      {period === "weekly" ? "This week" : "This month"}
    </p>
  </div>

  {/* Card 2: Purchase Budget */}
  <div className="bg-white rounded-xl border border-gray-200 p-4">
    <p className="text-xs font-medium text-gray-500 mb-1">Purchase Budget</p>
    <p className="text-2xl font-bold text-gray-900">
      ${summary?.monthToDatePurchaseSpend?.toFixed(0) || "0"}
      <span className="text-sm font-normal text-gray-400">
        {" "}/ ${summary?.monthlyAllocation || 0}
      </span>
    </p>
    {summary?.monthlyAllocation && (
      <>
        <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
          <div
            className={cn(
              "h-1.5 rounded-full transition-all",
              (summary.monthToDatePurchaseSpend / summary.monthlyAllocation) > 1
                ? "bg-red-500"
                : (summary.monthToDatePurchaseSpend / summary.monthlyAllocation) > 0.8
                ? "bg-amber-500"
                : "bg-blue-500"
            )}
            style={{
              width: `${Math.min((summary.monthToDatePurchaseSpend / summary.monthlyAllocation) * 100, 100)}%`,
            }}
          />
        </div>
        <p className="text-[10px] text-gray-400 mt-1">{summary.allocationLabel}</p>
      </>
    )}
  </div>

  {/* Card 3: Total Spend */}
  <div className="bg-white rounded-xl border border-gray-200 p-4">
    <p className="text-xs font-medium text-gray-500 mb-1">Total Spend</p>
    <p className="text-2xl font-bold text-purple-700">
      ${summary?.combinedTotal?.toFixed(0) || "0"}
    </p>
    <p className="text-xs text-gray-400 mt-1">
      {period === "weekly" ? "This week" : "This month"}
    </p>
  </div>

  {/* Card 4: Budget Remaining */}
  <div className="bg-white rounded-xl border border-gray-200 p-4">
    <p className="text-xs font-medium text-gray-500 mb-1">Budget Remaining</p>
    <p className={cn(
      "text-2xl font-bold",
      (summary?.budgetRemaining ?? 0) < 0 ? "text-red-600" : "text-emerald-700"
    )}>
      ${Math.abs(summary?.budgetRemaining ?? 0).toFixed(0)}
      {(summary?.budgetRemaining ?? 0) < 0 && (
        <span className="text-xs font-medium ml-1">over</span>
      )}
    </p>
    <p className="text-xs text-gray-400 mt-1">This month</p>
  </div>
</div>
```

- [ ] **Step 7: Add groceries to the category filter pills**

In the filter pills section (around lines 361–392), the list of categories is mapped. Add `"groceries"` to the beginning of the category array. The colour will come from the updated `CATEGORY_COLORS` map. Use `bg-green-100 text-green-700` for the pill badge.

- [ ] **Step 8: Verify build**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 9: Commit**

```bash
git add src/components/services/ServiceBudgetTab.tsx src/hooks/useBudget.ts
git commit -m "feat: rename to Centre Purchases, add groceries category, new budget cards, default weekly"
```

---

## Chunk 4: Settings UI + Per-Service Override

### Task 9: Add Budget Tiers Config to Settings

**Files:**
- Modify: `src/app/(dashboard)/settings/SettingsContent.tsx`

- [ ] **Step 1: Add BudgetTiersSection component**

Add a new component `BudgetTiersSection` before the `SettingsContent` export. This is an owner/head_office-only section.

```tsx
interface BudgetTier {
  minWeeklyChildren: number;
  monthlyBudget: number;
}

function BudgetTiersSection() {
  const queryClient = useQueryClient();
  const [tiers, setTiers] = useState<BudgetTier[]>([]);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [newTier, setNewTier] = useState({ minWeeklyChildren: 0, monthlyBudget: 0 });
  const [saving, setSaving] = useState(false);

  const { data: orgSettings, isLoading } = useQuery<{ purchaseBudgetTiers?: BudgetTier[] }>({
    queryKey: ["org-settings"],
    queryFn: async () => {
      const res = await fetch("/api/org-settings");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  useEffect(() => {
    if (orgSettings?.purchaseBudgetTiers) {
      setTiers(orgSettings.purchaseBudgetTiers);
    } else {
      // Defaults
      setTiers([
        { minWeeklyChildren: 100, monthlyBudget: 300 },
        { minWeeklyChildren: 0, monthlyBudget: 150 },
      ]);
    }
  }, [orgSettings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const sorted = [...tiers].sort((a, b) => b.minWeeklyChildren - a.minWeeklyChildren);
      await fetch("/api/org-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchaseBudgetTiers: sorted }),
      });
      queryClient.invalidateQueries({ queryKey: ["org-settings"] });
      toast({ description: "Budget tiers saved" });
    } catch {
      toast({ description: "Failed to save tiers", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const addTier = () => {
    if (newTier.monthlyBudget <= 0) return;
    setTiers((prev) => [...prev, { ...newTier }].sort((a, b) => b.minWeeklyChildren - a.minWeeklyChildren));
    setNewTier({ minWeeklyChildren: 0, monthlyBudget: 0 });
  };

  const removeTier = (idx: number) => {
    setTiers((prev) => prev.filter((_, i) => i !== idx));
  };

  // ... render with table, add row, save button
}
```

The component renders a card with:
- `DollarSign` icon + "Centre Purchase Budget Tiers" heading
- Table: Min Weekly Children | Monthly Budget ($) | Remove button
- Add tier row with two inputs + "Add" button
- "Save Tiers" button

- [ ] **Step 2: Insert BudgetTiersSection into SettingsContent render**

In the `SettingsContent` component, add between API Keys and AI Usage:
```tsx
{/* Budget Tiers (owner/head_office) */}
{(isOwner || isHeadOffice) && <BudgetTiersSection />}
```

- [ ] **Step 3: Verify build**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/settings/SettingsContent.tsx
git commit -m "feat: add Centre Purchase Budget Tiers config in Settings"
```

---

### Task 10: Add Per-Service Budget Override

**Files:**
- Modify: `src/components/services/ServiceBudgetTab.tsx`

- [ ] **Step 1: Add useQueryClient import and instantiation**

At the top of `ServiceBudgetTab.tsx`, add `useQueryClient` to the React Query import:
```typescript
import { useQuery, useQueryClient } from "@tanstack/react-query";
```

Inside the `ServiceBudgetTab` component, add:
```typescript
const queryClient = useQueryClient();
```

- [ ] **Step 2: Add override state and UI**

Add state:
```typescript
const [showOverride, setShowOverride] = useState(false);
const [overrideValue, setOverrideValue] = useState<string>("");
```

Next to the Purchase Budget card (Card 2), add a small link visible to admin/owner:
```tsx
<button
  onClick={() => {
    setShowOverride(!showOverride);
    setOverrideValue(String(summary?.monthlyAllocation || ""));
  }}
  className="text-[10px] text-blue-500 hover:text-blue-700 underline"
>
  {summary?.allocationSource === "override" ? "Edit override" : "Override budget"}
</button>
```

When `showOverride` is true, render an inline form below the card:
```tsx
{showOverride && (
  <div className="flex items-center gap-2 mt-2">
    <span className="text-xs text-gray-500">$</span>
    <input
      type="number"
      value={overrideValue}
      onChange={(e) => setOverrideValue(e.target.value)}
      className="w-20 px-2 py-1 text-xs border border-gray-300 rounded"
    />
    <button onClick={handleSaveOverride} className="text-xs text-blue-600 font-medium">
      Save
    </button>
    {summary?.allocationSource === "override" && (
      <button onClick={handleClearOverride} className="text-xs text-red-500">
        Clear
      </button>
    )}
  </div>
)}
```

- [ ] **Step 3: Add handleSaveOverride and handleClearOverride functions**

```typescript
const handleSaveOverride = async () => {
  const val = parseFloat(overrideValue);
  if (isNaN(val) || val <= 0) return;
  await fetch(`/api/services/${serviceId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ monthlyPurchaseBudget: val }),
  });
  queryClient.invalidateQueries({ queryKey: ["budget-summary", serviceId] });
  setShowOverride(false);
  toast({ description: "Budget override saved" });
};

const handleClearOverride = async () => {
  await fetch(`/api/services/${serviceId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ monthlyPurchaseBudget: null }),
  });
  queryClient.invalidateQueries({ queryKey: ["budget-summary", serviceId] });
  setShowOverride(false);
  toast({ description: "Budget override cleared" });
};
```

- [ ] **Step 4: Verify build**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add src/components/services/ServiceBudgetTab.tsx
git commit -m "feat: add per-service budget override on budget tab"
```

---

## Chunk 5: Final Verification

### Task 11: Full Build Verification + Push

- [ ] **Step 1: Run full build**

```bash
npm run build
```

Expected: "Compiled successfully" with no type errors.

- [ ] **Step 2: Push schema to Railway (if not already done)**

```bash
export DATABASE_URL=$(grep "^DATABASE_URL" .env.local | cut -d'"' -f2) && npx prisma db push
```

- [ ] **Step 3: Push to remote**

```bash
git push origin main
```

- [ ] **Step 4: Verify deployment on Vercel**

Check that the Vercel deployment succeeds after push.
