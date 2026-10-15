/**
 * POST /api/parent-journey/test { ids: string[], serviceId } — sends the
 * chosen emails, rendered for that centre, to the signed-in user ONLY,
 * subject prefixed "[Test]". Never to a family.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { sendEmail } from "@/lib/email";
import { PREVIEWABLE_EMAIL_IDS } from "@/lib/parent-journey-map";
import { renderJourneyEmail } from "@/lib/parent-journey-preview";

export const maxDuration = 120;

const bodySchema = z.object({
  ids: z.array(z.string()).min(1).max(PREVIEWABLE_EMAIL_IDS.length),
  serviceId: z.string().min(1),
});

export const POST = withApiAuth(
  async (req, session) => {
    const parsed = bodySchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) throw ApiError.badRequest("Choose the emails and a centre.");
    const { ids, serviceId } = parsed.data;
    if (ids.some((id) => !PREVIEWABLE_EMAIL_IDS.includes(id))) throw ApiError.badRequest("Unknown email.");
    const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { email: true } });
    if (!me?.email) throw ApiError.badRequest("Your account has no email address.");

    let sent = 0;
    const failed: string[] = [];
    for (const id of ids) {
      try {
        const out = await renderJourneyEmail(id, serviceId);
        if (!out) {
          failed.push(id);
          continue;
        }
        const res = await sendEmail({ to: me.email, subject: `[Test] ${out.subject}`, html: out.html });
        if (res.sent.length) sent++;
        else failed.push(id);
      } catch {
        failed.push(id);
      }
    }
    return NextResponse.json({ sentTo: me.email, sent, failed });
  },
  { roles: ["owner", "head_office", "admin", "marketing"], rateLimit: { max: 4, windowMs: 60_000 }, timeoutMs: 110_000 },
);
