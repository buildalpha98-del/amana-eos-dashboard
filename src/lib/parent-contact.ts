import { prisma } from "@/lib/prisma";
import type { ParentJwtPayload } from "@/lib/parent-auth";
import type { CentreContact } from "@prisma/client";

/**
 * Resolve the CentreContact record that represents this parent at a given
 * service. Parents can have multiple CentreContact rows (one per service),
 * keyed by `(email, serviceId)`.
 *
 * Returns `null` when the parent is authenticated but has no contact record
 * for the target service — callers should treat this as a 403, not 500.
 */
export async function resolveParentContactForService(
  parent: ParentJwtPayload,
  serviceId: string,
): Promise<CentreContact | null> {
  return prisma.centreContact.findFirst({
    where: { email: parent.email.toLowerCase(), serviceId },
  });
}
