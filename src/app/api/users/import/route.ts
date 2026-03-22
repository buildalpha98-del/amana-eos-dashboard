import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import bcrypt from "bcryptjs";
import { getResend, FROM_EMAIL } from "@/lib/email";
import { welcomeEmail } from "@/lib/email-templates";
import { getDefaultNotificationPrefs } from "@/lib/notification-defaults";
import { withApiAuth } from "@/lib/server-auth";

const COLUMN_MAP: Record<string, string[]> = {
  name: ["name", "full name", "staff name", "employee name", "first name", "employee"],
  email: ["email", "email address", "e-mail", "work email"],
  role: ["role", "user role", "access level", "position type"],
  service: ["service", "centre", "center", "site", "location", "service name", "centre name"],
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/[^a-z0-9 ]/g, "");
}

function matchColumn(header: string): string | null {
  const norm = normalizeHeader(header);
  for (const [key, aliases] of Object.entries(COLUMN_MAP)) {
    if (aliases.includes(norm)) return key;
  }
  return null;
}

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pwd = "";
  for (let i = 0; i < 10; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  return pwd;
}

export const POST = withApiAuth(async (req, session) => {
const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const mode = (formData.get("mode") as string) || "dry-run";

  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const MAX_IMPORT_SIZE = 10 * 1024 * 1024; // 10MB
  if (file.size > MAX_IMPORT_SIZE) {
    return NextResponse.json({ error: "File exceeds 10MB limit" }, { status: 400 });
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet);

  if (rawRows.length === 0) {
    return NextResponse.json({ error: "Spreadsheet is empty" }, { status: 400 });
  }

  // Map columns
  const headers = Object.keys(rawRows[0]);
  const columnMapping: Record<string, string> = {};
  for (const header of headers) {
    const mapped = matchColumn(header);
    if (mapped) columnMapping[header] = mapped;
  }

  if (!Object.values(columnMapping).includes("name") || !Object.values(columnMapping).includes("email")) {
    return NextResponse.json({
      error: "Could not find required columns: name, email. Found: " + headers.join(", "),
    }, { status: 400 });
  }

  // Load services for matching
  const services = await prisma.service.findMany({
    select: { id: true, name: true, code: true },
  });

  const existingEmails = new Set(
    (await prisma.user.findMany({ select: { email: true } })).map((u) => u.email.toLowerCase())
  );

  const validRoles = ["owner", "admin", "member", "staff"];
  const preview: Record<string, unknown>[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  let valid = 0;
  let invalid = 0;

  const toCreate: { name: string; email: string; role: string; serviceId: string | null; tempPassword: string }[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const rowNum = i + 2; // Excel row number

    const mapped: Record<string, string> = {};
    for (const [header, value] of Object.entries(row)) {
      const key = columnMapping[header];
      if (key) mapped[key] = String(value).trim();
    }

    const name = mapped.name;
    const email = mapped.email?.toLowerCase();
    const roleRaw = mapped.role?.toLowerCase() || "member";
    const serviceRaw = mapped.service;

    if (!name || !email) {
      errors.push(`Row ${rowNum}: Missing name or email`);
      invalid++;
      continue;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push(`Row ${rowNum}: Invalid email "${email}"`);
      invalid++;
      continue;
    }

    if (existingEmails.has(email)) {
      warnings.push(`Row ${rowNum}: "${email}" already exists — will skip`);
      invalid++;
      continue;
    }

    const role = validRoles.includes(roleRaw) ? roleRaw : "member";
    if (!validRoles.includes(roleRaw)) {
      warnings.push(`Row ${rowNum}: Unknown role "${roleRaw}" — defaulting to member`);
    }

    let serviceId: string | null = null;
    if (serviceRaw) {
      const matchedService = services.find(
        (s) =>
          s.name.toLowerCase().includes(serviceRaw.toLowerCase()) ||
          s.code.toLowerCase() === serviceRaw.toLowerCase()
      );
      if (matchedService) {
        serviceId = matchedService.id;
      } else {
        warnings.push(`Row ${rowNum}: Service "${serviceRaw}" not found — no service assigned`);
      }
    }

    const tempPassword = generatePassword();
    toCreate.push({ name, email, role, serviceId, tempPassword });
    existingEmails.add(email); // Prevent dupes within the same import
    valid++;

    preview.push({
      name,
      email,
      role,
      service: serviceId ? services.find((s) => s.id === serviceId)?.name || "—" : "—",
    });
  }

  if (mode === "dry-run") {
    return NextResponse.json({
      valid,
      invalid,
      warnings,
      errors,
      preview,
      columns: ["name", "email", "role", "service"],
    });
  }

  // Execute mode
  let created = 0;
  let skipped = 0;
  const execErrors: string[] = [];
  const resend = getResend();
  const loginUrl = `${process.env.NEXTAUTH_URL || "https://dashboard.amanaoshc.com.au"}/login`;

  for (const user of toCreate) {
    try {
      const hash = await bcrypt.hash(user.tempPassword, 12);
      await prisma.user.create({
        data: {
          name: user.name,
          email: user.email,
          passwordHash: hash,
          role: user.role as "owner" | "admin" | "member" | "staff",
          serviceId: user.serviceId,
          notificationPrefs: getDefaultNotificationPrefs(user.role),
        },
      });
      created++;

      // Send welcome email
      if (resend) {
        try {
          const { subject, html } = welcomeEmail(user.name, user.tempPassword, loginUrl);
          await resend.emails.send({ from: FROM_EMAIL, to: user.email, subject, html });
        } catch {
          warnings.push(`Welcome email failed for ${user.email}`);
        }
      }
    } catch (err) {
      execErrors.push(`Failed to create ${user.email}: ${err instanceof Error ? err.message : "Unknown"}`);
      skipped++;
    }
  }

  return NextResponse.json({
    created,
    updated: 0,
    skipped,
    errors: execErrors,
  });
}, { roles: ["owner"] });
