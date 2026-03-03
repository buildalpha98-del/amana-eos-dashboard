import { prisma } from "@/lib/prisma";
import { xeroApiRequest } from "@/lib/xero";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SyncResult {
  success: boolean;
  centreCount: number;
  periodCount: number;
  errors: string[];
}

interface ParsedFinancials {
  bscRevenue: number;
  ascRevenue: number;
  vcRevenue: number;
  otherRevenue: number;
  staffCosts: number;
  foodCosts: number;
  suppliesCosts: number;
  rentCosts: number;
  adminCosts: number;
  otherCosts: number;
}

type LocalCategory = keyof ParsedFinancials;

const LOCAL_CATEGORIES: LocalCategory[] = [
  "bscRevenue",
  "ascRevenue",
  "vcRevenue",
  "otherRevenue",
  "staffCosts",
  "foodCosts",
  "suppliesCosts",
  "rentCosts",
  "adminCosts",
  "otherCosts",
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function emptyFinancials(): ParsedFinancials {
  return {
    bscRevenue: 0,
    ascRevenue: 0,
    vcRevenue: 0,
    otherRevenue: 0,
    staffCosts: 0,
    foodCosts: 0,
    suppliesCosts: 0,
    rentCosts: 0,
    adminCosts: 0,
    otherCosts: 0,
  };
}

// ─── Xero P&L Report Parser ────────────────────────────────────────────────

function parseXeroProfitAndLoss(
  report: any,
  accountMapping: Map<string, string>
): ParsedFinancials {
  const result = emptyFinancials();

  const rows = report?.Reports?.[0]?.Rows;
  if (!Array.isArray(rows)) return result;

  for (const section of rows) {
    if (section.RowType !== "Section") continue;

    const sectionRows = section.Rows;
    if (!Array.isArray(sectionRows)) continue;

    for (const row of sectionRows) {
      if (row.RowType !== "Row") continue;

      const cells = row.Cells;
      if (!Array.isArray(cells) || cells.length < 2) continue;

      // Extract account code from Attributes
      let accountCode: string | null = null;
      const attributes = cells[0]?.Attributes;
      if (Array.isArray(attributes)) {
        const accountAttr = attributes.find(
          (attr: any) => attr.Id === "account"
        );
        if (accountAttr) {
          accountCode = accountAttr.Value;
        }
      }

      // Look up local category by account code first, then fall back to name
      let localCategory: string | undefined;
      if (accountCode) {
        localCategory = accountMapping.get(accountCode);
      }
      if (!localCategory) {
        // Fall back: try matching by account name across all mappings
        const accountName = cells[0]?.Value;
        if (accountName) {
          for (const [code, cat] of accountMapping.entries()) {
            // We only have code->category in the map, so name-based fallback
            // checks if the name matches any mapping key (unlikely but safe)
            if (code === accountName) {
              localCategory = cat;
              break;
            }
          }
        }
      }

      if (!localCategory) continue;

      // Validate this is a known local category
      if (!LOCAL_CATEGORIES.includes(localCategory as LocalCategory)) continue;

      const amount = parseFloat(cells[1]?.Value || "0") || 0;
      result[localCategory as LocalCategory] += amount;
    }
  }

  return result;
}

// ─── Main Sync Function ────────────────────────────────────────────────────

export async function syncXeroFinancials(
  options?: { months?: number }
): Promise<SyncResult> {
  const months = options?.months ?? 1;
  const errors: string[] = [];
  let periodCount = 0;

  // 1. Read XeroConnection with account mappings
  const connection = await prisma.xeroConnection.findUnique({
    where: { id: "singleton" },
    include: { accountMappings: true },
  });

  if (!connection || connection.status === "disconnected") {
    throw new Error("Xero is not connected");
  }

  if (!connection.trackingCategoryId) {
    throw new Error(
      "Xero tracking category is not configured. Please set up mappings first."
    );
  }

  // 3. Build account mapping lookup: xeroAccountCode -> localCategory
  const accountMapping = new Map<string, string>();
  for (const mapping of connection.accountMappings) {
    accountMapping.set(mapping.xeroAccountCode, mapping.localCategory);
  }

  // 4. Get all services with a Xero tracking option mapped
  const services = await prisma.service.findMany({
    where: { xeroTrackingOptionId: { not: null } },
    select: { id: true, name: true, code: true, xeroTrackingOptionId: true },
  });

  if (services.length === 0) {
    throw new Error(
      "No centres are mapped to Xero tracking options. Please set up centre mappings first."
    );
  }

  // 5. Calculate date range: first day of current month back N months
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const monthRanges: { fromDate: Date; toDate: Date }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const from = new Date(
      currentMonthStart.getFullYear(),
      currentMonthStart.getMonth() - i,
      1
    );
    const to = new Date(from.getFullYear(), from.getMonth() + 1, 0); // last day of month
    monthRanges.push({ fromDate: from, toDate: to });
  }

  // 6. For each month and each service, fetch P&L and upsert
  for (const { fromDate, toDate } of monthRanges) {
    for (const service of services) {
      try {
        const fromStr = formatDate(fromDate);
        const toStr = formatDate(toDate);

        const report = await xeroApiRequest(
          `/Reports/ProfitAndLoss?fromDate=${fromStr}&toDate=${toStr}&trackingCategoryID=${connection.trackingCategoryId}&trackingOptionID=${service.xeroTrackingOptionId}`
        );

        const parsed = parseXeroProfitAndLoss(report, accountMapping);

        const totalRevenue =
          parsed.bscRevenue +
          parsed.ascRevenue +
          parsed.vcRevenue +
          parsed.otherRevenue;

        const totalCosts =
          parsed.staffCosts +
          parsed.foodCosts +
          parsed.suppliesCosts +
          parsed.rentCosts +
          parsed.adminCosts +
          parsed.otherCosts;

        const grossProfit = totalRevenue - totalCosts;
        const margin =
          totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

        await prisma.financialPeriod.upsert({
          where: {
            serviceId_periodType_periodStart: {
              serviceId: service.id,
              periodType: "monthly",
              periodStart: fromDate,
            },
          },
          update: {
            periodEnd: toDate,
            ...parsed,
            totalRevenue,
            totalCosts,
            grossProfit,
            margin,
            dataSource: "xero",
            xeroSyncedAt: new Date(),
          },
          create: {
            serviceId: service.id,
            periodType: "monthly",
            periodStart: fromDate,
            periodEnd: toDate,
            ...parsed,
            totalRevenue,
            totalCosts,
            grossProfit,
            margin,
            dataSource: "xero",
            xeroSyncedAt: new Date(),
          },
        });

        periodCount++;

        // Rate limit: 1100ms delay between API calls
        await sleep(1100);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error";
        errors.push(`${service.name} (${formatDate(fromDate)}): ${message}`);
      }
    }
  }

  // 7. Update XeroConnection sync status
  await prisma.xeroConnection.update({
    where: { id: "singleton" },
    data: {
      lastSyncAt: new Date(),
      lastSyncStatus: errors.length > 0 ? "partial" : "success",
      lastSyncError: errors.length > 0 ? errors.join("; ") : null,
      syncedFinancialPeriods: periodCount,
    },
  });

  return {
    success: errors.length === 0,
    centreCount: services.length,
    periodCount,
    errors,
  };
}
