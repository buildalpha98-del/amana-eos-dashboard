import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

// ---------------------------------------------------------------------------
// Column mapping
// ---------------------------------------------------------------------------

const COLUMN_MAP: Record<string, string[]> = {
  centreName: [
    "centre", "centre name", "center", "center name",
    "service", "service name", "location", "site", "site name",
  ],
  bscRevenue: [
    "bsc revenue", "bsc rev", "bsc", "before school care revenue",
    "before school", "bsc income",
  ],
  ascRevenue: [
    "asc revenue", "asc rev", "asc", "after school care revenue",
    "after school", "asc income",
  ],
  vcRevenue: [
    "vc revenue", "vc rev", "vc", "vacation care revenue",
    "vacation care", "vacation", "vc income", "vac care",
  ],
  otherRevenue: [
    "other revenue", "other rev", "other income", "misc revenue",
  ],
  totalRevenue: [
    "total revenue", "total rev", "revenue", "total income", "income",
  ],
  staffCosts: [
    "staff costs", "staff", "staff cost", "wages", "salaries",
    "staff expenses", "labour", "labor",
  ],
  foodCosts: [
    "food costs", "food", "food cost", "catering", "food expenses",
  ],
  suppliesCosts: [
    "supplies", "supplies costs", "supplies cost", "materials",
    "consumables", "resources",
  ],
  rentCosts: [
    "rent", "rent costs", "rent cost", "lease", "occupancy",
    "venue hire", "venue",
  ],
  adminCosts: [
    "admin", "admin costs", "admin cost", "administration",
    "admin expenses", "office",
  ],
  otherCosts: [
    "other costs", "other cost", "other expenses", "misc costs",
    "miscellaneous", "other",
  ],
  totalCosts: [
    "total costs", "total cost", "costs", "total expenses", "expenses",
  ],
  periodStart: [
    "period start", "start date", "from", "start", "date from",
    "period from", "month", "period",
  ],
  periodEnd: [
    "period end", "end date", "to", "end", "date to", "period to",
  ],
};

// ---------------------------------------------------------------------------
// Parsing utilities
// ---------------------------------------------------------------------------

function normalizeHeader(header: string): string {
  return header.toLowerCase().trim().replace(/[_\-\.]+/g, " ").replace(/\s+/g, " ");
}

function matchColumn(header: string): string | null {
  const norm = normalizeHeader(header);
  for (const [field, aliases] of Object.entries(COLUMN_MAP)) {
    if (aliases.includes(norm)) {
      return field;
    }
  }
  return null;
}

function parseNumericValue(val: unknown): number {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number") return val;
  const cleaned = String(val).replace(/[$,\s]/g, "").replace(/\((.+)\)/, "-$1");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseDate(val: unknown): Date | null {
  if (!val) return null;

  if (typeof val === "number") {
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + val * 86400000);
    if (!isNaN(date.getTime())) return date;
  }

  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }

  const str = String(val).trim();

  const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const d = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
    if (!isNaN(d.getTime())) return d;
  }

  const auMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (auMatch) {
    let year = parseInt(auMatch[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, parseInt(auMatch[2]) - 1, parseInt(auMatch[1]));
    if (!isNaN(d.getTime())) return d;
  }

  const monthYearMatch = str.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (monthYearMatch) {
    const d = new Date(`1 ${monthYearMatch[1]} ${monthYearMatch[2]}`);
    if (!isNaN(d.getTime())) return d;
  }

  const fallback = new Date(str);
  return isNaN(fallback.getTime()) ? null : fallback;
}

function getLastDayOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParsedRow {
  rowNumber: number;
  rawCentreName: string;
  matchedService: { id: string; name: string; code: string } | null;
  data: Record<string, number>;
  periodStart: Date | null;
  periodEnd: Date | null;
  status: "matched" | "unmatched" | "error";
  error?: string;
}

export interface ImportPreviewResult {
  preview: true;
  fileName: string;
  sheetName: string;
  totalRows: number;
  parsedRows: number;
  columnMapping: { original: string; mapped: string }[];
  unmappedColumns: string[];
  rows: {
    rowNumber: number;
    centreName: string;
    matchedService: { id: string; name: string; code: string } | null;
    status: string;
    data: Record<string, number>;
    periodStart: string | null;
    periodEnd: string | null;
  }[];
  matchedCount: number;
  unmatchedCount: number;
}

export interface ImportResult {
  success: true;
  imported: number;
  errors: number;
  unmatched: number;
  results: { centre: string; action: "created" | "updated"; id: string }[];
  importErrors: { centre: string; error: string }[];
  unmatchedCentres: string[];
}

// ---------------------------------------------------------------------------
// Main import logic
// ---------------------------------------------------------------------------

export async function parseFinancialsSpreadsheet(
  buffer: ArrayBuffer,
  fileName: string,
  periodType: string,
  dryRun: boolean,
  userId: string,
): Promise<ImportPreviewResult | ImportResult> {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("Workbook has no sheets");
  }

  const sheet = workbook.Sheets[sheetName];
  const rawData: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  if (rawData.length === 0) {
    throw new Error("No data rows found in the spreadsheet");
  }

  // Map columns from the header row
  const headers = Object.keys(rawData[0]);
  const columnMapping: Record<string, string> = {};
  const unmappedColumns: string[] = [];

  for (const header of headers) {
    const mapped = matchColumn(header);
    if (mapped) {
      columnMapping[header] = mapped;
    } else {
      unmappedColumns.push(header);
    }
  }

  const hasCentreName = Object.values(columnMapping).includes("centreName");
  if (!hasCentreName) {
    throw new Error(
      `Could not find a Centre/Service Name column. Expected headers like: Centre, Centre Name, Service, Service Name, Location. Detected: ${headers.join(", ")}`
    );
  }

  // Fetch all active services for matching
  const services = await prisma.service.findMany({
    where: { status: "active" },
    select: { id: true, name: true, code: true },
  });

  // Build lookup maps
  const serviceByName: Record<string, { id: string; name: string; code: string }> = {};
  const serviceByCode: Record<string, { id: string; name: string; code: string }> = {};
  for (const svc of services) {
    serviceByName[svc.name.toLowerCase().trim()] = svc;
    serviceByCode[svc.code.toLowerCase().trim()] = svc;
    const simplified = svc.name
      .toLowerCase()
      .replace(/\b(oshc|oosh|centre|center|care|service)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (simplified && !serviceByName[simplified]) {
      serviceByName[simplified] = svc;
    }
  }

  // Parse rows
  const rows: ParsedRow[] = [];

  for (let i = 0; i < rawData.length; i++) {
    const raw = rawData[i];
    const row: Record<string, unknown> = {};

    for (const [header, value] of Object.entries(raw)) {
      const mappedField = columnMapping[header];
      if (mappedField) {
        row[mappedField] = value;
      }
    }

    const centreName = String(row.centreName || "").trim();
    if (!centreName) continue;

    // Match service
    const searchKey = centreName.toLowerCase().trim();
    let matched =
      serviceByName[searchKey] ||
      serviceByCode[searchKey] ||
      null;

    if (!matched) {
      const simplified = searchKey
        .replace(/\b(oshc|oosh|centre|center|care|service)\b/g, "")
        .replace(/\s+/g, " ")
        .trim();
      matched = serviceByName[simplified] || null;

      if (!matched) {
        for (const svc of services) {
          const svcLower = svc.name.toLowerCase();
          if (svcLower.includes(searchKey) || searchKey.includes(svcLower.replace(/\b(oshc|oosh|centre|center)\b/g, "").trim())) {
            matched = svc;
            break;
          }
        }
      }
    }

    // Parse numeric fields
    const numericData: Record<string, number> = {};
    for (const field of [
      "bscRevenue", "ascRevenue", "vcRevenue", "otherRevenue", "totalRevenue",
      "staffCosts", "foodCosts", "suppliesCosts", "rentCosts", "adminCosts",
      "otherCosts", "totalCosts",
    ]) {
      numericData[field] = parseNumericValue(row[field]);
    }

    // Parse dates
    let periodStart = parseDate(row.periodStart);
    let periodEnd = parseDate(row.periodEnd);

    if (!periodStart) {
      const now = new Date();
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    if (!periodEnd && periodStart) {
      periodEnd = getLastDayOfMonth(periodStart);
    }

    rows.push({
      rowNumber: i + 2,
      rawCentreName: centreName,
      matchedService: matched,
      data: numericData,
      periodStart,
      periodEnd,
      status: matched ? "matched" : "unmatched",
    });
  }

  // If dry run, return preview data without importing
  if (dryRun) {
    return {
      preview: true,
      fileName,
      sheetName,
      totalRows: rawData.length,
      parsedRows: rows.length,
      columnMapping: Object.entries(columnMapping).map(([original, mapped]) => ({
        original,
        mapped,
      })),
      unmappedColumns,
      rows: rows.map((r) => ({
        rowNumber: r.rowNumber,
        centreName: r.rawCentreName,
        matchedService: r.matchedService
          ? { id: r.matchedService.id, name: r.matchedService.name, code: r.matchedService.code }
          : null,
        status: r.status,
        data: r.data,
        periodStart: r.periodStart?.toISOString() || null,
        periodEnd: r.periodEnd?.toISOString() || null,
      })),
      matchedCount: rows.filter((r) => r.status === "matched").length,
      unmatchedCount: rows.filter((r) => r.status === "unmatched").length,
    };
  }

  // Actual import
  const matchedRows = rows.filter((r) => r.status === "matched" && r.matchedService);
  const results: { centre: string; action: "created" | "updated"; id: string }[] = [];
  const errors: { centre: string; error: string }[] = [];

  for (const row of matchedRows) {
    try {
      const svc = row.matchedService!;
      const d = row.data;

      const bscRevenue = d.bscRevenue;
      const ascRevenue = d.ascRevenue;
      const vcRevenue = d.vcRevenue;
      const otherRevenue = d.otherRevenue;

      let totalRevenue = bscRevenue + ascRevenue + vcRevenue + otherRevenue;
      if (totalRevenue === 0 && d.totalRevenue > 0) {
        totalRevenue = d.totalRevenue;
      }

      const staffCosts = d.staffCosts;
      const foodCosts = d.foodCosts;
      const suppliesCosts = d.suppliesCosts;
      const rentCosts = d.rentCosts;
      const adminCosts = d.adminCosts;
      const otherCosts = d.otherCosts;

      let totalCosts = staffCosts + foodCosts + suppliesCosts + rentCosts + adminCosts + otherCosts;
      if (totalCosts === 0 && d.totalCosts > 0) {
        totalCosts = d.totalCosts;
      }

      const grossProfit = totalRevenue - totalCosts;
      const margin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

      const periodStart = row.periodStart!;
      const periodEnd = row.periodEnd!;

      const record = await prisma.financialPeriod.upsert({
        where: {
          serviceId_periodType_periodStart: {
            serviceId: svc.id,
            periodType: periodType as "weekly" | "monthly" | "quarterly",
            periodStart,
          },
        },
        update: {
          periodEnd,
          bscRevenue,
          ascRevenue,
          vcRevenue,
          otherRevenue,
          totalRevenue,
          staffCosts,
          foodCosts,
          suppliesCosts,
          rentCosts,
          adminCosts,
          otherCosts,
          totalCosts,
          grossProfit,
          margin,
          dataSource: "owna_import",
        },
        create: {
          serviceId: svc.id,
          periodType: periodType as "weekly" | "monthly" | "quarterly",
          periodStart,
          periodEnd,
          bscRevenue,
          ascRevenue,
          vcRevenue,
          otherRevenue,
          totalRevenue,
          staffCosts,
          foodCosts,
          suppliesCosts,
          rentCosts,
          adminCosts,
          otherCosts,
          totalCosts,
          grossProfit,
          margin,
          dataSource: "owna_import",
        },
      });

      results.push({
        centre: svc.name,
        action: record.createdAt.getTime() === record.updatedAt.getTime() ? "created" : "updated",
        id: record.id,
      });
    } catch (err) {
      errors.push({
        centre: row.rawCentreName,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  // Log the import activity
  if (results.length > 0) {
    await prisma.activityLog.create({
      data: {
        userId,
        action: "import",
        entityType: "FinancialPeriod",
        entityId: "bulk_import",
        details: {
          fileName,
          importedCount: results.length,
          errorCount: errors.length,
          unmatchedCount: rows.filter((r) => r.status === "unmatched").length,
        },
      },
    });
  }

  return {
    success: true,
    imported: results.length,
    errors: errors.length,
    unmatched: rows.filter((r) => r.status === "unmatched").length,
    results,
    importErrors: errors,
    unmatchedCentres: rows
      .filter((r) => r.status === "unmatched")
      .map((r) => r.rawCentreName),
  };
}
