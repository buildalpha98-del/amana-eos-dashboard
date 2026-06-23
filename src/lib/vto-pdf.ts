/**
 * Branded Amana OSHC PDF export of the full V/TO (Vision / Traction
 * Organiser). One document, top-to-bottom: Core Values, Core Purpose,
 * Core Niche, 10-Year Target (BHAG), 3-Year Picture, 1-Year Goals
 * (with rocks under each), and the four-part Go to Market Strategy.
 *
 * Matches the report-pdf / enrolment-pdf brand pattern via the shared
 * `branding` module — Midnight Green header, Jonquil + white logo,
 * the standard heading / paragraph helpers.
 */

import type jsPDF from "jspdf";
import { BRAND, drawLogo, createPdfBuilder } from "@/lib/pdf/branding";

export interface VtoPdfData {
  coreValues: string[];
  corePurpose: string | null;
  coreNiche: string | null;
  tenYearTarget: string | null;
  threeYearPicture: string | null;
  threeYearFutureDate: string | null;
  threeYearRevenue: string | null;
  threeYearProfit: string | null;
  threeYearMeasurables: string | null;
  threeYearLooksLike: string | null;
  oneYearFutureDate: string | null;
  oneYearRevenue: string | null;
  oneYearProfit: string | null;
  oneYearMeasurables: string | null;
  marketingStrategy: string | null;
  gtmTargetMarket: string | null;
  gtmThreeUniques: string | null;
  gtmProvenProcess: string | null;
  gtmGuarantee: string | null;
  sectionLabels: Record<string, string> | null;
  updatedAt: string;
  updatedBy: { name: string } | null;
  oneYearGoals: Array<{
    title: string;
    description: string | null;
    targetDate: string | null;
    status: string;
    smart: boolean;
    rocks: Array<{ title: string; status: string; percentComplete: number }>;
  }>;
}

export async function generateVtoPdf(data: VtoPdfData): Promise<jsPDF> {
  const { default: JsPDF } = await import("jspdf");
  const doc = new JsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 18;

  // ── Header band ──
  doc.setFillColor(...BRAND.green.rgb);
  doc.rect(0, 0, pageWidth, 32, "F");
  drawLogo(doc, { x: margin, y: 14, fontSize: 18 });

  doc.setFontSize(10);
  doc.setTextColor(...BRAND.cream.rgb);
  doc.setFont("helvetica", "normal");
  doc.text("VISION / TRACTION ORGANISER", margin, 22);

  doc.setFontSize(8);
  const updatedLine = data.updatedBy
    ? `Last updated ${formatDate(data.updatedAt)} · ${data.updatedBy.name}`
    : `Last updated ${formatDate(data.updatedAt)}`;
  doc.text(updatedLine, pageWidth - margin, 22, { align: "right" });

  const b = createPdfBuilder(doc, { margin });
  b.y = 40;

  const label = (key: string, fallback: string) =>
    data.sectionLabels?.[key] ?? fallback;

  // ── Core Values ──
  b.heading("CORE VALUES");
  if (data.coreValues.length === 0) {
    b.paragraph("— not set —");
  } else {
    for (const v of data.coreValues) {
      b.checkPage(6);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...BRAND.green.rgb);
      doc.text("•", margin, b.y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 30, 30);
      const lines = doc.splitTextToSize(v, pageWidth - margin * 2 - 6);
      doc.text(lines, margin + 5, b.y);
      b.y += lines.length * 5 + 1;
    }
    b.y += 2;
  }

  // ── Core Purpose ──
  b.heading(label("corePurpose", "CORE PURPOSE"));
  b.paragraph(data.corePurpose || "— not set —");

  // ── Core Niche ──
  b.heading(label("coreNiche", "CORE NICHE"));
  b.paragraph(data.coreNiche || "— not set —");

  // ── 10-Year Target ──
  b.heading(label("tenYearTarget", "10-YEAR TARGET (BHAG)"));
  b.paragraph(data.tenYearTarget || "— not set —");

  // ── 3-Year Picture ──
  b.heading(label("threeYearPicture", "3-YEAR PICTURE"));
  if (data.threeYearFutureDate) {
    const d = (() => {
      try {
        return new Date(data.threeYearFutureDate).toLocaleDateString("en-AU", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });
      } catch {
        return data.threeYearFutureDate ?? "";
      }
    })();
    b.row("Future Date:", d);
  }
  if (data.threeYearRevenue) b.row("Revenue:", data.threeYearRevenue);
  if (data.threeYearProfit) b.row("Profit:", data.threeYearProfit);

  const renderBullets = (label: string, raw: string | null) => {
    if (!raw) return;
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    b.checkPage(8 + lines.length * 5);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80, 80, 80);
    doc.text(label, margin, b.y);
    b.y += 5;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(40, 40, 40);
    for (const line of lines) {
      const wrapped = doc.splitTextToSize(`• ${line}`, pageWidth - margin * 2 - 6);
      doc.text(wrapped, margin + 3, b.y);
      b.y += wrapped.length * 4.5;
    }
    b.y += 2;
  };
  renderBullets("Measurables", data.threeYearMeasurables);
  renderBullets("What Does It Look Like?", data.threeYearLooksLike);

  // Legacy freeform text — only show if populated and no structured
  // data has been entered yet.
  const hasStructured =
    data.threeYearFutureDate ||
    data.threeYearRevenue ||
    data.threeYearProfit ||
    data.threeYearMeasurables ||
    data.threeYearLooksLike;
  if (!hasStructured && data.threeYearPicture) {
    b.paragraph(data.threeYearPicture);
  }

  // ── 1-Year Plan ──
  b.heading(label("oneYearPlan", "1-YEAR PLAN"));
  if (data.oneYearFutureDate) {
    const d = (() => {
      try {
        return new Date(data.oneYearFutureDate).toLocaleDateString("en-AU", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });
      } catch {
        return data.oneYearFutureDate ?? "";
      }
    })();
    b.row("Future Date:", d);
  }
  if (data.oneYearRevenue) b.row("Revenue:", data.oneYearRevenue);
  if (data.oneYearProfit) b.row("Profit:", data.oneYearProfit);
  if (data.oneYearMeasurables) {
    const lines = data.oneYearMeasurables.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length > 0) {
      b.checkPage(8 + lines.length * 5);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(80, 80, 80);
      doc.text("Measurables", margin, b.y);
      b.y += 5;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(40, 40, 40);
      for (const line of lines) {
        const wrapped = doc.splitTextToSize(`• ${line}`, pageWidth - margin * 2 - 6);
        doc.text(wrapped, margin + 3, b.y);
        b.y += wrapped.length * 4.5;
      }
      b.y += 2;
    }
  }

  // Goals for the Year
  b.checkPage(10);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(80, 80, 80);
  doc.text("Goals for the Year", margin, b.y);
  doc.text("S.M.A.R.T.", pageWidth - margin, b.y, { align: "right" });
  b.y += 5;

  if (data.oneYearGoals.length === 0) {
    b.paragraph("— no goals yet —");
  } else {
    for (let i = 0; i < data.oneYearGoals.length; i++) {
      const goal = data.oneYearGoals[i];
      b.checkPage(15);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...BRAND.green.rgb);
      const numberedTitle = `${i + 1}. ${goal.title}`;
      const titleLines = doc.splitTextToSize(
        numberedTitle,
        pageWidth - margin * 2 - 40,
      );
      doc.text(titleLines, margin, b.y);

      // SMART checkbox (rightmost) + status pill (left of it)
      const smartX = pageWidth - margin - 4;
      doc.setDrawColor(...BRAND.green.rgb);
      doc.setLineWidth(0.3);
      doc.rect(smartX, b.y - 3.5, 3.5, 3.5);
      if (goal.smart) {
        doc.setFillColor(...BRAND.green.rgb);
        doc.rect(smartX, b.y - 3.5, 3.5, 3.5, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(7);
        doc.text("✓", smartX + 0.8, b.y - 1, { align: "left" });
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...statusColor(goal.status));
      doc.text(
        statusLabel(goal.status),
        pageWidth - margin - 8,
        b.y,
        { align: "right" },
      );

      b.y += titleLines.length * 5 + 1;

      if (goal.targetDate) {
        doc.setFontSize(8);
        doc.setTextColor(110, 110, 110);
        doc.text(`Target: ${formatDate(goal.targetDate)}`, margin, b.y);
        b.y += 4;
      }

      if (goal.description) {
        doc.setFontSize(9);
        doc.setTextColor(50, 50, 50);
        doc.setFont("helvetica", "normal");
        const lines = doc.splitTextToSize(
          goal.description,
          pageWidth - margin * 2,
        );
        doc.text(lines, margin, b.y);
        b.y += lines.length * 4.5 + 1;
      }

      if (goal.rocks.length > 0) {
        b.checkPage(6);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(110, 110, 110);
        doc.text("Rocks:", margin + 4, b.y);
        b.y += 4;
        doc.setFont("helvetica", "normal");
        for (const rock of goal.rocks) {
          b.checkPage(4);
          doc.setFontSize(8);
          doc.setTextColor(60, 60, 60);
          const rockLines = doc.splitTextToSize(
            `• ${rock.title}  (${rock.percentComplete}% · ${statusLabel(rock.status)})`,
            pageWidth - margin * 2 - 8,
          );
          doc.text(rockLines, margin + 8, b.y);
          b.y += rockLines.length * 4;
        }
      }

      b.y += 3;
    }
  }

  // ── Go to Market Strategy ──
  b.heading((label("gtmStrategy", "GO TO MARKET STRATEGY")).toUpperCase());

  const gtm: Array<[string, string | null]> = [
    ["Target Market", data.gtmTargetMarket],
    ["Three Uniques", data.gtmThreeUniques],
    ["Proven Process", data.gtmProvenProcess],
    ["Guarantee", data.gtmGuarantee],
  ];

  for (const [name, value] of gtm) {
    b.checkPage(12);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BRAND.green.rgb);
    doc.text(name, margin, b.y);
    b.y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(value ? 30 : 140, value ? 30 : 140, value ? 30 : 140);
    const lines = doc.splitTextToSize(
      value || "— not set —",
      pageWidth - margin * 2,
    );
    doc.text(lines, margin, b.y);
    b.y += lines.length * 4.5 + 4;
  }

  // ── Legacy marketing strategy (only if still populated) ──
  if (data.marketingStrategy && data.marketingStrategy.trim().length > 0) {
    b.checkPage(20);
    b.heading("LEGACY MARKETING STRATEGY (uncategorised)");
    b.paragraph(data.marketingStrategy);
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
      290,
    );
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, 290, {
      align: "right",
    });
  }

  return doc;
}

function statusColor(status: string): readonly [number, number, number] {
  switch (status) {
    case "complete":
    case "done":
      return [16, 122, 87];
    case "on_track":
      return [16, 122, 87];
    case "off_track":
    case "at_risk":
      return [192, 38, 38];
    default:
      return [140, 140, 140];
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "on_track":
      return "On Track";
    case "off_track":
      return "Off Track";
    case "at_risk":
      return "At Risk";
    case "complete":
      return "Complete";
    case "done":
      return "Done";
    default:
      return status.replace(/_/g, " ");
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
