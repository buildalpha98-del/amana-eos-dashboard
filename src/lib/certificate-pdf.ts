import type jsPDF from "jspdf";
import { BRAND, drawLogo } from "@/lib/pdf/branding";
import { toast } from "@/hooks/useToast";

export interface CertificateOptions {
  learnerName: string;
  courseTitle: string;
  /**
   * ISO date the course was completed. Pass null when the enrolment has no
   * recorded completion date — the certificate prints "Not recorded" rather
   * than fabricating a date on compliance evidence.
   */
  completedAt: string | null;
  /** Optional final score (0–100) shown when present. */
  score?: number | null;
  /** Short verification/enrolment id printed in the footer. */
  reference?: string | null;
}

/**
 * Branded A4-landscape "Certificate of Completion" for a finished LMS course.
 * Mirrors the report/enrolment PDF brand identity (Midnight Green + Jonquil).
 * Returns the jsPDF doc; caller decides `.save()` vs `.output()`.
 */
export async function generateCertificatePdf(
  options: CertificateOptions,
): Promise<jsPDF> {
  const { default: JsPDF } = await import("jspdf");
  const doc = new JsPDF("l", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth(); // 297
  const pageHeight = doc.internal.pageSize.getHeight(); // 210
  const cx = pageWidth / 2;

  // ── Outer border frame ──
  doc.setDrawColor(...BRAND.green.rgb);
  doc.setLineWidth(1.5);
  doc.rect(10, 10, pageWidth - 20, pageHeight - 20);
  doc.setDrawColor(...BRAND.yellow.rgb);
  doc.setLineWidth(0.5);
  doc.rect(14, 14, pageWidth - 28, pageHeight - 28);

  // ── Top logo bar ──
  doc.setFillColor(...BRAND.green.rgb);
  doc.rect(14, 14, pageWidth - 28, 22, "F");
  drawLogo(doc, { x: cx - 24, y: 28, fontSize: 20 });

  // ── Title ──
  let y = 58;
  doc.setTextColor(...BRAND.green.rgb);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(30);
  doc.text("Certificate of Completion", cx, y, { align: "center" });

  y += 12;
  doc.setDrawColor(...BRAND.yellow.rgb);
  doc.setLineWidth(1);
  doc.line(cx - 40, y, cx + 40, y);

  // ── Body ──
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(90, 90, 90);
  doc.text("This is to certify that", cx, y, { align: "center" });

  y += 16;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 30);
  // Step the font down until the name fits inside the border frame.
  let nameSize = 26;
  doc.setFontSize(nameSize);
  const maxNameWidth = pageWidth - 60;
  while (nameSize > 14 && doc.getTextWidth(options.learnerName) > maxNameWidth) {
    nameSize -= 2;
    doc.setFontSize(nameSize);
  }
  doc.text(options.learnerName, cx, y, { align: "center" });

  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(90, 90, 90);
  doc.text("has successfully completed", cx, y, { align: "center" });

  y += 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...BRAND.green.rgb);
  // Cap at two lines so an extreme title can never collide with the footer.
  const allTitleLines: string[] = doc.splitTextToSize(options.courseTitle, pageWidth - 80);
  const titleLines = allTitleLines.slice(0, 2);
  if (allTitleLines.length > 2) {
    titleLines[1] = `${titleLines[1].slice(0, -1)}…`;
  }
  doc.text(titleLines, cx, y, { align: "center" });
  y += titleLines.length * 8;

  // ── Footer: date / score / reference ──
  const completed = options.completedAt
    ? new Date(options.completedAt).toLocaleDateString("en-AU", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "Not recorded";
  const footY = pageHeight - 40;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.4);
  doc.line(40, footY, 110, footY);
  doc.line(pageWidth - 110, footY, pageWidth - 40, footY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  doc.text(completed, 75, footY + 6, { align: "center" });
  doc.text("Date Completed", 75, footY + 11, { align: "center" });

  const rightLabel =
    typeof options.score === "number" ? `${Math.round(options.score)}%` : "Amana OSHC";
  doc.text(rightLabel, pageWidth - 75, footY + 6, { align: "center" });
  doc.text(
    typeof options.score === "number" ? "Final Score" : "Issued By",
    pageWidth - 75,
    footY + 11,
    { align: "center" },
  );

  if (options.reference) {
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(`Verification ref: ${options.reference}`, cx, pageHeight - 20, {
      align: "center",
    });
  }

  return doc;
}

/** Convenience: build + trigger a browser download. */
export async function downloadCertificate(
  options: CertificateOptions,
): Promise<void> {
  const doc = await generateCertificatePdf(options);
  const safe = options.learnerName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const course = options.courseTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  doc.save(`certificate-${safe}-${course}.pdf`);
}

/**
 * Download with a destructive toast on failure — the one shared handler for
 * the learner (/my-training) and admin (LmsCoursesTab) certificate buttons,
 * so the two surfaces can't drift. Callers manage their own busy state.
 */
export async function downloadCertificateSafe(
  options: CertificateOptions,
): Promise<void> {
  try {
    await downloadCertificate(options);
  } catch {
    toast({
      variant: "destructive",
      description: "Couldn't generate the certificate. Please try again.",
    });
  }
}
