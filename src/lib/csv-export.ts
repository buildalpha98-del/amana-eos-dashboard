export interface CsvColumn {
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
  columns?: CsvColumn[]
): void {
  if (data.length === 0) return;

  const cols: CsvColumn[] =
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
