/**
 * Resolves the EH Payroll employee id for the currently-signed-in user.
 *
 * Wraps the "you can only see your own payroll data" rule into a single
 * helper so every My Portal route enforces it identically. Returns the
 * employee id, OR throws an `ApiError` that the surrounding
 * `withApiAuth` wrapper will translate to the right HTTP status.
 *
 * Why this exists:
 *   - The EH Payroll API key has full business access — a hostile or
 *     buggy route could query *any* employee's payslips with one URL
 *     parameter swap. This guard makes that impossible by sourcing the
 *     employee id from the session, not the request.
 *   - The mapping is nullable (some Users have no payroll record).
 *     Returning a typed throwable means callers don't need to handle
 *     a null-vs-id branch every time.
 *
 * Pattern of use:
 *
 *   export const GET = withApiAuth(async (_req, session) => {
 *     const employeeId = await requireOwnEmployee(session);
 *     const slips = await listPayslipsForEmployee(employeeId);
 *     return NextResponse.json(slips);
 *   });
 */

import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import type { Session } from "next-auth";

export async function requireOwnEmployee(session: Session): Promise<number> {
  const userId = session.user.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { active: true, employmentHeroEmployeeId: true },
  });
  if (!user) {
    // A signed-in user with no DB row is technically impossible (token
    // versions invalidate on delete), but guard anyway so a stale token
    // doesn't 500 — flip to 401 so the client clears the session.
    throw ApiError.unauthorized("User not found");
  }
  if (!user.active) {
    throw ApiError.forbidden("Account deactivated");
  }
  if (user.employmentHeroEmployeeId === null) {
    // The dashboard user exists but isn't mapped to a payroll record.
    // 404 because the *resource* (their payslips) doesn't exist for
    // them, not 403 — admins haven't denied access, payroll just doesn't
    // know about them. The UI can render "Contact HR to be set up".
    throw ApiError.notFound(
      "Your account isn't linked to a payroll record yet. Contact your manager so they can map you in Settings.",
    );
  }
  return user.employmentHeroEmployeeId;
}
