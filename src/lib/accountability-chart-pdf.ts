/**
 * Branded Amana OSHC PDF export of the full Accountability Chart.
 *
 * Walks the seat tree depth-first and renders each seat as a card:
 *   - title (Midnight Green, bold, sized by depth)
 *   - assignee names (one line, "—" if vacant)
 *   - responsibilities as bullets
 * Children are indented by depth so the hierarchy reads at a glance.
 *
 * Matches the V/TO PDF brand pattern via `pdf/branding`.
 */

import type jsPDF from "jspdf";
import { BRAND, drawLogo, createPdfBuilder } from "@/lib/pdf/branding";

export interface SeatNodeForPdf {
  id: string;
  title: string;
  responsibilities: string[];
  order: number;
  assignees: { id: string; name: string }[];
  children: SeatNodeForPdf[];
}

export async function generateAccountabilityChartPdf(
  roots: SeatNodeForPdf[],
): Promise<jsPDF> {
  const { default: JsPDF } = await import("jspdf");
  const doc = new JsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;

  // ── Header band ──
  doc.setFillColor(...BRAND.green.rgb);
  doc.rect(0, 0, pageWidth, 32, "F");
  drawLogo(doc, { x: margin, y: 14, fontSize: 18 });

  doc.setFontSize(10);
  doc.setTextColor(...BRAND.cream.rgb);
  doc.setFont("helvetica", "normal");
  doc.text("ACCOUNTABILITY CHART", margin, 22);

  doc.setFontSize(8);
  doc.text(
    new Date().toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    pageWidth - margin,
    22,
    { align: "right" },
  );

  const b = createPdfBuilder(doc, { margin });
  b.y = 40;

  if (roots.length === 0) {
    b.heading("ACCOUNTABILITY CHART");
    b.paragraph("No seats defined yet.");
  } else {
    for (const root of roots) {
      drawSeat(doc, b, root, 0, margin, contentWidth);
    }
  }

  // ── Footer ──
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(140, 140, 140);
    doc.text(
      "Amana OSHC · Beyond The Bell · Confidential",
      margin,
      290,
    );
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, 290, {
      align: "right",
    });
  }

  return doc;
}

function drawSeat(
  doc: jsPDF,
  b: ReturnType<typeof createPdfBuilder>,
  seat: SeatNodeForPdf,
  depth: number,
  margin: number,
  fullContentWidth: number,
) {
  const indent = depth * 8;
  const x = margin + indent;
  const contentWidth = fullContentWidth - indent;

  // Estimate space needed: title + assignees + each responsibility line.
  // We accept that long responsibility lists may still split across
  // pages — the title block is what we keep together.
  const minBlock = 16 + seat.responsibilities.length * 4;
  b.checkPage(Math.min(minBlock, 60));

  // Title pill
  const titleFontSize = depth === 0 ? 12 : depth === 1 ? 11 : 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(titleFontSize);
  doc.setTextColor(...BRAND.green.rgb);
  const titleLines = doc.splitTextToSize(seat.title, contentWidth);
  doc.text(titleLines, x, b.y);
  b.y += titleLines.length * (titleFontSize * 0.45) + 1;

  // Assignees
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  const assigneeLabel =
    seat.assignees.length > 0
      ? seat.assignees.map((a) => a.name).join(", ")
      : "— vacant —";
  const assigneeLines = doc.splitTextToSize(assigneeLabel, contentWidth);
  doc.text(assigneeLines, x, b.y);
  b.y += assigneeLines.length * 4 + 1;

  // Responsibilities
  if (seat.responsibilities.length > 0) {
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    for (const r of seat.responsibilities) {
      b.checkPage(5);
      const lines = doc.splitTextToSize(`• ${r}`, contentWidth - 3);
      doc.text(lines, x + 2, b.y);
      b.y += lines.length * 3.8;
    }
  }

  b.y += 3;

  // Children
  for (const child of seat.children) {
    drawSeat(doc, b, child, depth + 1, margin, fullContentWidth);
  }
}
