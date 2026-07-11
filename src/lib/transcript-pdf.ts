import type jsPDF from "jspdf";
import { BRAND, drawLogo, createPdfBuilder } from "@/lib/pdf/branding";

export interface TranscriptRow {
  courseTitle: string;
  track: string;
  status: string;
  completedAt: string | null;
  score: number | null;
}

// Matches createPdfBuilder's default pageBreakAtY (pdf/branding.ts) — the
// A4-portrait break line the shared builder uses.
const PAGE_BREAK_Y = 275;

export interface TranscriptOptions {
  learnerName: string;
  learnerEmail?: string | null;
  generatedAt: string;
  rows: TranscriptRow[];
}

function fmt(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleDateString("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
}

function statusLabel(status: string): string {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Branded A4-portrait training transcript — a staff member's full LMS record
 * (every enrolment, status, completion date, score). For admin evidence /
 * compliance. Returns the jsPDF doc.
 */
export async function generateTranscriptPdf(
  options: TranscriptOptions,
): Promise<jsPDF> {
  const { default: JsPDF } = await import("jspdf");
  const doc = new JsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 18;

  // ── Header bar ──
  doc.setFillColor(...BRAND.green.rgb);
  doc.rect(0, 0, pageWidth, 32, "F");
  drawLogo(doc, { x: margin, y: 14, fontSize: 16 });
  doc.setFontSize(9);
  doc.setTextColor(...BRAND.cream.rgb);
  doc.text("TRAINING TRANSCRIPT", margin, 23);
  doc.setFontSize(8);
  doc.text(
    new Date(options.generatedAt).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    pageWidth - margin,
    23,
    { align: "right" },
  );

  const b = createPdfBuilder(doc, { margin });
  b.y = 44;

  // ── Learner identity ──
  doc.setTextColor(...BRAND.green.rgb);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(options.learnerName, margin, b.y);
  b.y += 6;
  if (options.learnerEmail) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(110, 110, 110);
    doc.text(options.learnerEmail, margin, b.y);
    b.y += 6;
  }

  // ── Summary line ──
  const completed = options.rows.filter((r) => r.status === "completed").length;
  b.y += 2;
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.text(
    `${completed} of ${options.rows.length} courses completed`,
    margin,
    b.y,
  );
  b.y += 8;

  // ── Table header ──
  const contentWidth = pageWidth - margin * 2;
  const cols = [
    { label: "Course", w: 0.4 },
    { label: "Track", w: 0.14 },
    { label: "Status", w: 0.16 },
    { label: "Completed", w: 0.18 },
    { label: "Score", w: 0.12 },
  ];
  const drawHeader = () => {
    doc.setFillColor(...BRAND.green.rgb);
    doc.rect(margin, b.y, contentWidth, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    let x = margin + 2;
    for (const c of cols) {
      doc.text(c.label, x, b.y + 5.5);
      x += c.w * contentWidth;
    }
    b.y += 10;
  };
  drawHeader();

  // ── Rows ──
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  options.rows.forEach((r, i) => {
    if (b.y > PAGE_BREAK_Y) {
      doc.addPage();
      b.y = margin;
      drawHeader();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
    }
    if (i % 2 === 0) {
      doc.setFillColor(245, 247, 247);
      doc.rect(margin, b.y - 4, contentWidth, 8, "F");
    }
    const cells = [
      r.courseTitle,
      r.track,
      statusLabel(r.status),
      fmt(r.completedAt),
      typeof r.score === "number" ? `${Math.round(r.score)}%` : r.status === "completed" ? "Pass" : "—",
    ];
    doc.setTextColor(
      r.status === "completed" ? 22 : 40,
      r.status === "completed" ? 101 : 40,
      r.status === "completed" ? 52 : 40,
    );
    let x = margin + 2;
    cells.forEach((cell, ci) => {
      const maxW = cols[ci].w * contentWidth - 3;
      const lines: string[] = doc.splitTextToSize(String(cell), maxW);
      // Single-line cells: mark truncation visibly — this is an official
      // record, so a cut-off course title must never look complete.
      let line = lines[0] ?? "";
      if (lines.length > 1) line = `${line.slice(0, -1)}…`;
      doc.text(line, x, b.y + 1);
      x += cols[ci].w * contentWidth;
    });
    b.y += 8;
  });

  if (options.rows.length === 0) {
    doc.setTextColor(120, 120, 120);
    doc.setFont("helvetica", "italic");
    doc.text("No training enrolments on record.", margin, b.y + 2);
  }

  // ── Footer ──
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text(
    "Amana OSHC — generated from the EOS Dashboard LMS. This is an official record of training completion.",
    margin,
    290,
  );

  return doc;
}

/** Convenience: build + trigger a browser download. */
export async function downloadTranscript(
  options: TranscriptOptions,
): Promise<void> {
  const doc = await generateTranscriptPdf(options);
  const safe = options.learnerName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  doc.save(`training-transcript-${safe}.pdf`);
}
