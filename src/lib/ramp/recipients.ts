/**
 * Who watches a starter's ramp: their service manager plus every active
 * State Manager (head_office). Decision 2026-09-14 (Jayden): both, not
 * State Managers only.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export interface RampWatcher {
  id: string;
  name: string;
  email: string;
}

export async function resolveRampWatchers(db: Db, starterUserId: string): Promise<RampWatcher[]> {
  const starter = await db.user.findUnique({
    where: { id: starterUserId },
    select: { service: { select: { managerId: true } } },
  });
  const managerId = starter?.service?.managerId ?? null;

  const users = await db.user.findMany({
    where: {
      active: true,
      OR: [{ role: "head_office" }, ...(managerId ? [{ id: managerId }] : [])],
    },
    select: { id: true, name: true, email: true },
  });

  const seen = new Set<string>();
  return users.filter((u) => {
    if (u.id === starterUserId || seen.has(u.id)) return false;
    seen.add(u.id);
    return true;
  });
}

/** True when `viewer` may submit checkpoints for this starter. */
export async function canReviewRamp(
  db: Db,
  viewer: { id: string; role: string | null },
  starterUserId: string,
): Promise<boolean> {
  if (viewer.role === "owner" || viewer.role === "head_office" || viewer.role === "admin") return true;
  const starter = await db.user.findUnique({
    where: { id: starterUserId },
    select: { service: { select: { managerId: true } } },
  });
  return !!starter?.service?.managerId && starter.service.managerId === viewer.id;
}
