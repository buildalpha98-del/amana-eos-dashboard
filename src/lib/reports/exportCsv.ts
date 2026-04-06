import { NextResponse } from "next/server";

export function generateCsv(
  headers: string[],
  rows: (string | number | null | undefined)[][],
): string {
  const escape = (val: string | number | null | undefined): string => {
    if (val == null) return "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerLine = headers.map(escape).join(",");
  const dataLines = rows.map((row) => row.map(escape).join(","));

  return [headerLine, ...dataLines].join("\n");
}

export function downloadCsvResponse(csv: string, filename: string): NextResponse {
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
    },
  });
}
