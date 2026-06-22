/**
 * Branded Amana OSHC PDF export of the quarter's rocks.
 *
 * Two sections — Completed (top) then In Progress (On Track,
 * Off Track) — with Dropped appended last when present. Each row is
 * one line: title · owner · % complete · status pill.
 *
 * Same shared brand pattern as the V/TO + Accountability Chart PDFs.
 */

import type jsPDF from "jspdf";
import { BRAND, drawLogo, createPdfBuilder } from "@/lib/pdf/branding";

export interface RockForPdf {
  id: string;
  title: string;
  owner: { name: string } | null;
  quarter: string;
  status: string; // "on_track" | "off_track" | "complete" | "dropped"
  percentComplete: number;
  priority: string;
}

export async function generateRocksPdf(
  rocks: RockForPdf[],
  quarter: string,
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
  doc.text(`ROCKS · ${quarter.replace(/-/g, " ")}`, margin, 22);

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

  const completed = rocks.filter((r) => r.status === "complete");
  const active = rocks.filter(
    (r) => r.status === "on_track" || r.status === "off_track",
  );
  const dropped = rocks.filter((r) => r.status === "dropped");

  // ── Summary strip ──
  doc.setFillColor(245, 245, 245);
  doc.rect(margin, b.y, contentWidth, 14, "F");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.setFont("helvetica", "normal");
  const summary = `${rocks.length} rock${rocks.length === 1 ? "" : "s"} this quarter — ${completed.length} complete, ${active.length} in progress${dropped.length ? `, ${dropped.length} dropped` : ""}`;
  doc.text(summary, margin + 3, b.y + 6);
  const avg =
    rocks.length > 0
      ? Math.round(rocks.reduce((s, r) => s + r.percentComplete, 0) / rocks.length)
      : 0;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BRAND.green.rgb);
  doc.text(`Avg ${avg}%`, pageWidth - margin - 3, b.y + 6, { align: "right" });
  b.y += 18;

  // ── Completed ──
  b.heading("COMPLETED");
  if (completed.length === 0) {
    doc.setFontSize(9);
    doc.setTextColor(140, 140, 140);
    doc.setFont("helvetica", "italic");
    doc.text("— none yet —", margin, b.y);
    b.y += 8;
  } else {
    for (const r of completed) drawRock(doc, b, r, margin, contentWidth);
    b.y += 2;
  }

  // ── In progress ──
  b.heading("IN PROGRESS");
  if (active.length === 0) {
    doc.setFontSize(9);
    doc.setTextColor(140, 140, 140);
    doc.setFont("helvetica", "italic");
    doc.text("— none —", margin, b.y);
    b.y += 8;
  } else {
    for (const r of active) drawRock(doc, b, r, margin, contentWidth);
  }

  // ── Dropped ──
  if (dropped.length > 0) {
    b.y += 2;
    b.heading("DROPPED");
    for (const r of dropped) drawRock(doc, b, r, margin, contentWidth);
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

function drawRock(
  doc: jsPDF,
  b: ReturnType<typeof createPdfBuilder>,
  rock: RockForPdf,
  margin: number,
  contentWidth: number,
) {
  b.checkPage(10);

  // Status pill — right-aligned
  const pillW = 22;
  const pillX = margin + contentWidth - pillW;
  const pillColor = statusFill(rock.status);
  doc.setFillColor(...pillColor);
  doc.roundedRect(pillX, b.y - 3.5, pillW, 5, 1, 1, "F");
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(statusLabel(rock.status), pillX + pillW / 2, b.y, {
    align: "center",
  });

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  const titleMaxW = contentWidth - pillW - 30; // leave room for pill + percent
  const titleLines = doc.splitTextToSize(rock.title, titleMaxW);
  doc.text(titleLines[0], margin, b.y);

  // Percent (between title and pill)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...BRAND.green.rgb);
  doc.text(`${rock.percentComplete}%`, pillX - 3, b.y, { align: "right" });

  // Owner line (smaller, below title)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  const owner = rock.owner?.name || "Unassigned";
  doc.text(owner, margin, b.y + 4);

  b.y += 9;

  // Continuation lines for wrapped title
  if (titleLines.length > 1) {
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    for (let i = 1; i < titleLines.length; i++) {
      b.checkPage(5);
      doc.text(titleLines[i], margin, b.y);
      b.y += 4;
    }
  }

  // Thin divider
  doc.setDrawColor(230, 230, 230);
  doc.setLineWidth(0.2);
  doc.line(margin, b.y, margin + contentWidth, b.y);
  b.y += 2;
}

function statusLabel(status: string): string {
  switch (status) {
    case "complete":
      return "DONE";
    case "on_track":
      return "ON TRACK";
    case "off_track":
      return "OFF TRACK";
    case "dropped":
      return "DROPPED";
    default:
      return status.toUpperCase();
  }
}

function statusFill(status: string): readonly [number, number, number] {
  switch (status) {
    case "complete":
      return [16, 122, 87];
    case "on_track":
      return [16, 122, 87];
    case "off_track":
      return [192, 38, 38];
    case "dropped":
      return [140, 140, 140];
    default:
      return [110, 110, 110];
  }
}
