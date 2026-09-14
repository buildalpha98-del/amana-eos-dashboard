import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/role-permissions";

/**
 * Who may open /staff/[id] (and, since 2026-09-14, that person's ramp via
 * /api/ramps/[userId]): the person themselves, any admin-tier user, or a
 * coordinator (member) at the same service.
 */
export async function canAccessProfile(
  viewerId: string,
  viewerRole: string | null,
  target: { id: string; serviceId: string | null },
): Promise<boolean> {
  if (viewerId === target.id) return true;
  if (isAdminRole(viewerRole)) return true;
  if (viewerRole === "member") {
    const viewer = await prisma.user.findUnique({
      where: { id: viewerId },
      select: { serviceId: true },
    });
    return !!viewer?.serviceId && viewer.serviceId === target.serviceId;
  }
  return false;
}
