/**
 * POST /api/separations/[id]/finalise
 *
 * The "they've actually left, do the side-effects" endpoint. Owner only.
 *
 * What happens in one transaction:
 *   1. Stamp `finalisedAt` + `finalisedById` + `successorUserId` on
 *      the SeparationRecord (idempotency guard — running twice is
 *      a no-op).
 *   2. Flip `User.active = false`.
 *   3. Clear `User.employmentHeroEmployeeId` (so My Portal cards
 *      cleanly go to "not mapped" rather than showing stale data).
 *   4. If a `successorUserId` was provided:
 *      - Transfer Rock ownership (active rocks: on_track / off_track)
 *      - Transfer open Todo assignment (pending / in_progress)
 *      - Transfer Issue ownership (open / in_discussion)
 *   5. Bump `tokenVersion` so any existing session is invalidated.
 *   6. Log the orchestration outcome.
 *
 * What does NOT happen (deliberate):
 *   - Compliance certs, contracts, qualifications STAY linked to the
 *     leaving user (they're THEIR records, not the successor's).
 *   - Documents assigned to them STAY assigned (same logic).
 *   - Past activity-log entries are immutable.
 *
 * Idempotency: re-finalising returns 200 with the existing state
 * rather than re-running the side-effects.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const bodySchema = z.object({
  // Optional — leave null to deactivate-only (no transfer).
  successorUserId: z.string().min(1).nullable().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await (context as unknown as RouteContext).params;
    const raw = await parseJsonBody(req);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest(
        "Validation failed",
        parsed.error.flatten().fieldErrors,
      );
    }
    const successorUserId = parsed.data.successorUserId ?? null;

    const existing = await prisma.separationRecord.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true, active: true } } },
    });
    if (!existing || existing.deleted) {
      throw ApiError.notFound("Separation record not found");
    }

    // Idempotency — if already finalised, return the current state.
    if (existing.finalisedAt) {
      return NextResponse.json({
        alreadyFinalised: true,
        record: existing,
      });
    }

    // Sanity-check the successor (if provided) is a different active user.
    if (successorUserId) {
      if (successorUserId === existing.userId) {
        throw ApiError.badRequest(
          "Successor cannot be the leaving staff member.",
        );
      }
      const successor = await prisma.user.findUnique({
        where: { id: successorUserId },
        select: { id: true, name: true, active: true },
      });
      if (!successor || !successor.active) {
        throw ApiError.badRequest(
          "Successor must be an active dashboard user.",
        );
      }
    }

    // Do everything in a single transaction so we never end up with
    // half-deactivated user + un-transferred work.
    const result = await prisma.$transaction(async (tx) => {
      // 1. Stamp the SeparationRecord.
      const updated = await tx.separationRecord.update({
        where: { id },
        data: {
          finalisedAt: new Date(),
          finalisedById: session!.user.id,
          successorUserId,
        },
      });

      // 2 + 3 + 5. Deactivate user, clear EH mapping, bump token version.
      await tx.user.update({
        where: { id: existing.userId },
        data: {
          active: false,
          employmentHeroEmployeeId: null,
          tokenVersion: { increment: 1 },
        },
      });

      // 4. Transfer ownership when a successor was specified.
      let transferredRocks = 0;
      let transferredTodos = 0;
      let transferredIssues = 0;
      if (successorUserId) {
        const rockUpdate = await tx.rock.updateMany({
          where: {
            ownerId: existing.userId,
            status: { in: ["on_track", "off_track"] },
          },
          data: { ownerId: successorUserId },
        });
        transferredRocks = rockUpdate.count;

        const todoUpdate = await tx.todo.updateMany({
          where: {
            assigneeId: existing.userId,
            status: { in: ["pending", "in_progress"] },
            deleted: false,
          },
          data: { assigneeId: successorUserId },
        });
        transferredTodos = todoUpdate.count;

        const issueUpdate = await tx.issue.updateMany({
          where: {
            ownerId: existing.userId,
            status: { in: ["open", "in_discussion"] },
          },
          data: { ownerId: successorUserId },
        });
        transferredIssues = issueUpdate.count;
      }

      return { updated, transferredRocks, transferredTodos, transferredIssues };
    });

    // Activity log outside the transaction — best-effort, doesn't
    // unwind the user deactivation if logging fails.
    await prisma.activityLog
      .create({
        data: {
          userId: session!.user.id,
          action: "separation_finalised",
          entityType: "SeparationRecord",
          entityId: id,
          details: {
            subjectUserId: existing.userId,
            subjectName: existing.user.name,
            successorUserId,
            transferredRocks: result.transferredRocks,
            transferredTodos: result.transferredTodos,
            transferredIssues: result.transferredIssues,
          },
        },
      })
      .catch((err) =>
        logger.warn("Separation finalise: activity log failed", {
          err: err instanceof Error ? err.message : String(err),
        }),
      );

    logger.warn("Separation finalised — user deactivated", {
      separationId: id,
      subjectUserId: existing.userId,
      subjectName: existing.user.name,
      actorId: session!.user.id,
      successorUserId,
      transferredRocks: result.transferredRocks,
      transferredTodos: result.transferredTodos,
      transferredIssues: result.transferredIssues,
    });

    return NextResponse.json({
      finalised: true,
      transferredRocks: result.transferredRocks,
      transferredTodos: result.transferredTodos,
      transferredIssues: result.transferredIssues,
      record: result.updated,
    });
  },
  { roles: ["owner"] },
);
