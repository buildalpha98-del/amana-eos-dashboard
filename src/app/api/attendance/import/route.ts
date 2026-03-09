import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import * as XLSX from "xlsx";
import type { SessionType } from "@prisma/client";

const COLUMN_MAP: Record<string, string[]> = {
  centre: ["centre", "center", "service", "site", "location", "service name", "centre name"],
  date: ["date", "day", "record date", "attendance date"],
  sessionType: ["session", "session type", "type", "care type", "bsc/asc"],
  enrolled: ["enrolled", "enrolments", "enrollments", "total enrolled"],
  attended: ["attended", "attendance", "actual", "present", "headcount"],
  capacity: ["capacity", "cap", "places", "max capacity"],
  casual: ["casual", "casuals", "casual count"],
  absent: ["absent", "absences", "absent count"],
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
    // Excel serial date
    const d = new Date((val - 25569) * 86400000);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(String(val));
  return isNaN(d.getTime()) ? null : d;
}

function parseSessionType(val: string): SessionType | null {
  const v = val.toLowerCase().trim();
  if (["bsc", "before school", "before school care", "before"].includes(v)) return "bsc";
  if (["asc", "after school", "after school care", "after"].includes(v)) return "asc";
  if (["vc", "vacation", "vacation care", "vac care", "holiday"].includes(v)) return "vc";
  return null;
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

  const services = await prisma.service.findMany({
    select: { id: true, name: true, code: true },
  });

  const preview: Record<string, unknown>[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  let valid = 0;
  let invalid = 0;

  type AttendanceRow = {
    serviceId: string;
    date: Date;
    sessionType: SessionType;
    enrolled: number;
    attended: number;
    capacity: number;
    casual: number;
    absent: number;
  };
  const toUpsert: AttendanceRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const rowNum = i + 2;

    const mapped: Record<string, string> = {};
    for (const [header, value] of Object.entries(row)) {
      const key = columnMapping[header];
      if (key) mapped[key] = String(value ?? "").trim();
    }

    const centreRaw = mapped.centre;
    const dateRaw = Object.entries(row).find(([h]) => columnMapping[h] === "date")?.[1];
    const sessionRaw = mapped.sessionType;
    const enrolled = parseInt(mapped.enrolled) || 0;
    const attended = parseInt(mapped.attended) || 0;
    const capacity = parseInt(mapped.capacity) || 0;
    const casual = parseInt(mapped.casual) || 0;
    const absent = parseInt(mapped.absent) || 0;

    // Match service
    let serviceId: string | null = null;
    if (centreRaw) {
      const s = services.find(
        (s) =>
          s.name.toLowerCase().includes(centreRaw.toLowerCase()) ||
          s.code.toLowerCase() === centreRaw.toLowerCase()
      );
      if (s) serviceId = s.id;
    }

    if (!serviceId) {
      errors.push(`Row ${rowNum}: Centre "${centreRaw}" not found`);
      invalid++;
      continue;
    }

    const date = parseDate(dateRaw);
    if (!date) {
      errors.push(`Row ${rowNum}: Invalid date "${dateRaw}"`);
      invalid++;
      continue;
    }

    const sessionType = sessionRaw ? parseSessionType(sessionRaw) : null;
    if (!sessionType) {
      errors.push(`Row ${rowNum}: Invalid session type "${sessionRaw}" (use BSC, ASC, or VC)`);
      invalid++;
      continue;
    }

    toUpsert.push({ serviceId, date, sessionType, enrolled, attended, capacity, casual, absent });
    valid++;

    preview.push({
      centre: services.find((s) => s.id === serviceId)?.name || "—",
      date: date.toISOString().split("T")[0],
      session: sessionType.toUpperCase(),
      enrolled,
      attended,
      capacity,
    });
  }

  if (mode === "dry-run") {
    return NextResponse.json({
      valid,
      invalid,
      warnings,
      errors,
      preview,
      columns: ["centre", "date", "session", "enrolled", "attended", "capacity"],
    });
  }

  // Execute
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const execErrors: string[] = [];

  for (const row of toUpsert) {
    try {
      const existing = await prisma.dailyAttendance.findUnique({
        where: {
          serviceId_date_sessionType: {
            serviceId: row.serviceId,
            date: row.date,
            sessionType: row.sessionType,
          },
        },
      });

      await prisma.dailyAttendance.upsert({
        where: {
          serviceId_date_sessionType: {
            serviceId: row.serviceId,
            date: row.date,
            sessionType: row.sessionType,
          },
        },
        update: {
          enrolled: row.enrolled,
          attended: row.attended,
          capacity: row.capacity,
          casual: row.casual,
          absent: row.absent,
          recordedById: session!.user.id,
        },
        create: {
          ...row,
          recordedById: session!.user.id,
        },
      });

      if (existing) updated++;
      else created++;
    } catch (err) {
      execErrors.push(`Row failed: ${err instanceof Error ? err.message : "Unknown"}`);
      skipped++;
    }
  }

  return NextResponse.json({ created, updated, skipped, errors: execErrors });
}
