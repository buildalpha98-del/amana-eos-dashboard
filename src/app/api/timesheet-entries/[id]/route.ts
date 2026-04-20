import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
const updateEntrySchema = z.object({
  date: z.string().optional(),
  shiftStart: z.string().optional(),
  shiftEnd: z.string().optional(),
  breakMinutes: z.number().min(0).optional(),
  shiftType: z
    .enum(["shift_bsc", "shift_asc", "shift_vac", "pd", "shift_admin", "shift_other"])
    .optional(),
  notes: z.string().optional().nullable(),
  payRate: z.number().optional().nullable(),
  isOvertime: z.boolean().optional(),
});

// PATCH /api/timesheet-entries/[id] — update single entry
export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const body = await parseJsonBody(req);
  const parsed = updateEntrySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const existing = await prisma.timesheetEntry.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = { ...parsed.data };

  // Recalculate totalHours if shift times or break changed
  if (parsed.data.shiftStart || parsed.data.shiftEnd || parsed.data.breakMinutes !== undefined) {
    const shiftStart = parsed.data.shiftStart
      ? new Date(parsed.data.shiftStart)
      : existing.shiftStart;
    const shiftEnd = parsed.data.shiftEnd
      ? new Date(parsed.data.shiftEnd)
      : existing.shiftEnd;
    const breakMins =
      parsed.data.breakMinutes !== undefined
        ? parsed.data.breakMinutes
        : existing.breakMinutes;

    if (parsed.data.shiftStart) data.shiftStart = new Date(parsed.data.shiftStart);
    if (parsed.data.shiftEnd) data.shiftEnd = new Date(parsed.data.shiftEnd);
    if (parsed.data.date) data.date = new Date(parsed.data.date);

    const diffMs = shiftEnd.getTime() - shiftStart.getTime();
    data.totalHours =
      Math.max(
        0,
        Math.round((diffMs / (1000 * 60 * 60) - breakMins / 60) * 100) / 100
      );
  } else if (parsed.data.date) {
    data.date = new Date(parsed.data.date);
  }

  const updated = await prisma.timesheetEntry.update({
    where: { id },
    data: data as any,
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json(updated);
}, { roles: ["owner", "head_office", "admin"] });

// DELETE /api/timesheet-entries/[id] — delete single entry
export const DELETE = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const existing = await prisma.timesheetEntry.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  await prisma.timesheetEntry.delete({ where: { id } });

  return NextResponse.json({ success: true });
}, { roles: ["owner", "head_office", "admin"] });
