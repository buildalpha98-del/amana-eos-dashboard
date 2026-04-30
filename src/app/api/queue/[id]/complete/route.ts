import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { isAdminRole } from "@/lib/role-permissions";

/**
 * POST /api/queue/[id]/complete — mark a CoworkTodo as completed.
 *
 * Only the assignee (or owner/head_office/admin) may complete. Non-assignee
 * non-admins receive 403.
 */
export const POST = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const userId = session!.user.id;
  const role = session!.user.role;

  const todo = await prisma.coworkTodo.findUnique({ where: { id } });
  if (!todo) {
    return NextResponse.json({ error: "Todo not found" }, { status: 404 });
  }

  const isAssignee = todo.assignedToId === userId;
  if (!isAssignee && !isAdminRole(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated = await prisma.coworkTodo.update({
    where: { id },
    data: {
      completed: true,
      completedAt: new Date(),
      completedBy: userId,
    },
  });

  return NextResponse.json({ todo: updated });
});
