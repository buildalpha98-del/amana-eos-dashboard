import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import * as XLSX from "xlsx";

// Column name variations we accept (case-insensitive, trimmed)
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
  // Remove $ signs, commas, spaces
  const cleaned = String(val).replace(/[$,\s]/g, "").replace(/\((.+)\)/, "-$1");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseDate(val: unknown): Date | null {
  if (!val) return null;

  // XLSX serial date number
  if (typeof val === "number") {
    // Excel serial date: days since 1900-01-01 (with the Excel leap year bug)
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + val * 86400000);
    if (!isNaN(date.getTime())) return date;
  }

  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }

  const str = String(val).trim();

  // Try ISO format (YYYY-MM-DD)
  const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const d = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
    if (!isNaN(d.getTime())) return d;
  }

  // Try Australian format DD/MM/YYYY
  const auMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (auMatch) {
    let year = parseInt(auMatch[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, parseInt(auMatch[2]) - 1, parseInt(auMatch[1]));
    if (!isNaN(d.getTime())) return d;
  }

  // Try month-year like "Jan 2025", "January 2025"
  const monthYearMatch = str.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (monthYearMatch) {
    const d = new Date(`1 ${monthYearMatch[1]} ${monthYearMatch[2]}`);
    if (!isNaN(d.getTime())) return d;
  }

  // Fallback: let JS parse it
  const fallback = new Date(str);
  return isNaN(fallback.getTime()) ? null : fallback;
}

function getLastDayOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const periodType = (formData.get("periodType") as string) || "monthly";
    const dryRun = formData.get("dryRun") === "true";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    const validTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
      "application/csv",
    ];
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!validTypes.includes(file.type) && !["xlsx", "xls", "csv"].includes(ext || "")) {
      return NextResponse.json(
        { error: "Invalid file type. Please upload .xlsx, .xls, or .csv files." },
        { status: 400 }
      );
    }

    // Read the file
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });

    // Use first sheet
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json({ error: "Workbook has no sheets" }, { status: 400 });
    }

    const sheet = workbook.Sheets[sheetName];
    const rawData: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    if (rawData.length === 0) {
      return NextResponse.json({ error: "No data rows found in the spreadsheet" }, { status: 400 });
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

    // Must have at minimum a centre name column
    const hasCentreName = Object.values(columnMapping).includes("centreName");
    if (!hasCentreName) {
      return NextResponse.json(
        {
          error: "Could not find a Centre/Service Name column. Expected headers like: Centre, Centre Name, Service, Service Name, Location.",
          detectedColumns: headers,
        },
        { status: 400 }
      );
    }

    // Fetch all active services for matching
    const services = await prisma.service.findMany({
      where: { status: "active" },
      select: { id: true, name: true, code: true },
    });

    // Build lookup maps (lowercase)
    const serviceByName: Record<string, { id: string; name: string; code: string }> = {};
    const serviceByCode: Record<string, { id: string; name: string; code: string }> = {};
    for (const svc of services) {
      serviceByName[svc.name.toLowerCase().trim()] = svc;
      serviceByCode[svc.code.toLowerCase().trim()] = svc;
      // Also add without common prefixes/suffixes like "OSHC", "Centre"
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
    const rows: Array<{
      rowNumber: number;
      rawCentreName: string;
      matchedService: { id: string; name: string; code: string } | null;
      data: Record<string, number>;
      periodStart: Date | null;
      periodEnd: Date | null;
      status: "matched" | "unmatched" | "error";
      error?: string;
    }> = [];

    for (let i = 0; i < rawData.length; i++) {
      const raw = rawData[i];
      const row: Record<string, unknown> = {};

      // Map raw columns to our field names
      for (const [header, value] of Object.entries(raw)) {
        const mappedField = columnMapping[header];
        if (mappedField) {
          row[mappedField] = value;
        }
      }

      const centreName = String(row.centreName || "").trim();
      if (!centreName) continue; // skip empty rows

      // Match service
      const searchKey = centreName.toLowerCase().trim();
      let matched =
        serviceByName[searchKey] ||
        serviceByCode[searchKey] ||
        null;

      // Fuzzy match: try partial match
      if (!matched) {
        const simplified = searchKey
          .replace(/\b(oshc|oosh|centre|center|care|service)\b/g, "")
          .replace(/\s+/g, " ")
          .trim();
        matched = serviceByName[simplified] || null;

        // Try if service name contains the search key or vice versa
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

      // If no period dates provided, try to infer from the period type
      // Default to current month if nothing found
      if (!periodStart) {
        const now = new Date();
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      }
      if (!periodEnd && periodStart) {
        periodEnd = getLastDayOfMonth(periodStart);
      }

      rows.push({
        rowNumber: i + 2, // +2 because row 1 is header, and 0-indexed
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
      return NextResponse.json({
        preview: true,
        fileName: file.name,
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
      });
    }

    // Actual import - only matched rows
    const matchedRows = rows.filter((r) => r.status === "matched" && r.matchedService);
    const results: Array<{ centre: string; action: "created" | "updated"; id: string }> = [];
    const errors: Array<{ centre: string; error: string }> = [];

    for (const row of matchedRows) {
      try {
        const svc = row.matchedService!;
        const d = row.data;

        // Calculate derived values
        const bscRevenue = d.bscRevenue;
        const ascRevenue = d.ascRevenue;
        const vcRevenue = d.vcRevenue;
        const otherRevenue = d.otherRevenue;

        // If totalRevenue is provided and individual rev aren't, use it
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
          userId: session!.user.id,
          action: "import",
          entityType: "FinancialPeriod",
          entityId: "bulk_import",
          details: {
            fileName: file.name,
            importedCount: results.length,
            errorCount: errors.length,
            unmatchedCount: rows.filter((r) => r.status === "unmatched").length,
          },
        },
      });
    }

    return NextResponse.json({
      success: true,
      imported: results.length,
      errors: errors.length,
      unmatched: rows.filter((r) => r.status === "unmatched").length,
      results,
      importErrors: errors,
      unmatchedCentres: rows
        .filter((r) => r.status === "unmatched")
        .map((r) => r.rawCentreName),
    });
  } catch (err) {
    console.error("Financial import error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to process file" },
      { status: 500 }
    );
  }
}
