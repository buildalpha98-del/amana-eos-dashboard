/**
 * Branded Amana OSHC PDF export of the Accountability Chart, drawn
 * as an actual org chart (boxes + connecting lines) rather than an
 * indented list — matches the on-page OrgChartView's card-and-line
 * layout.
 *
 * Layout:
 *   - Landscape A4 for horizontal room.
 *   - Walk the tree once to compute each subtree's width in
 *     "leaf units"; each leaf = one box width.
 *   - Walk again to place boxes (centred above the union of their
 *     children) and draw connectors: a stub from the parent's
 *     bottom, a horizontal bar across the children, and stubs down
 *     into each child's top.
 *   - If the total chart width or height exceeds the page, scale
 *     the entire drawing uniformly to fit.
 *
 * Each card: green title strip with white text, white body listing
 * assignees ("— vacant —" when none). Responsibilities aren't drawn
 * inside the chart (they'd bloat each card); a compact key/legend
 * section under the chart lists every seat's responsibilities for
 * reference.
 */

import type jsPDF from "jspdf";
import { BRAND, drawLogo } from "@/lib/pdf/branding";

export interface SeatNodeForPdf {
  id: string;
  title: string;
  responsibilities: string[];
  order: number;
  assignees: { id: string; name: string }[];
  children: SeatNodeForPdf[];
}

// ── Layout constants (mm, before any scale-to-fit shrink) ──────────────

const BOX_W = 46;
const BOX_H = 18;
const H_GAP = 4; // gap between sibling subtrees
const V_GAP = 14; // gap between levels (room for connector lines)
const TITLE_BAR_H = 6;

interface PositionedNode {
  node: SeatNodeForPdf;
  /** Centre X (in mm) of this node's box. */
  cx: number;
  /** Top Y (in mm) of this node's box. */
  y: number;
  /** Width occupied by this subtree (in mm). */
  subtreeW: number;
  children: PositionedNode[];
}

/**
 * First pass — compute each subtree's width.
 *   leaf: BOX_W
 *   parent: max(BOX_W, sum(children) + (n-1) * H_GAP)
 */
function measure(node: SeatNodeForPdf): { w: number; childWidths: number[] } {
  if (node.children.length === 0) {
    return { w: BOX_W, childWidths: [] };
  }
  const childWidths = node.children.map((c) => measure(c).w);
  const childrenTotal =
    childWidths.reduce((s, w) => s + w, 0) +
    (childWidths.length - 1) * H_GAP;
  return { w: Math.max(BOX_W, childrenTotal), childWidths };
}

/**
 * Second pass — assign (cx, y) for each node and return a
 * positioned tree.
 *   originLeft: the left edge of this subtree's allotted slot.
 */
function place(
  node: SeatNodeForPdf,
  originLeft: number,
  y: number,
): PositionedNode {
  const { w, childWidths } = measure(node);

  // Centre this node above its children's collective span.
  const cx = originLeft + w / 2;

  const positioned: PositionedNode = {
    node,
    cx,
    y,
    subtreeW: w,
    children: [],
  };

  if (node.children.length > 0) {
    const childrenTotal =
      childWidths.reduce((s, cw) => s + cw, 0) +
      (childWidths.length - 1) * H_GAP;
    // If parent's slot is wider than the children need, centre the
    // children block within the slot — otherwise pack flush left.
    let childLeft = originLeft + Math.max(0, (w - childrenTotal) / 2);
    const childY = y + BOX_H + V_GAP;
    for (let i = 0; i < node.children.length; i++) {
      positioned.children.push(place(node.children[i], childLeft, childY));
      childLeft += childWidths[i] + H_GAP;
    }
  }

  return positioned;
}

function drawCard(
  doc: jsPDF,
  cx: number,
  y: number,
  scale: number,
  node: SeatNodeForPdf,
) {
  const w = BOX_W * scale;
  const h = BOX_H * scale;
  const x = cx - w / 2;
  const titleBarH = TITLE_BAR_H * scale;

  // Card body (white fill, gold border)
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(212, 168, 67); // #D4A843
  doc.setLineWidth(0.4 * scale);
  doc.roundedRect(x, y, w, h, 1.5 * scale, 1.5 * scale, "FD");

  // Title strip
  doc.setFillColor(...BRAND.green.rgb);
  doc.rect(x, y, w, titleBarH, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7 * scale);
  const titleLines = doc.splitTextToSize(node.title, w - 4);
  doc.text(titleLines[0] ?? "", x + 2, y + titleBarH - 1.7 * scale);

  // Assignees
  const assigneeText =
    node.assignees.length > 0
      ? node.assignees.map((a) => a.name).join(", ")
      : "— vacant —";
  doc.setTextColor(50, 50, 50);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5 * scale);
  const assigneeLines = doc.splitTextToSize(assigneeText, w - 4);
  let ty = y + titleBarH + 3 * scale;
  // Up to 3 lines, ellipsis the rest
  const maxLines = Math.max(1, Math.floor((h - titleBarH - 1.5 * scale) / (3 * scale)));
  for (let i = 0; i < Math.min(assigneeLines.length, maxLines); i++) {
    const line =
      i === maxLines - 1 && assigneeLines.length > maxLines
        ? assigneeLines[i].slice(0, -1) + "…"
        : assigneeLines[i];
    doc.text(line, x + 2, ty);
    ty += 3 * scale;
  }
}

function drawConnectors(
  doc: jsPDF,
  parent: PositionedNode,
  offsetX: number,
  offsetY: number,
  scale: number,
) {
  if (parent.children.length === 0) return;

  const parentBottom = (parent.y + BOX_H) * scale + offsetY;
  const childTop = parent.children[0].y * scale + offsetY;
  const midY = (parentBottom + childTop) / 2;
  const parentCx = parent.cx * scale + offsetX;

  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.25 * scale);

  // Parent stub down
  doc.line(parentCx, parentBottom, parentCx, midY);

  // Horizontal bar across all children
  const firstCx = parent.children[0].cx * scale + offsetX;
  const lastCx =
    parent.children[parent.children.length - 1].cx * scale + offsetX;
  if (firstCx !== lastCx) {
    doc.line(firstCx, midY, lastCx, midY);
  }

  // Stubs down into each child
  for (const child of parent.children) {
    const childCx = child.cx * scale + offsetX;
    doc.line(childCx, midY, childCx, child.y * scale + offsetY);
    drawConnectors(doc, child, offsetX, offsetY, scale);
  }
}

function drawNodes(
  doc: jsPDF,
  node: PositionedNode,
  offsetX: number,
  offsetY: number,
  scale: number,
) {
  drawCard(
    doc,
    node.cx * scale + offsetX,
    node.y * scale + offsetY,
    scale,
    node.node,
  );
  for (const child of node.children) {
    drawNodes(doc, child, offsetX, offsetY, scale);
  }
}

/**
 * Flatten the placed tree depth-first so the responsibilities
 * section below the chart reads in chart-walk order.
 */
function flattenForList(positioned: PositionedNode[]): SeatNodeForPdf[] {
  const out: SeatNodeForPdf[] = [];
  const walk = (n: PositionedNode) => {
    out.push(n.node);
    for (const c of n.children) walk(c);
  };
  for (const r of positioned) walk(r);
  return out;
}

export async function generateAccountabilityChartPdf(
  roots: SeatNodeForPdf[],
): Promise<jsPDF> {
  const { default: JsPDF } = await import("jspdf");
  // Landscape A4 — gives us 297mm of horizontal canvas.
  const doc = new JsPDF("l", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth(); // 297
  const pageHeight = doc.internal.pageSize.getHeight(); // 210
  const margin = 12;

  // ── Header band ──
  doc.setFillColor(...BRAND.green.rgb);
  doc.rect(0, 0, pageWidth, 22, "F");
  drawLogo(doc, { x: margin, y: 12, fontSize: 14 });
  doc.setFontSize(9);
  doc.setTextColor(...BRAND.cream.rgb);
  doc.setFont("helvetica", "normal");
  doc.text("ACCOUNTABILITY CHART", margin, 18);
  doc.setFontSize(8);
  doc.text(
    new Date().toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    pageWidth - margin,
    18,
    { align: "right" },
  );

  if (roots.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text("No seats defined yet.", margin, 40);
    return doc;
  }

  // ── Place each root side by side ──
  let cursorLeft = 0;
  const placedRoots: PositionedNode[] = [];
  for (const r of roots) {
    const placed = place(r, cursorLeft, 0);
    placedRoots.push(placed);
    cursorLeft += placed.subtreeW + H_GAP * 2;
  }
  const rawWidth = cursorLeft - H_GAP * 2;

  // Compute height — max depth × (BOX_H + V_GAP) − V_GAP
  const depth = (n: SeatNodeForPdf): number =>
    n.children.length === 0
      ? 1
      : 1 + Math.max(...n.children.map(depth));
  const maxDepth = Math.max(...roots.map(depth));
  const rawHeight = maxDepth * BOX_H + (maxDepth - 1) * V_GAP;

  // ── Scale so the whole chart fits in the page (with chart band) ──
  const chartTop = 30; // below the header band
  const chartBottom = pageHeight - margin - 8; // leave footer room
  const chartAvailW = pageWidth - margin * 2;
  const chartAvailH = chartBottom - chartTop;
  const scale = Math.min(
    1,
    chartAvailW / rawWidth,
    chartAvailH / rawHeight,
  );

  // Centre horizontally on the page
  const offsetX = (pageWidth - rawWidth * scale) / 2;
  const offsetY = chartTop;

  // Draw connectors first (so cards sit on top)
  for (const root of placedRoots) {
    drawConnectors(doc, root, offsetX, offsetY, scale);
  }
  for (const root of placedRoots) {
    drawNodes(doc, root, offsetX, offsetY, scale);
  }

  // ── Footer ──
  doc.setFontSize(7);
  doc.setTextColor(140, 140, 140);
  doc.text(
    "Amana OSHC · Beyond The Bell · Confidential",
    margin,
    pageHeight - 6,
  );
  doc.text("Page 1 of 1", pageWidth - margin, pageHeight - 6, {
    align: "right",
  });

  // ── Responsibilities reference page(s) ──
  const seatsWithResp = flattenForList(placedRoots).filter(
    (s) => s.responsibilities.length > 0,
  );
  if (seatsWithResp.length > 0) {
    doc.addPage("a4", "p");
    const portraitWidth = doc.internal.pageSize.getWidth();
    const portraitHeight = doc.internal.pageSize.getHeight();
    doc.setFillColor(...BRAND.green.rgb);
    doc.rect(0, 0, portraitWidth, 22, "F");
    drawLogo(doc, { x: margin, y: 12, fontSize: 14 });
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.cream.rgb);
    doc.text("RESPONSIBILITIES BY SEAT", margin, 18);

    let y = 32;
    for (const seat of seatsWithResp) {
      // Page break check
      if (y > portraitHeight - 30) {
        doc.addPage("a4", "p");
        y = margin + 8;
      }
      // Seat title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...BRAND.green.rgb);
      const titleLines = doc.splitTextToSize(
        seat.title,
        portraitWidth - margin * 2,
      );
      doc.text(titleLines, margin, y);
      y += titleLines.length * 5 + 1;

      // Assignees
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(110, 110, 110);
      const assigneeLabel =
        seat.assignees.length > 0
          ? seat.assignees.map((a) => a.name).join(", ")
          : "— vacant —";
      doc.text(assigneeLabel, margin, y);
      y += 5;

      // Bullets
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(40, 40, 40);
      for (const r of seat.responsibilities) {
        const lines = doc.splitTextToSize(
          `• ${r}`,
          portraitWidth - margin * 2 - 3,
        );
        if (y + lines.length * 4 > portraitHeight - 20) {
          doc.addPage("a4", "p");
          y = margin + 8;
        }
        doc.text(lines, margin + 3, y);
        y += lines.length * 4;
      }

      y += 4;
    }

    // Footer on every responsibilities page
    const totalPages = doc.getNumberOfPages();
    for (let i = 2; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(140, 140, 140);
      const w = doc.internal.pageSize.getWidth();
      const h = doc.internal.pageSize.getHeight();
      doc.text(
        "Amana OSHC · Beyond The Bell · Confidential",
        margin,
        h - 6,
      );
      doc.text(`Page ${i} of ${totalPages}`, w - margin, h - 6, {
        align: "right",
      });
    }
    // Update first page footer to reflect total
    doc.setPage(1);
    doc.setFontSize(7);
    doc.setFillColor(255, 255, 255);
    doc.rect(pageWidth - margin - 30, pageHeight - 10, 30, 6, "F");
    doc.setTextColor(140, 140, 140);
    doc.text(`Page 1 of ${totalPages}`, pageWidth - margin, pageHeight - 6, {
      align: "right",
    });
  }

  return doc;
}
