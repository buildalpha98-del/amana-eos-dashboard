import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import * as XLSX from "xlsx";
import type { CertificateType } from "@prisma/client";

const COLUMN_MAP: Record<string, string[]> = {
  staffName: ["staff", "staff name", "employee", "name", "full name"],
  staffEmail: ["email", "staff email", "employee email", "e-mail"],
  service: ["service", "centre", "center", "site", "location"],
  certType: ["type", "cert type", "certificate type", "certificate", "certification"],
  issueDate: ["issue date", "issued", "issued date", "date issued", "start date"],
  expiryDate: ["expiry", "expiry date", "expires", "expiration", "due date", "end date"],
  notes: ["notes", "comments", "remarks"],
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/[^a-z0-9 /]/g, "");
}

function matchColumn(header: string): string | null {
  const norm = normalizeHeader(header);
  for (const [key, aliases] of Object.entries(COLUMN_MAP)) {
    if (aliases.includes(norm)) return key;
  }
  return null;
}

function parseDate(val: unknown): Date | null {
  if (!val) return null;
  if (typeof val === "number") {
    const d = new Date((val - 25569) * 86400000);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(String(val));
  return isNaN(d.getTime()) ? null : d;
}

const certTypeMap: Record<string, CertificateType> = {
  wwcc: "wwcc",
  "working with children": "wwcc",
  "working with children check": "wwcc",
  "first aid": "first_aid",
  firstaid: "first_aid",
  anaphylaxis: "anaphylaxis",
  asthma: "asthma",
  cpr: "cpr",
  "police check": "police_check",
  "police": "police_check",
  "national police check": "police_check",
  "annual review": "annual_review",
  "annual": "annual_review",
  other: "other",
};

function parseCertType(val: string): CertificateType | null {
  return certTypeMap[val.toLowerCase().trim()] || null;
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const mode = (formData.get("mode") as string) || "dry-run";

  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet);

  if (rawRows.length === 0) {
    return NextResponse.json({ error: "Spreadsheet is empty" }, { status: 400 });
  }

  const headers = Object.keys(rawRows[0]);
  const columnMapping: Record<string, string> = {};
  for (const header of headers) {
    const mapped = matchColumn(header);
    if (mapped) columnMapping[header] = mapped;
  }

  const services = await prisma.service.findMany({ select: { id: true, name: true, code: true } });
  const users = await prisma.user.findMany({ select: { id: true, name: true, email: true } });

  const preview: Record<string, unknown>[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  let valid = 0;
  let invalid = 0;

  type CertRow = {
    serviceId: string;
    userId: string | null;
    type: CertificateType;
    issueDate: Date;
    expiryDate: Date;
    notes: string | null;
  };
  const toCreate: CertRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const rowNum = i + 2;

    const mapped: Record<string, string> = {};
    for (const [header, value] of Object.entries(row)) {
      const key = columnMapping[header];
      if (key) mapped[key] = String(value ?? "").trim();
    }

    // Match service
    const serviceRaw = mapped.service;
    let serviceId: string | null = null;
    if (serviceRaw) {
      const s = services.find(
        (s) => s.name.toLowerCase().includes(serviceRaw.toLowerCase()) || s.code.toLowerCase() === serviceRaw.toLowerCase()
      );
      if (s) serviceId = s.id;
    }
    if (!serviceId) {
      errors.push(`Row ${rowNum}: Service "${serviceRaw}" not found`);
      invalid++;
      continue;
    }

    // Match user by email or name
    let userId: string | null = null;
    const emailRaw = mapped.staffEmail;
    const nameRaw = mapped.staffName;
    if (emailRaw) {
      const u = users.find((u) => u.email.toLowerCase() === emailRaw.toLowerCase());
      if (u) userId = u.id;
    }
    if (!userId && nameRaw) {
      const u = users.find((u) => u.name.toLowerCase() === nameRaw.toLowerCase());
      if (u) userId = u.id;
    }
    if (!userId) {
      warnings.push(`Row ${rowNum}: Staff "${nameRaw || emailRaw}" not found — cert will be unassigned`);
    }

    // Cert type
    const certTypeRaw = mapped.certType;
    const certType = certTypeRaw ? parseCertType(certTypeRaw) : null;
    if (!certType) {
      errors.push(`Row ${rowNum}: Unknown certificate type "${certTypeRaw}"`);
      invalid++;
      continue;
    }

    // Dates
    const issueDateRaw = Object.entries(row).find(([h]) => columnMapping[h] === "issueDate")?.[1];
    const expiryDateRaw = Object.entries(row).find(([h]) => columnMapping[h] === "expiryDate")?.[1];
    const issueDate = parseDate(issueDateRaw);
    const expiryDate = parseDate(expiryDateRaw);

    if (!issueDate) {
      errors.push(`Row ${rowNum}: Invalid issue date "${issueDateRaw}"`);
      invalid++;
      continue;
    }
    if (!expiryDate) {
      errors.push(`Row ${rowNum}: Invalid expiry date "${expiryDateRaw}"`);
      invalid++;
      continue;
    }

    toCreate.push({
      serviceId,
      userId,
      type: certType,
      issueDate,
      expiryDate,
      notes: mapped.notes || null,
    });
    valid++;

    preview.push({
      staff: nameRaw || emailRaw || "—",
      service: services.find((s) => s.id === serviceId)?.name || "—",
      type: certType.replace(/_/g, " ").toUpperCase(),
      issued: issueDate.toISOString().split("T")[0],
      expiry: expiryDate.toISOString().split("T")[0],
    });
  }

  if (mode === "dry-run") {
    return NextResponse.json({
      valid,
      invalid,
      warnings,
      errors,
      preview,
      columns: ["staff", "service", "type", "issued", "expiry"],
    });
  }

  // Execute
  let created = 0;
  let skipped = 0;
  const execErrors: string[] = [];

  for (const cert of toCreate) {
    try {
      await prisma.complianceCertificate.create({ data: cert });
      created++;
    } catch (err) {
      execErrors.push(`Failed: ${err instanceof Error ? err.message : "Unknown"}`);
      skipped++;
    }
  }

  return NextResponse.json({ created, updated: 0, skipped, errors: execErrors });
}
