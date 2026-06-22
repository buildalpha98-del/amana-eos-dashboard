/**
 * Branded Amana OSHC PDF export of a scorecard — rendered as a
 * spreadsheet-style table. Rows = measurables. Columns = Owner,
 * Title, Goal, Unit, then one column per week of data (most recent
 * first). Cells are tinted green when on-track for the period, red
 * when off-track, neutral when no entry exists.
 *
 * Landscape A4. If the column count exceeds what fits, the table
 * paginates horizontally — same logic as the V/TO PDF + Accountability
 * PDF: reuses shared `pdf/branding` for the header bar + footer.
 */

import type jsPDF from "jspdf";
import { BRAND, drawLogo } from "@/lib/pdf/branding";

export interface ScorecardEntryForPdf {
  weekOf: string; // ISO date
  value: number;
  onTrack: boolean;
}

export interface ScorecardMeasurableForPdf {
  id: string;
  title: string;
  ownerName: string | null;
  goalValue: number;
  goalDirection: "above" | "below" | "exact" | string;
  unit: string | null;
  entries: ScorecardEntryForPdf[];
}

export interface ScorecardPdfData {
  title: string;
  ownerName: string | null;
  measurables: ScorecardMeasurableForPdf[];
}

const ROW_H = 7;
const HEADER_H = 9;
const COL_GAP = 0.4;

function goalLabel(m: ScorecardMeasurableForPdf): string {
  const op =
    m.goalDirection === "above"
      ? "≥"
      : m.goalDirection === "below"
        ? "≤"
        : "=";
  const v = Number.isInteger(m.goalValue)
    ? String(m.goalValue)
    : m.goalValue.toFixed(1);
  return `${op} ${v}${m.unit ?? ""}`;
}

function fmtWeek(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit" });
}

function fmtValue(v: number, unit: string | null): string {
  const formatted = Number.isInteger(v) ? String(v) : v.toFixed(1);
  if (!unit) return formatted;
  if (unit === "$") return `$${formatted}`;
  if (unit === "%") return `${formatted}%`;
  return `${formatted} ${unit}`;
}

export async function generateScorecardPdf(
  data: ScorecardPdfData,
): Promise<jsPDF> {
  const { default: JsPDF } = await import("jspdf");
  const doc = new JsPDF("l", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth(); // 297
  const pageHeight = doc.internal.pageSize.getHeight(); // 210
  const margin = 12;

  // Collect the union of all weeks across measurables, descending
  // (most recent first).
  const allWeeks = Array.from(
    new Set(
      data.measurables.flatMap((m) => m.entries.map((e) => e.weekOf)),
    ),
  ).sort((a, b) => (a < b ? 1 : -1)); // desc

  // Fixed columns: Owner, Title, Goal, Unit
  const fixedCols = [
    { key: "owner", header: "Owner", width: 30 },
    { key: "title", header: "Measurable", width: 60 },
    { key: "goal", header: "Goal", width: 22 },
  ];
  const fixedWidth =
    fixedCols.reduce((s, c) => s + c.width, 0) + fixedCols.length * COL_GAP;
  const availableForWeeks = pageWidth - margin * 2 - fixedWidth;
  const weekColW = 13; // mm per week column
  const weeksPerPage = Math.max(
    1,
    Math.floor((availableForWeeks + COL_GAP) / (weekColW + COL_GAP)),
  );
  const totalWeekPages = Math.max(1, Math.ceil(allWeeks.length / weeksPerPage));

  const drawHeader = (pageWeeks: string[]) => {
    // Header band
    doc.setFillColor(...BRAND.green.rgb);
    doc.rect(0, 0, pageWidth, 22, "F");
    drawLogo(doc, { x: margin, y: 12, fontSize: 14 });
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.cream.rgb);
    doc.setFont("helvetica", "normal");
    doc.text(`SCORECARD · ${data.title}`, margin, 18);
    doc.setFontSize(8);
    const meta = data.ownerName ? `Owner: ${data.ownerName}` : "";
    const dateStr = new Date().toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    doc.text(
      [meta, dateStr].filter(Boolean).join(" · "),
      pageWidth - margin,
      18,
      { align: "right" },
    );

    // Column headers
    let y = 30;
    let x = margin;
    doc.setFillColor(...BRAND.green.rgb);
    const cols = [
      ...fixedCols,
      ...pageWeeks.map((w) => ({
        key: `week_${w}`,
        header: fmtWeek(w),
        width: weekColW,
      })),
    ];
    const totalRowW = cols.reduce((s, c) => s + c.width, 0) + cols.length * COL_GAP;
    doc.rect(margin, y, totalRowW, HEADER_H, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    for (const col of cols) {
      doc.text(col.header, x + col.width / 2, y + HEADER_H - 3, {
        align: "center",
      });
      x += col.width + COL_GAP;
    }
    return { cols };
  };

  const drawRow = (
    m: ScorecardMeasurableForPdf,
    cols: { key: string; width: number }[],
    pageWeeks: string[],
    y: number,
    alt: boolean,
  ) => {
    if (alt) {
      doc.setFillColor(247, 247, 247);
      doc.rect(
        margin,
        y,
        cols.reduce((s, c) => s + c.width, 0) + cols.length * COL_GAP,
        ROW_H,
        "F",
      );
    }

    let x = margin;
    const entryMap = new Map(m.entries.map((e) => [e.weekOf, e]));

    for (const col of cols) {
      if (col.key === "owner") {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(60, 60, 60);
        const label = m.ownerName ?? "Unassigned";
        doc.text(
          truncate(doc, label, col.width - 2),
          x + 1,
          y + ROW_H - 2.3,
        );
      } else if (col.key === "title") {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(30, 30, 30);
        doc.text(
          truncate(doc, m.title, col.width - 2),
          x + 1,
          y + ROW_H - 2.3,
        );
      } else if (col.key === "goal") {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...BRAND.green.rgb);
        doc.text(goalLabel(m), x + col.width - 1, y + ROW_H - 2.3, {
          align: "right",
        });
      } else if (col.key.startsWith("week_")) {
        const week = col.key.slice(5);
        const entry = entryMap.get(week);
        if (entry) {
          // Tint the cell by status
          doc.setFillColor(
            ...(entry.onTrack
              ? ([220, 252, 231] as const) // emerald-100
              : ([254, 226, 226] as const)), // red-100
          );
          doc.rect(x, y, col.width, ROW_H, "F");
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          doc.setTextColor(
            ...(entry.onTrack
              ? ([6, 95, 70] as const) // emerald-800
              : ([153, 27, 27] as const)), // red-800
          );
          doc.text(
            fmtValue(entry.value, m.unit),
            x + col.width / 2,
            y + ROW_H - 2.3,
            { align: "center" },
          );
        } else {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          doc.setTextColor(180, 180, 180);
          doc.text("—", x + col.width / 2, y + ROW_H - 2.3, {
            align: "center",
          });
        }
      }
      x += col.width + COL_GAP;
    }

    // Bottom rule
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.1);
    doc.line(
      margin,
      y + ROW_H,
      margin + cols.reduce((s, c) => s + c.width, 0) + cols.length * COL_GAP,
      y + ROW_H,
    );
  };

  if (data.measurables.length === 0) {
    drawHeader([]);
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text("No measurables in this scorecard yet.", margin, 50);
  } else {
    for (let p = 0; p < totalWeekPages; p++) {
      if (p > 0) doc.addPage("a4", "l");
      const pageWeeks = allWeeks.slice(
        p * weeksPerPage,
        (p + 1) * weeksPerPage,
      );
      const { cols } = drawHeader(pageWeeks);

      let y = 30 + HEADER_H;
      const rowsPerPage = Math.floor(
        (pageHeight - y - margin - 8) / ROW_H,
      );

      let row = 0;
      for (const m of data.measurables) {
        if (row > 0 && row % rowsPerPage === 0) {
          // Vertical overflow within this week-slice — new page,
          // re-draw the header for the same week columns.
          doc.addPage("a4", "l");
          drawHeader(pageWeeks);
          y = 30 + HEADER_H;
        }
        drawRow(m, cols, pageWeeks, y, row % 2 === 1);
        y += ROW_H;
        row++;
      }
    }
  }

  // ── Footer on every page ──
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(140, 140, 140);
    doc.text(
      "Amana OSHC · Beyond The Bell · Confidential",
      margin,
      pageHeight - 6,
    );
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 6, {
      align: "right",
    });
  }

  return doc;
}

function truncate(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (doc.getTextWidth(text.slice(0, mid) + "…") <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + "…";
}
