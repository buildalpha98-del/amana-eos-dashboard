/**
 * POST /api/enrolments/[id]/first-day { action: attended | absent | called }
 * — the first-day check in Enrolments → Follow-ups (src/lib/first-day-check.ts).
 * "attended" releases the "how did it go?" email; "absent" keeps it held;
 * "called" takes the family off the call list. Admin tier anywhere; a
 * coordinator only for their own centre.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { ADMIN_ROLES, isAdminRole } from "@/lib/role-permissions";
import { recordFirstDay } from "@/lib/first-day-check";

const bodySchema = z.object({ action: z.enum(["attended", "absent", "called"]) }).strict();

export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    const parsed = bodySchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) throw ApiError.badRequest("Choose attended, didn't attend or called");
    const sub = await prisma.enrolmentSubmission.findUnique({ where: { id }, select: { id: true, serviceId: true, status: true } });
    if (!sub) throw ApiError.notFound("Enrolment not found");
    if (!isAdminRole(session.user.role)) {
      const own = (session.user as { serviceId?: string | null }).serviceId ?? null;
      if (!own || sub.serviceId !== own) throw ApiError.forbidden("This family isn't at your centre.");
    }
    if (sub.status !== "processed") throw ApiError.badRequest("Confirm the enrolment first.");
    await recordFirstDay(id, parsed.data.action, session.user.id);
    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: `enrolment_first_day_${parsed.data.action}`,
        entityType: "EnrolmentSubmission",
        entityId: id,
        details: { action: parsed.data.action },
      },
    });
    return NextResponse.json({ ok: true });
  },
  { roles: [...ADMIN_ROLES, "member"] },
);
