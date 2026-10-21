/**
 * POST /api/children/[id]/quiet-follow-up — "We called them" on a quiet
 * family in Enrolments → Follow-ups (src/lib/quiet-families.ts). Admin tier
 * anywhere; a coordinator only for their own centre.
 */
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { ADMIN_ROLES, isAdminRole } from "@/lib/role-permissions";

export const POST = withApiAuth(
  async (_req, session, context) => {
    const { id } = await context!.params!;
    const child = await prisma.child.findUnique({ where: { id }, select: { id: true, serviceId: true, firstName: true } });
    if (!child) throw ApiError.notFound("Child not found");
    if (!isAdminRole(session.user.role)) {
      const own = (session.user as { serviceId?: string | null }).serviceId ?? null;
      if (!own || child.serviceId !== own) throw ApiError.forbidden("This family isn't at your centre.");
    }
    await prisma.child.update({ where: { id }, data: { quietFollowUpAt: new Date() } });
    await prisma.activityLog.create({
      data: { userId: session.user.id, action: "quiet_family_called", entityType: "Child", entityId: id, details: { child: child.firstName } },
    });
    return NextResponse.json({ ok: true });
  },
  { roles: [...ADMIN_ROLES, "member"] },
);
