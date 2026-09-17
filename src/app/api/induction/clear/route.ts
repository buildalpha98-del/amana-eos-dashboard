/**
 * POST /api/induction/clear — an owner/State Manager releases someone from the
 * induction gate outright.
 *
 * WHY THIS EXISTS (2026-09-17)
 * ---------------------------
 * The gate had no admin exit. `/signoff` only clears a user already sitting at
 * `awaiting_signoff` with every blocker met, and `/override` grants a bounded
 * window to be rostered without touching locked-mode, so the person still sees
 * a four-item sidebar. Anyone who landed in `new_starter`/`in_training` with
 * expired grace was stuck there, and real coordinators were locked out of
 * their own centre with no way for leadership to let them back in.
 *
 * This is deliberately a judgement call, not a bypass of the checks: it is
 * owner/head_office only, demands a written reason, and is audited. The
 * everyday path to cleared is still finishing the induction.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const bodySchema = z.object({
  userId: z.string().min(1),
  reason: z.string().trim().min(3, "Say why — this is audited."),
});

export const POST = withApiAuth(
  async (req, session) => {
    const parsed = bodySchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid input", parsed.error.flatten());
    }
    const { userId, reason } = parsed.data;
    const clearedById = session!.user.id;

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, inductionStatus: true },
    });
    if (!target) throw ApiError.notFound("User not found");

    if (target.inductionStatus === "cleared") {
      // Not an error — two admins reaching for the same stuck account is the
      // likeliest way this gets called twice.
      return NextResponse.json({ ok: true, status: "cleared", alreadyCleared: true });
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        inductionStatus: "cleared",
        inductionClearedAt: new Date(),
        inductionClearedById: clearedById,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: clearedById,
        action: "induction.clear",
        entityType: "User",
        entityId: userId,
        details: { reason, previousStatus: target.inductionStatus },
      },
    });

    logger.info("Induction cleared by admin", {
      userId,
      clearedById,
      previousStatus: target.inductionStatus,
    });

    return NextResponse.json({ ok: true, status: "cleared" });
  },
  { roles: ["owner", "head_office"] },
);
