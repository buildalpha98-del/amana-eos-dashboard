/**
 * POST /api/onboarding/assign/bulk
 *
 * Remove an onboarding pack from several people at once.
 *
 * The mirror of /api/lms/assignments/bulk, and it exists for the same
 * reason: a default pack gets assigned broadly and a handful of accounts
 * should never have had it — head-office admins who don't work on the
 * floor, relief educators who only cover one centre.
 *
 * Kept as its own route rather than folded into the training bulk
 * endpoint. They are different tables with different completion
 * semantics, and one endpoint quietly handling both is how a caller ends
 * up deleting the wrong kind of thing because the ids looked alike.
 *
 * Completed assignments are skipped and reported, not deleted — someone
 * who finished their onboarding has a record of it, and a tidy-up of who
 * "needs" a pack must not destroy evidence that others did it. Removing
 * a completed one individually is still possible via DELETE, where the
 * intent is unambiguous.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";

const bulkSchema = z.object({
  onboardingIds: z.array(z.string().min(1)).min(1).max(500),
});

export const POST = withApiAuth(
  async (req, session) => {
    const parsed = bulkSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid request", parsed.error.flatten());
    }
    const { onboardingIds } = parsed.data;

    const found = await prisma.staffOnboarding.findMany({
      where: { id: { in: onboardingIds } },
      select: {
        id: true,
        status: true,
        user: { select: { id: true, name: true } },
        pack: { select: { id: true, name: true } },
      },
    });

    const completed = found.filter((a) => a.status === "completed");
    const removable = found.filter((a) => a.status !== "completed");

    if (removable.length > 0) {
      // Cascade handles StaffOnboardingProgress.
      await prisma.staffOnboarding.deleteMany({
        where: { id: { in: removable.map((a) => a.id) } },
      });

      // One row per removal — "who took this off whom" is the question
      // asked afterwards, and a single row saying "removed 12" cannot
      // answer it.
      await prisma.activityLog.createMany({
        data: removable.map((a) => ({
          userId: session!.user.id,
          action: "unassign_onboarding",
          entityType: "StaffOnboarding",
          entityId: a.id,
          details: {
            userName: a.user.name,
            packName: a.pack.name,
            bulk: true,
          },
        })),
      });
    }

    return NextResponse.json({
      removed: removable.length,
      skippedCompleted: completed.length,
      notFound: onboardingIds.length - found.length,
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);
