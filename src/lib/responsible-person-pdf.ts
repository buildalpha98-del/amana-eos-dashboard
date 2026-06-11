/**
 * Branded PDF export for the responsible-person register.
 *
 * Renders a chronological table (Date · Day · Session · Responsible Person ·
 * Position · On · Off) for an arbitrary date range, paginating with a
 * repeated header. Range-capable so the whole April→now backfill span can
 * come out as one document for the Department of Education, while the
 * on-screen UI stays a simple weekly grid.
 *
 * Mirrors the other Amana PDF generators (`report-pdf`, `enrolment-pdf`) —
 * dynamic jsPDF import, shared `@/lib/pdf/branding` identity.
 *
 * 2026-06-11: introduced with the RP register.
 */

import type jsPDF from "jspdf";
import { BRAND, drawLogo } from "@/lib/pdf/branding";
import { RP_SESSION_SHORT, type RpSessionType } from "@/lib/responsible-person";

export interface RpPdfRow {
  date: string; // YYYY-MM-DD
  sessionType: RpSessionType;
  personName: string;
  personRole: string | null;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
}

export interface ResponsiblePersonPdfOptions {
  serviceName: string;
  serviceCode?: string | null;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  rows: RpPdfRow[]; // pre-sorted chronological
  /** ISO timestamp for the "Generated …" stamp. Defaults to now. */
  generatedAt?: string;
}

const COLS = [
  { key: "date", label: "Date", w: 26 },
  { key: "day", label: "Day", w: 16 },
  { key: "session", label: "Session", w: 20 },
  { key: "person", label: "Responsible Person", w: 50 },
  { key: "role", label: "Position", w: 34 },
  { key: "on", label: "On", w: 18 },
  { key: "off", label: "Off", w: 18 },
] as const;

const TABLE_W = COLS.reduce((s, c) => s + c.w, 0);

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function fmtDay(iso: string): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-AU", {
    weekday: "short",
    timeZone: "UTC",
  });
}

export async function generateResponsiblePersonPdf(
  options: ResponsiblePersonPdfOptions,
): Promise<jsPDF> {
  const { default: JsPDF } = await import("jspdf");
  const doc = new JsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;

  // ── Header bar ──
  doc.setFillColor(...BRAND.green.rgb);
  doc.rect(0, 0, pageWidth, 30, "F");
  drawLogo(doc, { x: margin, y: 13, fontSize: 16 });
  doc.setFontSize(10);
  doc.setTextColor(...BRAND.cream.rgb);
  doc.text("RESPONSIBLE PERSON REGISTER", margin, 22);

  const generated = options.generatedAt
    ? new Date(options.generatedAt)
    : new Date();
  doc.setFontSize(8);
  doc.text(
    `Generated ${generated.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })}`,
    pageWidth - margin,
    22,
    { align: "right" },
  );

  // ── Title block ──
  let y = 38;
  doc.setTextColor(...BRAND.green.rgb);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(options.serviceName, margin, y);
  y += 6;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(90, 90, 90);
  const codeBit = options.serviceCode ? `${options.serviceCode} · ` : "";
  doc.text(`${codeBit}${fmtDate(options.from)} – ${fmtDate(options.to)}`, margin, y);
  y += 4.5;
  doc.setFontSize(7.5);
  doc.text(
    "Designated responsible person working directly with children, per session (National Quality Framework).",
    margin,
    y,
  );
  y += 6;

  // ── Table ──
  const rowH = 7;
  const headerH = 8;

  const drawHeader = () => {
    doc.setFillColor(...BRAND.green.rgb);
    doc.rect(margin, y, TABLE_W, headerH, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    let x = margin;
    for (const c of COLS) {
      doc.text(c.label, x + 2, y + 5.5);
      x += c.w;
    }
    y += headerH;
  };

  drawHeader();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  if (options.rows.length === 0) {
    doc.setTextColor(120, 120, 120);
    doc.text(
      "No designated responsible persons recorded for this period.",
      margin + 2,
      y + 5,
    );
    y += rowH;
  }

  let zebra = false;
  for (const row of options.rows) {
    if (y + rowH > pageHeight - margin - 12) {
      doc.addPage();
      y = margin;
      drawHeader();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      zebra = false;
    }
    if (zebra) {
      doc.setFillColor(245, 247, 248);
      doc.rect(margin, y, TABLE_W, rowH, "F");
    }
    zebra = !zebra;

    const cells: Record<string, string> = {
      date: fmtDate(row.date),
      day: fmtDay(row.date),
      session: RP_SESSION_SHORT[row.sessionType],
      person: row.personName,
      role: row.personRole ?? "—",
      on: row.startTime,
      off: row.endTime,
    };
    doc.setTextColor(30, 30, 30);
    let x = margin;
    for (const c of COLS) {
      const raw = cells[c.key] ?? "";
      const clipped = (doc.splitTextToSize(raw, c.w - 3)[0] as string) ?? raw;
      doc.text(String(clipped), x + 2, y + 4.8);
      x += c.w;
    }
    doc.setDrawColor(225, 228, 230);
    doc.line(margin, y + rowH, margin + TABLE_W, y + rowH);
    y += rowH;
  }

  // ── Footer note ──
  if (y + 14 > pageHeight - margin) {
    doc.addPage();
    y = margin;
  }
  y += 6;
  doc.setFontSize(7);
  doc.setTextColor(140, 140, 140);
  doc.text(
    "Amana OSHC — generated from the EOS dashboard responsible-person register. Exactly one designated responsible person is recorded per session.",
    margin,
    y,
  );

  return doc;
}
