import type { Session } from "next-auth";
import type { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api-error";
import { getCentreScope } from "@/lib/centre-scope";

/**
 * Role scoping for Ambassadors records, following the repo's centre-scope
 * conventions (head_office = attached centres via UserServiceMembership,
 * per Daniel 2026-07-13 — NOT state-based):
 *
 * - staff (Educator): ONLY records where they are the credited educator.
 * - member (Director): records at their centres.
 * - head_office (State Manager): records at their attached centres.
 * - admin / owner: everything.
 */
export async function ambassadorRecordWhere(
  session: Session,
): Promise<Prisma.AmbassadorEnrolmentWhereInput> {
  const role = session.user.role as string;
  const userId = session.user.id as string;

  if (role === "staff") {
    return { creditedEducatorId: userId };
  }

  const { serviceIds } = await getCentreScope(session);
  if (serviceIds === null) return {};
  if (serviceIds.length === 0) return { id: "__no_access__" };
  return { serviceId: { in: serviceIds } };
}

/**
 * Throws 404 (not 403 — don't confirm the record exists) when the record
 * is outside the caller's scope.
 */
export function assertRecordInScope(
  record: { serviceId: string; creditedEducatorId: string | null },
  session: Session,
  serviceIds: string[] | null,
): void {
  const role = session.user.role as string;
  const userId = session.user.id as string;

  if (role === "staff") {
    if (record.creditedEducatorId !== userId) {
      throw ApiError.notFound("Ambassador record not found");
    }
    return;
  }
  if (serviceIds !== null && !serviceIds.includes(record.serviceId)) {
    throw ApiError.notFound("Ambassador record not found");
  }
}
