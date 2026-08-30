import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
import { recomputeRocksProgress } from "@/lib/todos/recompute-rock-progress";

import { parseJsonBody } from "@/lib/api-error";
const bulkActionSchema = z.object({
  action: z.enum(["complete", "delete", "assign"]),
  ids: z.array(z.string().min(1)).min(1).max(200),
  assigneeId: z.string().min(1).optional(),
});

export const POST = withApiAuth(async (req, session) => {
try {
  const body = await parseJsonBody(req);
  const parsed = bulkActionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { action, ids, assigneeId } = parsed.data;

  // Validate the todos exist (and aren't already soft-deleted)
  const todos = await prisma.todo.findMany({
    where: { id: { in: ids }, deleted: false },
    select: { id: true, rockId: true },
  });
  const validIds = todos.map((t) => t.id);

  if (validIds.length === 0) {
    return NextResponse.json(
      { error: "No valid to-dos found" },
      { status: 404 },
    );
  }

  switch (action) {
    case "complete": {
      await prisma.todo.updateMany({
        where: { id: { in: validIds } },
        data: { status: "complete", completedAt: new Date() },
      });
      // updateMany bypasses the single-todo PATCH path, so recompute
      // linked rocks' percentComplete here too — same shared helper.
      await recomputeRocksProgress(prisma, todos.map((t) => t.rockId));
      return NextResponse.json({ updated: validIds.length });
    }

    case "delete": {
      // Soft delete, matching DELETE /api/todos/[id] — a bulk hard
      // deleteMany here used to silently bypass the audit trail.
      await prisma.todo.updateMany({
        where: { id: { in: validIds } },
        data: { deleted: true },
      });
      await prisma.activityLog.create({
        data: {
          userId: session!.user.id,
          action: "bulk_delete",
          entityType: "Todo",
          entityId: validIds[0],
          details: { ids: validIds, count: validIds.length },
        },
      });
      return NextResponse.json({ deleted: validIds.length });
    }

    case "assign": {
      if (!assigneeId) {
        return NextResponse.json(
          { error: "assigneeId is required for assign action" },
          { status: 400 },
        );
      }

      // Validate assignee exists
      const user = await prisma.user.findFirst({
        where: { id: assigneeId, active: true },
      });
      if (!user) {
        return NextResponse.json(
          { error: "Invalid assignee" },
          { status: 400 },
        );
      }

      await prisma.todo.updateMany({
        where: { id: { in: validIds } },
        data: { assigneeId },
      });
      return NextResponse.json({ updated: validIds.length });
    }

    default:
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  } catch (err) {
    logger.error("Bulk todo action error", { err });
    return NextResponse.json(
      { error: "Failed to perform bulk action" },
      { status: 500 },
    );
  }
});
