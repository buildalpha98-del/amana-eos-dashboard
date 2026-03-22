import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";

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

const postSchema = z.object({
  dryRun: z.boolean().default(false),
  data: z.array(z.object({
    day: z.string().optional(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    staffName: z.string().optional(),
    location: z.string().optional(),
  })).min(1, "data array required"),
  weekStart: z.string().min(1, "weekStart required"),
});

// POST /api/services/[id]/programs/import
export const POST = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;
  const body = await req.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { dryRun, data, weekStart } = parsed.data;

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
});
