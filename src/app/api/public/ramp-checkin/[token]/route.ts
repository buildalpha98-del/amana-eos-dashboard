import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiHandler } from "@/lib/api-handler";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIpFromRequest } from "@/lib/activation-qr";
import { submitRampCheckIn } from "@/lib/ramp/checkin";

/**
 * Public (unauthenticated) weekly ramp check-in — the starter answers from
 * the emailed link with no login. `token` IS the secret. Same IP rate-limit
 * pattern as the other public forms (help-centre tickets, the legacy
 * onboarding check-in).
 */

type RouteCtx = { params: Promise<{ token: string }> };

export const GET = withApiHandler(async (_req, context) => {
  const { token } = await (context as unknown as RouteCtx).params;
  const checkIn = await prisma.rampCheckIn.findUnique({
    where: { token },
    select: {
      weekNumber: true,
      submittedAt: true,
      ramp: { select: { status: true, user: { select: { name: true } } } },
    },
  });
  if (!checkIn) throw ApiError.notFound("This link isn't valid.");

  return NextResponse.json({
    name: checkIn.ramp.user.name.trim().split(/\s+/)[0] || checkIn.ramp.user.name,
    weekNumber: checkIn.weekNumber,
    alreadySubmitted: !!checkIn.submittedAt,
    closed: checkIn.ramp.status === "completed" || checkIn.ramp.status === "ended",
  });
});

const submitSchema = z.object({
  mood: z.number().int().min(1).max(5),
  wentWell: z.string().max(3000).optional(),
  struggling: z.string().max(3000).optional(),
  needsHelp: z.boolean().optional().default(false),
  helpDetail: z.string().max(3000).optional(),
});

export const POST = withApiHandler(async (req, context) => {
  const ip = clientIpFromRequest(req) ?? "anon";
  const rl = await checkRateLimit(`ramp-checkin:${ip}`, 10, 15 * 60_000);
  if (rl.limited) {
    throw new ApiError(429, "Too many submissions — please try again in a few minutes");
  }

  const { token } = await (context as unknown as RouteCtx).params;
  const raw = await parseJsonBody(req);
  const parsed = submitSchema.safeParse(raw);
  if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten());

  const clean = (s?: string) => (s && s.trim() ? s.trim() : null);
  const exists = await prisma.rampCheckIn.findUnique({ where: { token }, select: { id: true } });
  if (!exists) throw ApiError.notFound("This link isn't valid.");

  const result = await submitRampCheckIn(prisma, token, {
    mood: parsed.data.mood,
    wentWell: clean(parsed.data.wentWell),
    struggling: clean(parsed.data.struggling),
    needsHelp: parsed.data.needsHelp,
    helpDetail: clean(parsed.data.helpDetail),
  });

  return NextResponse.json({ ok: true, ...result });
});
