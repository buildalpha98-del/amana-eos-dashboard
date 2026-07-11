/**
 * Annual training calendar — 12 month slots, each mapping to monthly-track
 * courses the monthly cron auto-assigns.
 *   GET  /api/training-calendar — all slots with course info (any authed user).
 *   POST /api/training-calendar — add a slot { month, courseId } (admin).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { ADMIN_ROLES } from "@/lib/role-permissions";

export const GET = withApiAuth(async () => {
  const slots = await prisma.trainingCalendarSlot.findMany({
    include: {
      course: { select: { id: true, title: true, status: true, track: true } },
    },
    orderBy: { month: "asc" },
  });
  return NextResponse.json(slots);
});

const createSchema = z.object({
  month: z.number().int().min(1).max(12),
  courseId: z.string().min(1),
  active: z.boolean().optional(),
});

export const POST = withApiAuth(
  async (req) => {
    const body = await parseJsonBody(req);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid input", parsed.error.flatten());
    }
    // Upsert on the unique (month, courseId).
    const slot = await prisma.trainingCalendarSlot.upsert({
      where: {
        month_courseId: { month: parsed.data.month, courseId: parsed.data.courseId },
      },
      update: { active: parsed.data.active ?? true },
      create: {
        month: parsed.data.month,
        courseId: parsed.data.courseId,
        active: parsed.data.active ?? true,
      },
    });
    return NextResponse.json(slot, { status: 201 });
  },
  { roles: [...ADMIN_ROLES] },
);
