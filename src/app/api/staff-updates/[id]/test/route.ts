/** POST — send this staff email to me only, exactly as staff will see it. */
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { ADMIN_ROLES } from "@/lib/role-permissions";
import { sendEmail } from "@/lib/email";
import { roundupHtml, soloSubject, urgentHtml } from "@/lib/staff-updates";
import { isDesigned } from "@/lib/staff-email-design";
import { serviceDateOnly } from "@/lib/timezone";

export const POST = withApiAuth(
  async (_req, session, context) => {
    const { id } = await context!.params!;
    const u = await prisma.staffUpdate.findUnique({ where: { id } });
    if (!u) throw ApiError.notFound("That staff email no longer exists.");
    const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { email: true, name: true } });
    if (!me?.email) throw ApiError.badRequest("Your account has no email address.");
    // Designed and urgent emails go out on their own; the rest inside the round-up.
    const solo = u.urgent || isDesigned(u);
    const html = solo ? urgentHtml(me, u) : roundupHtml(me, [u], serviceDateOnly());
    const res = await sendEmail({ to: me.email, subject: `[Test] ${solo ? soloSubject(u, me) : "Your Amana staff update"}`, html });
    if (!res.sent.length) throw new ApiError(502, "The test email couldn't be sent.");
    return NextResponse.json({ sentTo: me.email });
  },
  { roles: [...ADMIN_ROLES], rateLimit: { max: 5, windowMs: 60_000 } },
);
