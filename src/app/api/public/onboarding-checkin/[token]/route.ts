import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiHandler } from "@/lib/api-handler";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIpFromRequest } from "@/lib/activation-qr";

/**
 * Public (unauthenticated) onboarding check-in — a new starter answers
 * "how's it going" from an emailed link with no login. `token` IS the
 * secret; there's no separate auth. Rate-limited by IP the same way as
 * the other public forms in this codebase (help-centre tickets, etc.).
 */

type RouteCtx = { params: Promise<{ token: string }> };

const MILESTONE_LABEL: Record<string, string> = {
  day_1: "first day",
  week_1: "first week",
  month_1: "first month",
};

export const GET = withApiHandler(async (_req, context) => {
  const { token } = await (context as unknown as RouteCtx).params;
  const checkIn = await prisma.newStarterCheckIn.findUnique({
    where: { token },
    select: {
      milestone: true,
      submittedAt: true,
      user: { select: { name: true } },
    },
  });
  if (!checkIn) throw ApiError.notFound("This link isn't valid.");

  return NextResponse.json({
    name: checkIn.user.name.trim().split(/\s+/)[0] || checkIn.user.name,
    milestoneLabel: MILESTONE_LABEL[checkIn.milestone] ?? checkIn.milestone,
    alreadySubmitted: !!checkIn.submittedAt,
  });
});

const submitSchema = z.object({
  mood: z.number().int().min(1).max(5),
  comments: z.string().max(3000).optional(),
});

export const POST = withApiHandler(async (req, context) => {
  const ip = clientIpFromRequest(req) ?? "anon";
  const rl = await checkRateLimit(`onboarding-checkin:${ip}`, 10, 15 * 60_000);
  if (rl.limited) {
    throw new ApiError(429, "Too many submissions — please try again in a few minutes");
  }

  const { token } = await (context as unknown as RouteCtx).params;
  const raw = await parseJsonBody(req);
  const parsed = submitSchema.safeParse(raw);
  if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten());

  const checkIn = await prisma.newStarterCheckIn.findUnique({ where: { token } });
  if (!checkIn) throw ApiError.notFound("This link isn't valid.");
  if (checkIn.submittedAt) {
    return NextResponse.json({ ok: true, alreadySubmitted: true });
  }

  await prisma.newStarterCheckIn.update({
    where: { token },
    data: {
      mood: parsed.data.mood,
      comments: parsed.data.comments?.trim() || null,
      submittedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
});
