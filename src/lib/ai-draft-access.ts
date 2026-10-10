import type { Prisma } from "@prisma/client";

/** Personal draft visibility, shared by listing and review mutations. */
export function assignedDraftWhere(userId: string): Prisma.AiTaskDraftWhereInput {
  return {
    OR: [
      { todo: { assigneeId: userId } },
      { todo: { assignees: { some: { userId } } } },
      { marketingTask: { assigneeId: userId } },
      { coworkTodo: { assignedToId: userId } },
      { ticket: { assignedToId: userId } },
      { issue: { ownerId: userId } },
    ],
  };
}
