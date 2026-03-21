import type jsPDF from "jspdf";

interface ActionItem {
  id: string;
  text: string;
  completed: boolean;
  assignee?: string;
}

interface ReportPdfOptions {
  title: string;
  seat: string;
  reportType: string;
  content: string;
  metrics?: Record<string, unknown> | null;
  alerts?: Array<{ level: string; message: string }> | null;
  actionItems: ActionItem[];
  centreName?: string;
  assigneeName?: string;
  createdAt: string;
}

export async function generateReportPdf(options: ReportPdfOptions): Promise<jsPDF> {
  const { default: JsPDF } = await import("jspdf");
  const doc = new JsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // ── Header Bar ──
  doc.setFillColor(0, 78, 100); // Midnight Green
  doc.rect(0, 0, pageWidth, 35, "F");

  // Logo text
  doc.setTextColor(254, 206, 0); // Jonquil
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Amana", margin, 15);
  const amanaWidth = doc.getTextWidth("Amana");
  doc.setTextColor(255, 255, 255);
  doc.text(" OSHC.", margin + amanaWidth, 15);

  // Report type badge
  doc.setFontSize(10);
  doc.setTextColor(255, 242, 191); // Lemon Chiffon
  doc.text(
    `${options.seat.toUpperCase()} | ${options.reportType.replace(/-/g, " ").toUpperCase()}`,
    margin,
    25
  );

  // Date
  doc.setFontSize(9);
  doc.text(
    new Date(options.createdAt).toLocaleDateString("en-AU", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    pageWidth - margin,
    25,
    { align: "right" }
  );

  y = 45;

  // ── Title ──
  doc.setTextColor(0, 78, 100);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  const titleLines = doc.splitTextToSize(options.title, contentWidth);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 8 + 4;

  // ── Meta line ──
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  const metaParts: string[] = [];
  if (options.centreName) metaParts.push(`Centre: ${options.centreName}`);
  if (options.assigneeName)
    metaParts.push(`Assigned to: ${options.assigneeName}`);
  if (metaParts.length) {
    doc.text(metaParts.join("  |  "), margin, y);
    y += 6;
  }

  // ── Divider ──
  doc.setDrawColor(254, 206, 0); // Jonquil
  doc.setLineWidth(1);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // ── Alerts ──
  if (options.alerts?.length) {
    for (const alert of options.alerts) {
      const icon =
        alert.level === "warning"
          ? "\u26A0"
          : alert.level === "critical"
            ? "\uD83D\uDD34"
            : "\u2139";
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");

      if (alert.level === "warning" || alert.level === "critical") {
        doc.setFillColor(255, 243, 205);
        doc.setTextColor(146, 64, 14);
      } else {
        doc.setFillColor(219, 234, 254);
        doc.setTextColor(30, 64, 175);
      }

      doc.roundedRect(margin, y - 4, contentWidth, 10, 2, 2, "F");
      doc.text(`${icon}  ${alert.message}`, margin + 4, y + 2);
      y += 14;
    }
    y += 2;
  }

  // ── Metrics ──
  if (options.metrics && Object.keys(options.metrics).length) {
    doc.setFillColor(255, 250, 230); // Cosmic Latte
    const metricEntries = Object.entries(options.metrics).filter(
      ([, v]) => typeof v !== "object" || Array.isArray(v)
    );
    const cols = Math.min(metricEntries.length, 4);
    const colWidth = contentWidth / cols;

    metricEntries.slice(0, 4).forEach(([key, value], i) => {
      const x = margin + i * colWidth;
      doc.roundedRect(x + 1, y - 4, colWidth - 2, 18, 2, 2, "F");

      doc.setTextColor(0, 78, 100);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      const displayValue = Array.isArray(value)
        ? String(value.length)
        : String(value);
      doc.text(displayValue, x + colWidth / 2, y + 4, { align: "center" });

      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      const label = key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (s) => s.toUpperCase());
      doc.text(label, x + colWidth / 2, y + 10, { align: "center" });
    });

    y += 22;
  }

  // ── Action Items ──
  if (options.actionItems.length) {
    doc.setTextColor(0, 78, 100);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Action Items", margin, y);
    y += 6;

    for (const item of options.actionItems) {
      if (y > 270) {
        doc.addPage();
        y = margin;
      }
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 60, 60);
      const checkbox = item.completed ? "\u2611" : "\u2610";
      const lines = doc.splitTextToSize(
        `${checkbox}  ${item.text}`,
        contentWidth - 8
      );
      doc.text(lines, margin + 4, y);
      y += lines.length * 4.5 + 2;
    }

    y += 4;
  }

  // ── Content ──
  const plainContent = options.content
    .replace(/^#{1,3}\s*action\s*items[\s\S]*?(?=^#{1,3}\s|$)/gim, "")
    .replace(/^#{1,3}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/^[-*]\s*\[[ xX]\]\s*/gm, "")
    .replace(/^[-*]\s+/gm, "\u2022 ")
    .trim();

  doc.setTextColor(50, 50, 50);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const contentLines = doc.splitTextToSize(plainContent, contentWidth);
  for (const line of contentLines) {
    if (y > 275) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, margin, y);
    y += 4.2;
  }

  // ── Footer ──
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFillColor(0, 78, 100);
    doc.rect(0, 287, pageWidth, 10, "F");
    doc.setTextColor(255, 242, 191);
    doc.setFontSize(7);
    doc.text(
      "Amana OSHC  |  Beyond The Bell  |  1300 200 262  |  amanaoshc.com.au",
      margin,
      293
    );
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, 293, {
      align: "right",
    });
  }

  return doc;
}
