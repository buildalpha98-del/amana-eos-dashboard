import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";

/**
 * Assign an onboarding pack to a user, pre-creating a progress row per task.
 *
 * Extracted from `POST /api/onboarding/assign` (2026-09-04) so the
 * hire→employee conversion route can share it — behaviour is identical to
 * the original inline logic:
 *   - already assigned → 409 ("This pack is already assigned to this user")
 *   - pack missing or soft-deleted → 404 ("Pack not found")
 *   - success → returns the created assignment (user/pack/progress included)
 *     and writes an `assign_onboarding` activity-log row.
 *
 * A concurrent-create race that slips past the findUnique pre-check surfaces
 * as Prisma P2002 on the `userId_packId` unique — mapped to the same 409.
 */
export async function assignOnboardingPack(opts: {
  userId: string;
  packId: string;
  dueDate?: string | null;
  /** Who performed the assignment (for the activity log). */
  actorId: string;
}) {
  const { userId, packId, dueDate, actorId } = opts;

  const existing = await prisma.staffOnboarding.findUnique({
    where: { userId_packId: { userId, packId } },
  });
  if (existing) {
    throw ApiError.conflict("This pack is already assigned to this user");
  }

  const pack = await prisma.onboardingPack.findUnique({
    where: { id: packId },
    include: { tasks: true },
  });
  if (!pack || pack.deleted) {
    throw ApiError.notFound("Pack not found");
  }

  let assignment;
  try {
    assignment = await prisma.staffOnboarding.create({
      data: {
        userId,
        packId,
        dueDate: dueDate ? new Date(dueDate) : null,
        progress: {
          create: pack.tasks.map((task) => ({
            taskId: task.id,
            completed: false,
          })),
        },
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        pack: { select: { id: true, name: true } },
        progress: true,
      },
    });
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      throw ApiError.conflict("This pack is already assigned to this user");
    }
    throw err;
  }

  await prisma.activityLog.create({
    data: {
      userId: actorId,
      action: "assign_onboarding",
      entityType: "StaffOnboarding",
      entityId: assignment.id,
      details: {
        userName: assignment.user.name,
        packName: assignment.pack.name,
      },
    },
  });

  return assignment;
}
