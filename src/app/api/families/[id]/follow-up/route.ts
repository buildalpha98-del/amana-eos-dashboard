/**
 * POST /api/families/[id]/follow-up — "We called them" on an unfinished
 * enrolment form. Hides the family from the Follow-ups call list for 14
 * days and records who called. A coordinator may only mark families
 * whose form is for their own centre.
 */
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { ADMIN_ROLES, isAdminRole } from "@/lib/role-permissions";
import { draftServiceId } from "@/lib/enrolment-follow-ups";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withApiAuth(
  async (_req, session, context) => {
    const { id } = await (context as unknown as Ctx).params;
    const account = await prisma.parentAccount.findUnique({ where: { id }, select: { id: true, email: true } });
    if (!account) throw ApiError.notFound("Family not found");
    if (!isAdminRole(session.user.role)) {
      const own = (session.user as { serviceId?: string | null }).serviceId ?? null;
      if (!own || (await draftServiceId(id)) !== own) throw ApiError.forbidden("This family isn't at your centre.");
    }
    await prisma.parentAccount.update({ where: { id }, data: { followUpCalledAt: new Date() } });
    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: "enrolment_follow_up_called",
        entityType: "ParentAccount",
        entityId: id,
        details: { email: account.email },
      },
    });
    return NextResponse.json({ ok: true });
  },
  { roles: [...ADMIN_ROLES, "member"] },
);
