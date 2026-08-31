import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { getCentreScope } from "@/lib/centre-scope";
import { recomputeAmbassadorRecord } from "@/lib/ambassadors/recompute";

/**
 * CSV/XLSX import of the OWNA weekly attendance export → AmbassadorSession
 * rows. Attendance lives in OWNA and the pilot centres aren't API-linked,
 * so a Director/Admin uploads the export weekly.
 *
 * Tolerant column mapper (same pattern as /api/attendance/import). Rows
 * are matched to OPEN ambassador records in the active pilot by child name
 * (+DOB when the export has it) — unmatched rows are reported back, never
 * guessed. Matched rows upsert AmbassadorSession { source: csv_import }.
 *
 * multipart form: file, mode=dry-run|execute
 */

const COLUMN_MAP: Record<string, string[]> = {
  childName: ["child", "child name", "name", "student", "student name", "full name"],
  firstName: ["first name", "firstname", "given name"],
  surname: ["surname", "last name", "lastname", "family name"],
  dob: ["dob", "date of birth", "birth date", "birthdate"],
  date: ["date", "attendance date", "session date", "day"],
  sessionType: ["session", "session type", "session of care", "care type", "type"],
  fee: ["fee", "session fee", "amount", "charge", "charged", "daily fee", "gap fee"],
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
  if (val == null || val === "") return null;
  if (typeof val === "number") {
    const d = new Date((val - 25569) * 86400000);
    return isNaN(d.getTime()) ? null : d;
  }
  // OWNA exports use DD/MM/YYYY — new Date() would read it as MM/DD.
  const s = String(val).trim();
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const d = new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function parseSessionType(val: unknown): "bsc" | "asc" | "vc" | "unknown" {
  const v = String(val ?? "").toLowerCase().trim();
  if (["bsc", "before school", "before school care", "before"].includes(v)) return "bsc";
  if (["asc", "after school", "after school care", "after"].includes(v)) return "asc";
  if (["vc", "vacation", "vacation care", "vac care", "holiday"].includes(v)) return "vc";
  // OWNA's "HH:mm-HH:mm" session-of-care strings: before 9am = BSC, from 3pm = ASC.
  const time = v.match(/^(\d{1,2}):\d{2}/);
  if (time) {
    const hour = Number(time[1]);
    if (hour < 9) return "bsc";
    if (hour >= 15) return "asc";
    return "vc";
  }
  return "unknown";
}

function parseFee(val: unknown): number | null {
  if (val == null || val === "") return null;
  const n = Number(String(val).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function normName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export const POST = withApiAuth(
  async (req, session) => {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const mode = (formData.get("mode") as string) || "dry-run";

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File exceeds 10MB limit" }, { status: 400 });
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
    const mappedKeys = new Set(Object.values(columnMapping));
    const hasName =
      mappedKeys.has("childName") ||
      (mappedKeys.has("firstName") && mappedKeys.has("surname"));
    if (!hasName || !mappedKeys.has("date") || !mappedKeys.has("fee")) {
      return NextResponse.json(
        {
          error:
            "Could not find the required columns — need a child name, a date, and a fee column.",
          columns: headers,
          mapped: columnMapping,
        },
        { status: 400 },
      );
    }

    // Open records in the active pilot, scoped to the caller's centres
    // (a Director can only import rows for their own centre's records).
    const { serviceIds } = await getCentreScope(session);
    const records = await prisma.ambassadorEnrolment.findMany({
      where: {
        pilot: { status: "active" },
        status: { in: ["logged", "director_verified", "sm_approved", "rejected"] },
        ...(serviceIds === null
          ? {}
          : { serviceId: { in: serviceIds.length ? serviceIds : ["__none__"] } }),
        childId: { not: null },
      },
      select: {
        id: true,
        child: { select: { firstName: true, surname: true, dob: true } },
      },
    });
    const byName = new Map<string, { id: string; dob: Date | null }[]>();
    for (const r of records) {
      if (!r.child) continue;
      const key = normName(`${r.child.firstName} ${r.child.surname}`);
      const list = byName.get(key) ?? [];
      list.push({ id: r.id, dob: r.child.dob });
      byName.set(key, list);
    }

    type ParsedRow = {
      rowNumber: number;
      childName: string;
      date: Date;
      sessionType: "bsc" | "asc" | "vc" | "unknown";
      fee: number;
      recordId: string | null;
      problem: string | null;
    };

    const parsed: ParsedRow[] = rawRows.map((raw, i) => {
      const get = (key: string): unknown => {
        const header = Object.entries(columnMapping).find(([, k]) => k === key)?.[0];
        return header ? raw[header] : undefined;
      };
      const name = mappedKeys.has("childName")
        ? String(get("childName") ?? "").trim()
        : `${String(get("firstName") ?? "").trim()} ${String(get("surname") ?? "").trim()}`.trim();
      const date = parseDate(get("date"));
      const fee = parseFee(get("fee"));
      const dob = parseDate(get("dob"));

      const base = {
        rowNumber: i + 2, // 1-based + header row
        childName: name,
        date: date ?? new Date(0),
        sessionType: parseSessionType(get("sessionType")),
        fee: fee ?? 0,
      };

      if (!name) return { ...base, recordId: null, problem: "Missing child name" };
      if (!date) return { ...base, recordId: null, problem: "Unreadable date" };
      if (fee === null) return { ...base, recordId: null, problem: "Unreadable fee" };

      const candidates = byName.get(normName(name)) ?? [];
      let matches = candidates;
      if (dob && candidates.some((c) => c.dob)) {
        matches = candidates.filter(
          (c) => c.dob && c.dob.toISOString().slice(0, 10) === dob.toISOString().slice(0, 10),
        );
      }
      if (matches.length === 0) {
        return { ...base, recordId: null, problem: "No open ambassador record for this child" };
      }
      if (matches.length > 1) {
        return { ...base, recordId: null, problem: "Ambiguous — two records share this name" };
      }
      return { ...base, recordId: matches[0].id, problem: null };
    });

    const valid = parsed.filter((r) => r.recordId);
    const invalid = parsed.filter((r) => !r.recordId);

    if (mode !== "execute") {
      return NextResponse.json({
        valid: valid.length,
        invalid: invalid.length,
        warnings: [],
        errors: invalid.map((r) => `Row ${r.rowNumber}: ${r.problem} (${r.childName})`),
        preview: valid.slice(0, 20).map((r) => ({
          child: r.childName,
          date: r.date.toISOString().slice(0, 10),
          sessionType: r.sessionType,
          fee: r.fee,
        })),
        columns: columnMapping,
      });
    }

    let created = 0;
    let updated = 0;
    const touched = new Set<string>();
    for (const row of valid) {
      const existing = await prisma.ambassadorSession.findUnique({
        where: {
          recordId_date_sessionType: {
            recordId: row.recordId!,
            date: row.date,
            sessionType: row.sessionType,
          },
        },
        select: { id: true },
      });
      if (existing) {
        await prisma.ambassadorSession.update({
          where: { id: existing.id },
          data: { fee: row.fee, source: "csv_import" },
        });
        updated++;
      } else {
        await prisma.ambassadorSession.create({
          data: {
            recordId: row.recordId!,
            date: row.date,
            sessionType: row.sessionType,
            fee: row.fee,
            source: "csv_import",
            createdById: session.user.id,
          },
        });
        created++;
      }
      touched.add(row.recordId!);
    }

    for (const recordId of touched) {
      await recomputeAmbassadorRecord(recordId);
    }

    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: "ambassador_attendance_imported",
        entityType: "AmbassadorPilot",
        entityId: "import",
        details: { created, updated, skipped: invalid.length, file: file.name },
      },
    });

    return NextResponse.json({
      created,
      updated,
      skipped: invalid.length,
      errors: invalid.map((r) => `Row ${r.rowNumber}: ${r.problem} (${r.childName})`),
    });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);
