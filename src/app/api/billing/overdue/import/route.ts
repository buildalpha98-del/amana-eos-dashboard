import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import * as XLSX from "xlsx";

/**
 * POST /api/billing/overdue/import
 * Import overdue fee records from OWNA XLSX export
 */
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const defaultServiceId = formData.get("serviceId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    if (!rows.length) {
      return NextResponse.json({ error: "No data rows found" }, { status: 400 });
    }

    // Smart column matching (case-insensitive, trimmed)
    const columnMap: Record<string, string[]> = {
      parentName: ["parent name", "parent", "family name", "family", "name", "account name", "guardian"],
      parentEmail: ["parent email", "email", "guardian email", "contact email"],
      parentPhone: ["parent phone", "phone", "mobile", "contact phone", "guardian phone"],
      childName: ["child name", "child", "student name", "student"],
      invoiceRef: ["invoice ref", "invoice number", "invoice #", "invoice no", "reference", "inv #", "inv no"],
      invoiceDate: ["invoice date", "date issued", "issued date", "date"],
      dueDate: ["due date", "payment due", "due"],
      amountDue: ["amount due", "total due", "amount", "total", "invoice amount", "outstanding", "balance due"],
      amountPaid: ["amount paid", "paid", "payments", "received"],
      serviceName: ["centre", "center", "service", "location", "site"],
    };

    const headers = Object.keys(rows[0]).map((h) => String(h).trim());
    const mapped: Record<string, string> = {};

    for (const [field, aliases] of Object.entries(columnMap)) {
      for (const header of headers) {
        const lower = header.toLowerCase();
        if (aliases.some((a) => lower.includes(a))) {
          mapped[field] = header;
          break;
        }
      }
    }

    if (!mapped.parentName || !mapped.amountDue) {
      return NextResponse.json(
        {
          error: "Could not find required columns. Need at least: parent name and amount due.",
          foundColumns: headers,
        },
        { status: 400 },
      );
    }

    // Load services for name matching
    const services = await prisma.service.findMany({
      select: { id: true, name: true, code: true },
    });

    const now = new Date();
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const parentName = String(row[mapped.parentName] || "").trim();
        const amountDue = parseFloat(String(row[mapped.amountDue] || "0"));
        if (!parentName || !amountDue || amountDue <= 0) {
          skipped++;
          continue;
        }

        // Resolve service
        let serviceId = defaultServiceId;
        if (mapped.serviceName && row[mapped.serviceName]) {
          const sName = String(row[mapped.serviceName]).trim().toLowerCase();
          const match = services.find(
            (s) =>
              s.name.toLowerCase().includes(sName) ||
              sName.includes(s.name.toLowerCase()) ||
              (s.code && s.code.toLowerCase() === sName),
          );
          if (match) serviceId = match.id;
        }

        if (!serviceId) {
          errors.push(`Row ${i + 2}: No service match for "${row[mapped.serviceName] || "unknown"}"`);
          skipped++;
          continue;
        }

        const invoiceDate = mapped.invoiceDate && row[mapped.invoiceDate]
          ? new Date(row[mapped.invoiceDate] as string | number)
          : now;
        const dueDate = mapped.dueDate && row[mapped.dueDate]
          ? new Date(row[mapped.dueDate] as string | number)
          : invoiceDate;
        const amountPaid = mapped.amountPaid
          ? parseFloat(String(row[mapped.amountPaid] || "0"))
          : 0;
        const balance = amountDue - amountPaid;

        if (balance <= 0) {
          skipped++;
          continue;
        }

        const daysOverdue = Math.max(
          0,
          Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)),
        );

        let agingBucket = "current";
        if (daysOverdue >= 60) agingBucket = "60plus";
        else if (daysOverdue >= 45) agingBucket = "45d";
        else if (daysOverdue >= 30) agingBucket = "30d";
        else if (daysOverdue >= 14) agingBucket = "14d";
        else if (daysOverdue >= 7) agingBucket = "7d";

        await prisma.overdueFeeRecord.create({
          data: {
            serviceId,
            parentName,
            parentEmail: mapped.parentEmail ? String(row[mapped.parentEmail] || "").trim() || null : null,
            parentPhone: mapped.parentPhone ? String(row[mapped.parentPhone] || "").trim() || null : null,
            childName: mapped.childName ? String(row[mapped.childName] || "").trim() || null : null,
            invoiceRef: mapped.invoiceRef ? String(row[mapped.invoiceRef] || "").trim() || null : null,
            invoiceDate,
            dueDate,
            amountDue,
            amountPaid,
            balance,
            daysOverdue,
            agingBucket,
            assigneeId: session!.user.id,
          },
        });
        created++;
      } catch (rowErr) {
        errors.push(`Row ${i + 2}: ${String(rowErr)}`);
        skipped++;
      }
    }

    return NextResponse.json({
      success: true,
      created,
      skipped,
      total: rows.length,
      errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
    });
  } catch (err) {
    console.error("[Billing Import POST]", err);
    return NextResponse.json(
      { error: "Failed to import overdue records" },
      { status: 500 },
    );
  }
}
