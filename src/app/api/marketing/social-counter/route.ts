import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { getWeekBounds, formatIsoDate } from "@/lib/whatsapp-compliance";

const patchSchema = z.object({
  field: z.enum(["feed", "stories", "reels"]),
  delta: z.number().int(),
});

export const GET = withApiAuth(
  async (req) => {
    const url = new URL(req.url);
    const weekStartParam = url.searchParams.get("weekStart");
    const weekStart = weekStartParam
      ? new Date(`${weekStartParam}T00:00:00Z`)
      : getWeekBounds().start;

    const counter = await prisma.socialCounter.findUnique({
      where: { weekStart },
    });

    return NextResponse.json({
      weekStart: formatIsoDate(weekStart),
      feed: counter?.feed ?? 0,
      stories: counter?.stories ?? 0,
      reels: counter?.reels ?? 0,
    });
  },
  { roles: ["marketing", "owner"] },
);

export const PATCH = withApiAuth(
  async (req, session) => {
    const raw = await parseJsonBody(req);
    const parsed = patchSchema.safeParse(raw);
    if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten());

    const weekStart = getWeekBounds().start;
    const { field, delta } = parsed.data;

    const counter = await prisma.socialCounter.upsert({
      where: { weekStart },
      create: {
        weekStart,
        [field]: Math.max(0, delta),
        updatedById: session.user.id,
      },
      update: {
        [field]: { increment: delta },
        updatedById: session.user.id,
      },
    });

    if ((counter as Record<string, unknown>)[field] as number < 0) {
      await prisma.socialCounter.update({
        where: { id: counter.id },
        data: { [field]: 0 },
      });
    }

    const updated = await prisma.socialCounter.findUnique({ where: { id: counter.id } });

    return NextResponse.json({
      weekStart: formatIsoDate(weekStart),
      feed: updated?.feed ?? 0,
      stories: updated?.stories ?? 0,
      reels: updated?.reels ?? 0,
    });
  },
  { roles: ["marketing", "owner"] },
);
