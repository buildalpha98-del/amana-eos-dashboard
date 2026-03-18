/**
 * Generic CSV export utility.
 * Two APIs: accessor-based (exportToCsv) and key-based (exportToCSV, legacy).
 */

// ---------------------------------------------------------------------------
// Accessor-based API (preferred)
// ---------------------------------------------------------------------------

export interface CsvColumn<T> {
  header: string;
  accessor: (row: T) => string | number | boolean | null | undefined;
}

export function exportToCsv<T>(
  filename: string,
  data: T[],
  columns: CsvColumn<T>[],
): void {
  // Build header row
  const headers = columns.map((c) => `"${c.header}"`).join(",");

  // Build data rows
  const rows = data.map((row) =>
    columns
      .map((col) => {
        const val = col.accessor(row);
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      })
      .join(","),
  );

  const csv = [headers, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Key-based API (legacy — used by financials, performance, scorecard, etc.)
// ---------------------------------------------------------------------------

export interface LegacyCsvColumn {
  key: string;
  header: string;
  formatter?: (value: unknown) => string;
}

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function formatCurrencyCSV(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDateCSV(date: string | Date): string {
  return new Date(date).toLocaleDateString("en-AU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce((acc: unknown, part) => {
    if (acc && typeof acc === "object" && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
}

export function exportToCSV(
  data: Record<string, unknown>[],
  filename: string,
  columns?: LegacyCsvColumn[]
): void {
  if (data.length === 0) return;

  const cols: LegacyCsvColumn[] =
    columns || Object.keys(data[0]).map((key) => ({ key, header: key }));

  const headerRow = cols.map((col) => escapeCsvValue(col.header)).join(",");
  const dataRows = data.map((row) =>
    cols
      .map((col) => {
        const rawValue = getNestedValue(row, col.key);
        const formatted = col.formatter ? col.formatter(rawValue) : rawValue;
        return escapeCsvValue(formatted);
      })
      .join(",")
  );

  const csvContent = [headerRow, ...dataRows].join("\n");
  const bom = "\uFEFF";
  const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
