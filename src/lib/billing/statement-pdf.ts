import { prisma } from "@/lib/prisma";
import { uploadFile } from "@/lib/storage";
import { logger } from "@/lib/logger";

const SESSION_LABELS: Record<string, string> = {
  bsc: "Before School Care",
  asc: "After School Care",
  vc: "Vacation Care",
};

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtCurrency(n: number): string {
  return `$${n.toFixed(2)}`;
}

/**
 * Generate a branded statement PDF and upload it to Vercel Blob.
 * Returns the public URL of the uploaded PDF.
 */
export async function generateStatementPdf(statementId: string): Promise<string> {
  // ── 1. Fetch data ──
  const statement = await prisma.statement.findUniqueOrThrow({
    where: { id: statementId },
    include: {
      contact: { select: { firstName: true, lastName: true, email: true } },
      service: { select: { id: true, name: true } },
      lineItems: {
        include: { child: { select: { firstName: true, surname: true } } },
        orderBy: { date: "asc" },
      },
    },
  });

  // ── 2. Create PDF ──
  const { default: JsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new JsPDF("p", "mm", "a4");
  const pw = doc.internal.pageSize.getWidth();
  const margin = 18;
  let y = 0;

  // ── Header bar ──
  doc.setFillColor(0, 78, 100); // #004E64
  doc.rect(0, 0, pw, 32, "F");

  doc.setFillColor(254, 206, 0); // #FECE00
  doc.rect(0, 32, pw, 2, "F");

  // Logo text
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(254, 206, 0);
  doc.text("Amana", margin, 15);
  const amW = doc.getTextWidth("Amana");
  doc.setTextColor(255, 255, 255);
  doc.text(" OSHC.", margin + amW, 15);

  // Title
  doc.setFontSize(11);
  doc.setTextColor(255, 242, 191);
  doc.text("STATEMENT OF ACCOUNT", margin, 25);

  y = 42;

  // ── Family details ──
  const familyName = [statement.contact.firstName, statement.contact.lastName]
    .filter(Boolean)
    .join(" ") || "—";

  const details: [string, string][] = [
    ["Family", familyName],
    ["Service", statement.service.name],
    ["Period", `${fmtDate(statement.periodStart)} — ${fmtDate(statement.periodEnd)}`],
  ];
  if (statement.dueDate) {
    details.push(["Due Date", fmtDate(statement.dueDate)]);
  }

  doc.setFontSize(9);
  for (const [label, value] of details) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80, 80, 80);
    doc.text(label, margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 30, 30);
    doc.text(value, margin + 35, y);
    y += 5.5;
  }

  y += 4;

  // ── Line items table ──
  const tableBody = statement.lineItems.map((li: typeof statement.lineItems[number]) => [
    `${li.child.firstName} ${li.child.surname}`,
    fmtDate(li.date),
    SESSION_LABELS[li.sessionType] ?? li.sessionType,
    fmtCurrency(li.grossFee),
    fmtCurrency(li.ccsAmount),
    fmtCurrency(li.gapAmount),
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Child", "Date", "Session", "Gross Fee", "CCS Est.", "Gap Fee"]],
    body: tableBody,
    foot: [[
      { content: "TOTALS", colSpan: 3, styles: { halign: "right" as const, fontStyle: "bold" as const } },
      { content: fmtCurrency(statement.totalFees), styles: { fontStyle: "bold" as const } },
      { content: fmtCurrency(statement.totalCcs), styles: { fontStyle: "bold" as const } },
      { content: fmtCurrency(statement.gapFee), styles: { fontStyle: "bold" as const } },
    ]],
    headStyles: {
      fillColor: [0, 78, 100],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [30, 30, 30],
    },
    footStyles: {
      fillColor: [240, 240, 240],
      textColor: [30, 30, 30],
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    theme: "grid",
    styles: { cellPadding: 2, lineColor: [220, 220, 220], lineWidth: 0.2 },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable?.finalY ?? y + 40;

  y += 8;

  // ── Payment summary box ──
  const boxH = 22;
  if (y + boxH > 275) {
    doc.addPage();
    y = margin;
  }

  doc.setFillColor(245, 245, 245);
  doc.roundedRect(margin, y, pw - margin * 2, boxH, 2, 2, "F");

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(80, 80, 80);
  doc.text("Amount Paid:", margin + 6, y + 9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 30, 30);
  doc.text(fmtCurrency(statement.amountPaid), margin + 42, y + 9);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(80, 80, 80);
  doc.text("Balance Outstanding:", margin + 6, y + 17);

  const balance = statement.balance;
  if (balance > 0) {
    doc.setTextColor(180, 30, 30); // red
  } else {
    doc.setTextColor(20, 130, 60); // green
  }
  doc.setFont("helvetica", "bold");
  doc.text(fmtCurrency(balance), margin + 52, y + 17);

  y += boxH + 8;

  // ── Footer disclaimer ──
  if (y + 15 > 275) {
    doc.addPage();
    y = margin;
  }

  doc.setDrawColor(254, 206, 0);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pw - margin, y);
  y += 6;

  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text(
    "CCS estimates are indicative only. Actual CCS is determined by Services Australia.",
    margin,
    y,
  );
  y += 4;
  doc.text(`Statement ID: ${statement.id}`, margin, y);

  // ── 3. Upload ──
  const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
  const filename = `statement-${statementId}.pdf`;

  const { url } = await uploadFile(pdfBuffer, filename, {
    contentType: "application/pdf",
    folder: `statements/${statement.service.id}`,
    access: "public",
  });

  // ── 4. Update statement record ──
  await prisma.statement.update({
    where: { id: statementId },
    data: { pdfUrl: url },
  });

  logger.info("Statement PDF generated", { statementId, url });

  return url;
}
