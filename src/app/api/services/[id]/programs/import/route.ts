import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const VALID_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const TIME_RE = /^\d{2}:\d{2}$/;

interface ImportRow {
  day?: string;
  startTime?: string;
  endTime?: string;
  title?: string;
  description?: string;
  staffName?: string;
  location?: string;
}

// POST /api/services/[id]/programs/import
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const { dryRun, data, weekStart } = body as {
    dryRun: boolean;
    data: ImportRow[];
    weekStart: string;
  };

  if (!data || !Array.isArray(data)) {
    return NextResponse.json({ error: "data array required" }, { status: 400 });
  }

  if (!weekStart) {
    return NextResponse.json({ error: "weekStart required" }, { status: 400 });
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const validRows: Array<{
    day: string;
    startTime: string;
    endTime: string;
    title: string;
    description: string | null;
    staffName: string | null;
    location: string | null;
  }> = [];

  data.forEach((row, i) => {
    const rowNum = i + 1;
    const day = (row.day || "").toLowerCase().trim();
    const startTime = (row.startTime || "").trim();
    const endTime = (row.endTime || "").trim();
    const title = (row.title || "").trim();

    if (!day || !VALID_DAYS.includes(day)) {
      errors.push(`Row ${rowNum}: Invalid day "${row.day}". Must be monday-friday.`);
      return;
    }
    if (!startTime || !TIME_RE.test(startTime)) {
      errors.push(`Row ${rowNum}: Invalid startTime "${row.startTime}". Use HH:mm format.`);
      return;
    }
    if (!endTime || !TIME_RE.test(endTime)) {
      errors.push(`Row ${rowNum}: Invalid endTime "${row.endTime}". Use HH:mm format.`);
      return;
    }
    if (!title) {
      errors.push(`Row ${rowNum}: Title is required.`);
      return;
    }
    if (startTime >= endTime) {
      warnings.push(`Row ${rowNum}: Start time ${startTime} is after end time ${endTime}.`);
    }

    validRows.push({
      day,
      startTime,
      endTime,
      title,
      description: (row.description || "").trim() || null,
      staffName: (row.staffName || "").trim() || null,
      location: (row.location || "").trim() || null,
    });
  });

  if (dryRun) {
    return NextResponse.json({
      valid: validRows.length,
      invalid: data.length - validRows.length,
      warnings,
      errors,
      preview: validRows.slice(0, 10),
      columns: ["day", "startTime", "endTime", "title", "description", "staffName", "location"],
    });
  }

  // Execute import
  if (errors.length > 0) {
    return NextResponse.json({
      created: 0,
      updated: 0,
      skipped: data.length - validRows.length,
      errors,
    });
  }

  const weekDate = new Date(weekStart);

  const result = await prisma.$transaction(async (tx) => {
    let created = 0;
    for (const row of validRows) {
      try {
        await tx.programActivity.upsert({
          where: {
            serviceId_weekStart_day_startTime: {
              serviceId: id,
              weekStart: weekDate,
              day: row.day as "monday" | "tuesday" | "wednesday" | "thursday" | "friday",
              startTime: row.startTime,
            },
          },
          update: {
            endTime: row.endTime,
            title: row.title,
            description: row.description,
            staffName: row.staffName,
            location: row.location,
          },
          create: {
            serviceId: id,
            weekStart: weekDate,
            day: row.day as "monday" | "tuesday" | "wednesday" | "thursday" | "friday",
            startTime: row.startTime,
            endTime: row.endTime,
            title: row.title,
            description: row.description,
            staffName: row.staffName,
            location: row.location,
            createdById: session!.user.id,
          },
        });
        created++;
      } catch {
        errors.push(`Failed to import: ${row.day} ${row.startTime} - ${row.title}`);
      }
    }
    return created;
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "ProgramActivity",
      entityId: id,
      details: { serviceId: id, weekStart, action: "import", count: result },
    },
  });

  return NextResponse.json({
    created: result,
    updated: 0,
    skipped: data.length - validRows.length,
    errors,
  });
}
