/**
 * The signature record for one parent form, as a branded PDF — the
 * document that goes in the compliance folder, or in front of an
 * assessor, when someone asks "who agreed to this, and when?".
 *
 * Layout follows the other Amana PDFs (report-pdf, enrolment-pdf):
 * Midnight Green header bar, two-tone logo, builder helpers from
 * `@/lib/pdf/branding`. Signatures are typed full names — the same
 * convention the enrolment form uses — so the PDF says so explicitly
 * rather than pretending they're wet-ink.
 */
import type jsPDF from "jspdf";
import { BRAND, drawLogo, createPdfBuilder } from "@/lib/pdf/branding";

export interface SignatureRecordData {
  form: {
    title: string;
    description: string | null;
    dueDate: string | null;
    perChild: boolean;
    status: string;
    createdAt: string;
    serviceName: string;
  };
  signatures: Array<{
    signedName: string;
    parentEmail: string;
    signedAt: string;
    childName: string | null;
  }>;
  outstanding: string[];
}

const dateAU = (iso: string) =>
  new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

const dateTimeAU = (iso: string) =>
  new Date(iso).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export async function generateSignatureRecordPdf(
  data: SignatureRecordData,
): Promise<jsPDF> {
  const { default: JsPDF } = await import("jspdf");
  const doc = new JsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;

  // ── Header bar ──
  doc.setFillColor(...BRAND.green.rgb);
  doc.rect(0, 0, pageWidth, 35, "F");
  drawLogo(doc, { x: margin, y: 15, fontSize: 18 });
  doc.setFontSize(10);
  doc.setTextColor(...BRAND.cream.rgb);
  doc.text("SIGNATURE RECORD", margin, 25);
  doc.setFontSize(9);
  doc.text(
    `Generated ${new Date().toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })}`,
    pageWidth - margin,
    25,
    { align: "right" },
  );

  const b = createPdfBuilder(doc, { margin });
  b.y = 45;

  // ── Title + meta ──
  doc.setTextColor(...BRAND.green.rgb);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  const titleLines = doc.splitTextToSize(data.form.title, contentWidth);
  doc.text(titleLines, margin, b.y);
  b.y += titleLines.length * 8 + 2;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  const metaParts = [
    data.form.serviceName,
    data.form.perChild ? "One signature per child" : "One signature per family",
    `Published ${dateAU(data.form.createdAt)}`,
  ];
  if (data.form.dueDate) metaParts.push(`Needed by ${dateAU(data.form.dueDate)}`);
  if (data.form.status !== "active") metaParts.push("Archived");
  doc.text(metaParts.join("  |  "), margin, b.y);
  b.y += 6;

  doc.setDrawColor(...BRAND.yellow.rgb);
  doc.setLineWidth(1);
  doc.line(margin, b.y, pageWidth - margin, b.y);
  b.y += 8;

  if (data.form.description) {
    b.paragraph(data.form.description);
    b.y += 2;
  }

  // ── Signatures ──
  b.heading(
    `Signatures (${data.signatures.length})`,
  );
  if (data.signatures.length === 0) {
    b.paragraph("No signatures yet.");
  }
  for (const s of data.signatures) {
    b.checkPage(12);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 30);
    doc.text(s.signedName, margin, b.y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(dateTimeAU(s.signedAt), pageWidth - margin, b.y, {
      align: "right",
    });
    b.y += 4.5;
    const detail = s.childName
      ? `For ${s.childName}  |  ${s.parentEmail}`
      : s.parentEmail;
    doc.text(detail, margin, b.y);
    b.y += 7;
  }

  // ── Still owing ──
  if (data.outstanding.length > 0) {
    b.y += 2;
    b.heading(
      data.form.perChild
        ? `Not yet signed for (${data.outstanding.length} children)`
        : `Not yet signed (${data.outstanding.length} families)`,
    );
    b.paragraph(data.outstanding.join(", "));
  }

  // ── Evidentiary footer ──
  b.y += 4;
  b.checkPage(16);
  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(120, 120, 120);
  const note = doc.splitTextToSize(
    "Each signature above was given electronically in the Amana OSHC family portal by the account holder typing their full name, and is recorded with the exact time it was given. Signatures cannot be edited or deleted; archiving a form preserves them.",
    contentWidth,
  );
  doc.text(note, margin, b.y);

  return doc;
}
