import type { Prisma, SessionType } from "@prisma/client";
import { ApiError } from "@/lib/api-error";

/** Call inside withStatementLock, before inserting or replacing any lines. */
export async function assertUnbilledLines(
  tx: Prisma.TransactionClient,
  serviceId: string,
  lines: ReadonlyArray<{ childId: string; date: string; sessionType: SessionType }>,
  editingStatementId?: string,
): Promise<void> {
  const childIds = [...new Set(lines.map(line => line.childId))];
  const children = await tx.child.findMany({
    where: { id: { in: childIds }, serviceId }, select: { id: true },
  });
  if (children.length !== childIds.length) {
    throw ApiError.badRequest("Every child must belong to this service");
  }
  const overlapping = await tx.statementLineItem.findFirst({
    where: {
      ...(editingStatementId ? { statementId: { not: editingStatementId } } : {}),
      statement: { status: { not: "void" } },
      OR: lines.map(line => ({ childId: line.childId, date: new Date(line.date), sessionType: line.sessionType })),
    },
    select: { id: true },
  });
  if (overlapping) throw ApiError.conflict("A session is already on a live statement");
}
