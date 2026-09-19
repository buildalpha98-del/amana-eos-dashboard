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

/**
 * One person, or everyone currently held by the gate.
 *
 * `all` exists because the per-person form does not scale to the situation
 * that creates it: a backfill run against an empty curriculum locks a whole
 * organisation at once, and clicking through them one at a time — typing a
 * reason each — is the sort of chore that gets abandoned halfway.
 */
const bodySchema = z.union([
  z.object({
    userId: z.string().min(1),
    reason: z.string().trim().min(3, "Say why — this is audited."),
  }),
  z.object({
    all: z.literal(true),
    reason: z.string().trim().min(3, "Say why — this is audited."),
  }),
]);

export const POST = withApiAuth(
  async (req, session) => {
    const parsed = bodySchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid input", parsed.error.flatten());
    }
    const { reason } = parsed.data;
    const clearedById = session!.user.id;

    // ── Everyone at once ────────────────────────────────────────────────
    if ("all" in parsed.data) {
      const stuck = await prisma.user.findMany({
        where: {
          active: true,
          inductionStatus: { in: ["new_starter", "in_training", "awaiting_signoff"] },
          // Never clear yourself in a sweep either — the gated person must not
          // be the one lifting it, whichever door they come through.
          id: { not: clearedById },
        },
        select: { id: true, inductionStatus: true },
      });

      if (stuck.length === 0) {
        return NextResponse.json({ ok: true, cleared: 0 });
      }

      const now = new Date();
      await prisma.user.updateMany({
        where: { id: { in: stuck.map((u) => u.id) } },
        data: {
          inductionStatus: "cleared",
          inductionClearedAt: now,
          inductionClearedById: clearedById,
        },
      });

      // One audit row PER PERSON, not one for the batch: "was this staff
      // member cleared, and by whom?" has to be answerable from their own
      // record months later, not by finding a sweep they happened to be in.
      await prisma.activityLog.createMany({
        data: stuck.map((u) => ({
          userId: clearedById,
          action: "induction.clear",
          entityType: "User",
          entityId: u.id,
          details: { reason, previousStatus: u.inductionStatus, bulk: true },
        })),
      });

      logger.info("Induction cleared in bulk", {
        count: stuck.length,
        clearedById,
      });

      return NextResponse.json({ ok: true, cleared: stuck.length });
    }

    const { userId } = parsed.data;

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
