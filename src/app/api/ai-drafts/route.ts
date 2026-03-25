import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

/**
 * GET /api/ai-drafts
 *
 * List AI-generated drafts for the current user's assigned todos/tasks.
 * Supports ?status=ready (default: all statuses).
 */
export const GET = withApiAuth(async (req, session) => {
  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status");
  const countOnly = url.searchParams.get("countOnly") === "true";

  const userId = session.user.id;

  // Build status filter
  const statusWhere = statusFilter ? { status: statusFilter } : {};

  // Find drafts linked to tasks assigned to the current user
  const where = {
    ...statusWhere,
    OR: [
      { todo: { assigneeId: userId } },
      { todo: { assignees: { some: { userId } } } },
      { marketingTask: { assigneeId: userId } },
      { coworkTodo: { assignedToId: userId } },
      { ticket: { assignedToId: userId } },
      { issue: { ownerId: userId } },
    ],
  };

  if (countOnly) {
    const count = await prisma.aiTaskDraft.count({ where });
    return NextResponse.json({ count });
  }

  const drafts = await prisma.aiTaskDraft.findMany({
    where,
    include: {
      todo: { select: { id: true, title: true, status: true, dueDate: true } },
      marketingTask: { select: { id: true, title: true, status: true, dueDate: true } },
      coworkTodo: { select: { id: true, title: true, completed: true, date: true } },
      ticket: { select: { id: true, ticketNumber: true, subject: true, status: true } },
      issue: { select: { id: true, title: true, status: true, priority: true } },
      reviewedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json(drafts);
});
