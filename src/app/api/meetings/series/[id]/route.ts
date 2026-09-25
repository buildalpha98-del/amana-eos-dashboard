import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";

const updateSeriesSchema = z.object({
  name: z.string().min(1).optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  minuteOfDay: z.number().int().min(0).max(1439).optional(),
  timezone: z.string().min(1).optional(),
  isLeadership: z.boolean().optional(),
  serviceIds: z.array(z.string()).optional(),
  scorecardId: z.string().optional().nullable(),
  attendeeUserIds: z.array(z.string()).optional(),
  active: z.boolean().optional(),
});

// PATCH /api/meetings/series/[id] — edit / pause / resume
export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    const parsed = updateSeriesSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const existing = await prisma.meetingSeries.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Series not found" }, { status: 404 });
    }

    const series = await prisma.meetingSeries.update({
      where: { id },
      data: parsed.data,
    });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "update",
        entityType: "MeetingSeries",
        entityId: id,
        details: { changes: Object.keys(parsed.data) },
      },
    });

    return NextResponse.json(series);
  },
  { roles: ["owner", "head_office", "admin", "marketing", "eos_implementer"] },
);

// DELETE /api/meetings/series/[id] — hard delete; past meetings keep
// their history via the SetNull FK.
export const DELETE = withApiAuth(
  async (_req, session, context) => {
    const { id } = await context!.params!;
    const existing = await prisma.meetingSeries.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Series not found" }, { status: 404 });
    }
    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "delete",
        entityType: "MeetingSeries",
        entityId: id,
        details: { name: existing.name },
      },
    });
    await prisma.meetingSeries.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  },
  { roles: ["owner", "admin"] },
);
