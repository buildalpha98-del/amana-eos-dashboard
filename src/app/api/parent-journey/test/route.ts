/**
 * POST /api/parent-journey/test { ids: string[], serviceId, to? } — sends the
 * chosen emails, rendered for that centre, to the signed-in user, or (to:
 * "enrolments") the enrolments inbox — those two addresses ONLY, subject
 * prefixed "[Test]". Never to a family. Attachments (the welcome pack on
 * "You're booked in!") are included so the test matches the real email.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { sendEmail } from "@/lib/email";
import { PREVIEWABLE_EMAIL_IDS } from "@/lib/parent-journey-map";
import { renderJourneyEmail } from "@/lib/parent-journey-preview";
import { ENROLMENTS_INBOX } from "@/lib/centre-team-alerts";

export const maxDuration = 120;

const bodySchema = z.object({
  ids: z.array(z.string()).min(1).max(PREVIEWABLE_EMAIL_IDS.length),
  serviceId: z.string().min(1),
  to: z.enum(["me", "enrolments"]).default("me"),
});

export const POST = withApiAuth(
  async (req, session) => {
    const parsed = bodySchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) throw ApiError.badRequest("Choose the emails and a centre.");
    const { ids, serviceId, to } = parsed.data;
    if (ids.some((id) => !PREVIEWABLE_EMAIL_IDS.includes(id))) throw ApiError.badRequest("Unknown email.");
    const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { email: true } });
    const recipient = to === "enrolments" ? ENROLMENTS_INBOX : me?.email;
    if (!recipient) throw ApiError.badRequest("Your account has no email address.");

    let sent = 0;
    const failed: string[] = [];
    for (const id of ids) {
      try {
        const out = await renderJourneyEmail(id, serviceId);
        if (!out) {
          failed.push(id);
          continue;
        }
        const res = await sendEmail({
          to: recipient,
          subject: `[Test] ${out.subject}`,
          html: out.html,
          ...(out.attachments ? { attachments: out.attachments } : {}),
        });
        if (res.sent.length) sent++;
        else failed.push(id);
      } catch {
        failed.push(id);
      }
    }
    return NextResponse.json({ sentTo: recipient, sent, failed });
  },
  { roles: ["owner", "head_office", "admin", "marketing"], rateLimit: { max: 4, windowMs: 60_000 }, timeoutMs: 110_000 },
);
