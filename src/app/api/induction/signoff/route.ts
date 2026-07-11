/**
 * POST /api/induction/signoff — a State Manager / Admin signs off one practical
 * checklist item for a new starter.
 *
 * Signer roles: head_office, admin, owner (== ADMIN_ROLES). A signer cannot
 * sign off their own induction. When every active checklist item is signed AND
 * readiness passes AND the user is awaiting_signoff, they are cleared.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { ADMIN_ROLES } from "@/lib/role-permissions";
import { getInductionReadiness } from "@/lib/induction";

const bodySchema = z.object({
  userId: z.string().min(1),
  itemId: z.string().min(1),
  notes: z.string().optional(),
});

export const POST = withApiAuth(
  async (req, session) => {
    const signerId = session!.user.id;
    const body = await parseJsonBody(req);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid input", parsed.error.flatten());
    }
    const { userId, itemId, notes } = parsed.data;

    if (userId === signerId) {
      throw ApiError.forbidden("You cannot sign off your own induction.");
    }

    await prisma.practicalSignoff.upsert({
      where: { userId_itemId: { userId, itemId } },
      update: { signedById: signerId, signedAt: new Date(), notes: notes ?? null },
      create: { userId, itemId, signedById: signerId, notes: notes ?? null },
    });

    // Has this completed the practical? If so, and readiness passes, and the
    // user is awaiting_signoff → clear them.
    const [items, signoffs, user] = await Promise.all([
      prisma.practicalChecklistItem.findMany({ where: { active: true }, select: { id: true } }),
      prisma.practicalSignoff.findMany({ where: { userId }, select: { itemId: true } }),
      prisma.user.findUnique({ where: { id: userId }, select: { inductionStatus: true } }),
    ]);
    const signedIds = new Set(signoffs.map((s) => s.itemId));
    const allSigned = items.length > 0 && items.every((it) => signedIds.has(it.id));

    let status = user?.inductionStatus ?? "cleared";
    if (allSigned && status === "awaiting_signoff") {
      const { ready } = await getInductionReadiness(userId);
      if (ready) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            inductionStatus: "cleared",
            inductionClearedAt: new Date(),
            inductionClearedById: signerId,
          },
        });
        status = "cleared";
      }
    }

    return NextResponse.json({ ok: true, status, allSigned });
  },
  { roles: [...ADMIN_ROLES] },
);
