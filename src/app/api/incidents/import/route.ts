import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import * as XLSX from "xlsx";

const COLUMN_MAP: Record<string, string[]> = {
  centre: ["centre", "center", "service", "site", "location", "service name", "centre name"],
  date: ["date", "day", "incident date", "date of incident", "record date"],
  childName: ["child", "child name", "student", "student name", "name"],
  incidentType: ["type", "incident type", "category", "incident category"],
  severity: ["severity", "level", "severity level", "risk level"],
  location: ["location", "area", "incident location", "place", "where"],
  timeOfDay: ["time", "time of day", "period", "session"],
  description: ["description", "details", "incident details", "what happened", "notes"],
  actionTaken: ["action", "action taken", "response", "treatment", "first aid"],
  parentNotified: ["parent notified", "parent contacted", "notified parent", "parent"],
  reportable: ["reportable", "notifiable", "reportable to authority", "report"],
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

function parseIncidentType(val: string): string | null {
  const v = val.toLowerCase().trim();
  const map: Record<string, string> = {
    injury: "injury",
    hurt: "injury",
    fall: "injury",
    illness: "illness",
    sick: "illness",
    unwell: "illness",
    behaviour: "behaviour",
    behavior: "behaviour",
    "challenging behaviour": "behaviour",
    "missing child": "missing_child",
    missing: "missing_child",
    "near miss": "near_miss",
    "near-miss": "near_miss",
    "medication error": "medication_error",
    medication: "medication_error",
    "property damage": "property_damage",
    damage: "property_damage",
    complaint: "complaint",
  };
  return map[v] || v; // Allow custom types to pass through
}

function parseSeverity(val: string): string | null {
  const v = val.toLowerCase().trim();
  const map: Record<string, string> = {
    minor: "minor",
    low: "minor",
    moderate: "moderate",
    medium: "moderate",
    reportable: "reportable",
    high: "reportable",
    serious: "serious",
    critical: "serious",
    severe: "serious",
  };
  return map[v] || null;
}

function parseBool(val: unknown): boolean {
  if (!val) return false;
  const v = String(val).toLowerCase().trim();
  return ["yes", "true", "1", "y", "✓", "✔"].includes(v);
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
  let valid = 0;
  let invalid = 0;

  type IncidentRow = {
    serviceId: string;
    incidentDate: Date;
    childName: string | null;
    incidentType: string;
    severity: string;
    location: string | null;
    timeOfDay: string | null;
    description: string;
    actionTaken: string | null;
    parentNotified: boolean;
    reportableToAuthority: boolean;
  };
  const toCreate: IncidentRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const rowNum = i + 2;

    const mapped: Record<string, string> = {};
    for (const [header, value] of Object.entries(row)) {
      const key = columnMapping[header];
      if (key) mapped[key] = String(value ?? "").trim();
    }

    // Match service
    const centreRaw = mapped.centre;
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

    // Parse date
    const dateRaw = Object.entries(row).find(([h]) => columnMapping[h] === "date")?.[1];
    const incidentDate = parseDate(dateRaw);
    if (!incidentDate) {
      errors.push(`Row ${rowNum}: Invalid date "${dateRaw}"`);
      invalid++;
      continue;
    }

    // Parse type
    const incidentType = mapped.incidentType ? parseIncidentType(mapped.incidentType) : null;
    if (!incidentType) {
      errors.push(`Row ${rowNum}: Missing incident type`);
      invalid++;
      continue;
    }

    // Parse severity
    const severity = mapped.severity ? parseSeverity(mapped.severity) : null;
    if (!severity) {
      errors.push(`Row ${rowNum}: Invalid severity "${mapped.severity}" (use minor, moderate, reportable, serious)`);
      invalid++;
      continue;
    }

    // Description is required
    const description = mapped.description;
    if (!description) {
      errors.push(`Row ${rowNum}: Missing description`);
      invalid++;
      continue;
    }

    toCreate.push({
      serviceId,
      incidentDate,
      childName: mapped.childName || null,
      incidentType,
      severity,
      location: mapped.location || null,
      timeOfDay: mapped.timeOfDay || null,
      description,
      actionTaken: mapped.actionTaken || null,
      parentNotified: parseBool(mapped.parentNotified),
      reportableToAuthority: parseBool(mapped.reportable),
    });
    valid++;

    preview.push({
      centre: services.find((s) => s.id === serviceId)?.name || "—",
      date: incidentDate.toISOString().split("T")[0],
      type: incidentType,
      severity,
      childName: mapped.childName || "—",
      description: description.slice(0, 60) + (description.length > 60 ? "…" : ""),
    });
  }

  if (mode === "dry-run") {
    return NextResponse.json({
      valid,
      invalid,
      errors,
      preview,
      columns: ["centre", "date", "type", "severity", "childName", "description"],
    });
  }

  // Execute
  let created = 0;
  let skipped = 0;
  const execErrors: string[] = [];

  for (const row of toCreate) {
    try {
      await prisma.incidentRecord.create({
        data: {
          ...row,
          createdById: session!.user.id,
        },
      });
      created++;
    } catch (err) {
      execErrors.push(`Row failed: ${err instanceof Error ? err.message : "Unknown"}`);
      skipped++;
    }
  }

  return NextResponse.json({ created, skipped, errors: execErrors });
}
