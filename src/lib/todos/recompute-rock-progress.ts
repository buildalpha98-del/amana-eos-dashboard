import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Recompute a Rock's percentComplete from its linked, non-deleted todos.
 * The ONLY place this derivation lives — used by the single-todo PATCH
 * and the bulk complete action so the two paths cannot diverge.
 */
export async function recomputeRockProgress(
  db: Db,
  rockId: string,
): Promise<void> {
  const linked = await db.todo.findMany({
    where: { rockId, deleted: false },
    select: { status: true },
  });
  const total = linked.length;
  const completed = linked.filter((t) => t.status === "complete").length;
  const percentComplete = total > 0 ? Math.round((completed / total) * 100) : 0;
  await db.rock.update({ where: { id: rockId }, data: { percentComplete } });
}

/** Recompute several rocks at once, deduplicating and skipping nulls. */
export async function recomputeRocksProgress(
  db: Db,
  rockIds: Array<string | null>,
): Promise<void> {
  const distinct = [...new Set(rockIds.filter((id): id is string => !!id))];
  for (const rockId of distinct) {
    await recomputeRockProgress(db, rockId);
  }
}
