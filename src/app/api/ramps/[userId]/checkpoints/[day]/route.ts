import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { RAMP_COMPETENCY_KEYS } from "@/lib/ramp/constants";
import { canReviewRamp } from "@/lib/ramp/recipients";
import { submitRampCheckpoint } from "@/lib/ramp/checkpoint";

/**
 * POST /api/ramps/[userId]/checkpoints/[day] — the manager's 30/60/90
 * competency rating. Allowed: admin tier, or the coordinator who manages
 * the starter's service. Never the starter themselves.
 */
const bodySchema = z.object({
  ratings: z
    .object(Object.fromEntries(RAMP_COMPETENCY_KEYS.map((k) => [k, z.number().int().min(1).max(5)])))
    .strict(),
  summary: z.string().max(4000).optional(),
  recommendation: z.enum(["on_track", "needs_support", "at_risk", "pass", "extend", "end"]),
});

export const POST = withApiAuth(
  async (req, session, context) => {
    const { userId, day: dayParam } = await context!.params!;
    const day = Number(dayParam);
    if (!Number.isInteger(day) || day <= 0) throw ApiError.badRequest("Invalid checkpoint day");

    const viewer = { id: session!.user.id, role: session!.user.role ?? null, name: session!.user.name ?? "A manager" };
    if (viewer.id === userId) throw ApiError.forbidden("You can't review your own ramp");
    if (!(await canReviewRamp(prisma, viewer, userId))) {
      throw ApiError.forbidden("Only the service manager or a State Manager/Admin can submit a checkpoint");
    }

    const raw = await parseJsonBody(req);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten());

    const result = await submitRampCheckpoint(prisma, {
      userId,
      day,
      reviewer: { id: viewer.id, name: viewer.name },
      ratings: parsed.data.ratings,
      summary: parsed.data.summary?.trim() || null,
      recommendation: parsed.data.recommendation,
    });

    return NextResponse.json({ ok: true, ...result });
  },
  { roles: ["owner", "head_office", "admin", "member"], rateLimit: { max: 20, windowMs: 60_000 } },
);
