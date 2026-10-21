/** Amana HQ is head office's (the tracker said "For Jayden and Daniel only"). */
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES } from "@/lib/role-permissions";
import { getStateScope } from "@/lib/service-scope";

export const HQ_ROLES = [...ADMIN_ROLES];

/** State-scoped State Managers see their state's centres; everyone else all. */
export async function hqServiceIds(session: Parameters<typeof getStateScope>[0]): Promise<string[] | null> {
  const state = getStateScope(session);
  if (!state) return null;
  return (await prisma.service.findMany({ where: { state }, select: { id: true } })).map((s) => s.id);
}
