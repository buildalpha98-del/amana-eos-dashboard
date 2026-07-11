import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";

const ORG_WIDE_ROLES = new Set(["owner", "head_office", "admin"]);

/**
 * Load a QIP and enforce service scoping: org-wide roles pass, members must
 * belong to the QIP's service. Throws ApiError (404/403).
 */
export async function requireQipAccess(
  qipId: string,
  session: { user: { role: string; serviceId?: string | null } },
): Promise<{ id: string; serviceId: string; documentType: string }> {
  const qip = await prisma.qualityImprovementPlan.findUnique({
    where: { id: qipId },
    select: { id: true, serviceId: true, documentType: true },
  });
  if (!qip) throw ApiError.notFound("QIP not found");
  if (
    !ORG_WIDE_ROLES.has(session.user.role) &&
    session.user.serviceId !== qip.serviceId
  ) {
    throw ApiError.forbidden("You do not have access to this service's document");
  }
  return qip;
}

export const QIP_WRITE_ROLES: Role[] = ["owner", "head_office", "admin", "member"];
