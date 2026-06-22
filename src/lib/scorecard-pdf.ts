/**
 * Branded Amana OSHC PDF export of a scorecard — landscape A4 table.
 * Rows = measurables, columns = recent weeks (most recent first),
 * cells tinted green when the entry is on-track, red when off-track.
 */

import type jsPDF from "jspdf";
import { BRAND, drawLogo } from "@/lib/pdf/branding";

export interface ScorecardEntryForPdf {
  weekOf: string;
  value: number;
  onTrack: boolean;
}

export interface ScorecardMeasurableForPdf {
  id: string;
  title: string;
  ownerName: string | null;
  goalValue: number;
  goalDirection: string;
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
const OWNER_W = 30;
const TITLE_W = 60;
const GOAL_W = 22;
const WEEK_W = 13;

function fmtGoal(m: ScorecardMeasurableForPdf): string {
  const op = m.goalDirection === "above" ? "≥" : m.goalDirection === "below" ? "≤" : "=";
  const v = Number.isInteger(m.goalValue) ? String(m.goalValue) : m.goalValue.toFixed(1);
  return `${op} ${v}${m.unit ?? ""}`;
}

function fmtWeek(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit" });
}

function fmtValue(v: number, unit: string | null): string {
  const s = Number.isInteger(v) ? String(v) : v.toFixed(1);
  if (!unit) return s;
  if (unit === "$") return `$${s}`;
  if (unit === "%") return `${s}%`;
  return `${s} ${unit}`;
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

export async function generateScorecardPdf(data: ScorecardPdfData): Promise<jsPDF> {
  const { default: JsPDF } = await import("jspdf");
  const doc = new JsPDF("l", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;

  const allWeeks = Array.from(
    new Set(data.measurables.flatMap((m) => m.entries.map((e) => e.weekOf))),
  ).sort().reverse();

  const fixedW = OWNER_W + TITLE_W + GOAL_W;
  const availableForWeeks = pageWidth - margin * 2 - fixedW;
  const weeksPerPage = Math.max(1, Math.floor(availableForWeeks / WEEK_W));
  const totalPages = Math.max(1, Math.ceil(allWeeks.length / weeksPerPage));

  function drawPageHeader(pageWeeks: string[]) {
    doc.setFillColor(...BRAND.green.rgb);
    doc.rect(0, 0, pageWidth, 22, "F");
    drawLogo(doc, { x: margin, y: 12, fontSize: 14 });
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.cream.rgb);
    doc.setFont("helvetica", "normal");
    doc.text(`SCORECARD · ${data.title}`, margin, 18);
    doc.setFontSize(8);
    const today = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
    doc.text(data.ownerName ? `Owner: ${data.ownerName} · ${today}` : today, pageWidth - margin, 18, { align: "right" });

    // Column header row
    doc.setFillColor(...BRAND.green.rgb);
    const y = 30;
    const totalW = fixedW + pageWeeks.length * WEEK_W;
    doc.rect(margin, y, totalW, HEADER_H, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);

    doc.text("Owner", margin + OWNER_W / 2, y + 6, { align: "center" });
    doc.text("Measurable", margin + OWNER_W + TITLE_W / 2, y + 6, { align: "center" });
    doc.text("Goal", margin + OWNER_W + TITLE_W + GOAL_W / 2, y + 6, { align: "center" });
    let wx = margin + fixedW;
    for (const wk of pageWeeks) {
      doc.text(fmtWeek(wk), wx + WEEK_W / 2, y + 6, { align: "center" });
      wx += WEEK_W;
    }
  }

  function drawRow(m: ScorecardMeasurableForPdf, pageWeeks: string[], y: number, alt: boolean) {
    const totalW = fixedW + pageWeeks.length * WEEK_W;
    if (alt) {
      doc.setFillColor(247, 247, 247);
      doc.rect(margin, y, totalW, ROW_H, "F");
    }

    // Owner
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);
    doc.text(truncate(doc, m.ownerName ?? "Unassigned", OWNER_W - 2), margin + 1, y + ROW_H - 2.3);

    // Title
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 30);
    doc.text(truncate(doc, m.title, TITLE_W - 2), margin + OWNER_W + 1, y + ROW_H - 2.3);

    // Goal
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...BRAND.green.rgb);
    doc.text(fmtGoal(m), margin + OWNER_W + TITLE_W + GOAL_W - 1, y + ROW_H - 2.3, { align: "right" });

    // Week cells
    const entryMap = new Map<string, ScorecardEntryForPdf>();
    for (const e of m.entries) entryMap.set(e.weekOf, e);

    let wx = margin + fixedW;
    for (const wk of pageWeeks) {
      const entry = entryMap.get(wk);
      if (entry) {
        if (entry.onTrack) {
          doc.setFillColor(220, 252, 231);
        } else {
          doc.setFillColor(254, 226, 226);
        }
        doc.rect(wx, y, WEEK_W, ROW_H, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        if (entry.onTrack) {
          doc.setTextColor(6, 95, 70);
        } else {
          doc.setTextColor(153, 27, 27);
        }
        doc.text(fmtValue(entry.value, m.unit), wx + WEEK_W / 2, y + ROW_H - 2.3, { align: "center" });
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(180, 180, 180);
        doc.text("—", wx + WEEK_W / 2, y + ROW_H - 2.3, { align: "center" });
      }
      wx += WEEK_W;
    }

    // Bottom rule
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.1);
    doc.line(margin, y + ROW_H, margin + totalW, y + ROW_H);
  }

  if (data.measurables.length === 0) {
    drawPageHeader([]);
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text("No measurables in this scorecard yet.", margin, 50);
  } else {
    for (let p = 0; p < totalPages; p++) {
      if (p > 0) doc.addPage("a4", "l");
      const pageWeeks = allWeeks.slice(p * weeksPerPage, (p + 1) * weeksPerPage);
      drawPageHeader(pageWeeks);

      let y = 30 + HEADER_H;
      const rowsPerPage = Math.floor((pageHeight - y - margin - 8) / ROW_H);
      let row = 0;
      for (const m of data.measurables) {
        if (row > 0 && row % rowsPerPage === 0) {
          doc.addPage("a4", "l");
          drawPageHeader(pageWeeks);
          y = 30 + HEADER_H;
        }
        drawRow(m, pageWeeks, y, row % 2 === 1);
        y += ROW_H;
        row++;
      }
    }
  }

  // Footer on every page
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(140, 140, 140);
    doc.text("Amana OSHC · Beyond The Bell · Confidential", margin, pageHeight - 6);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 6, { align: "right" });
  }

  return doc;
}
