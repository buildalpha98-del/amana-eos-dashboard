import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, FROM_EMAIL } from "@/lib/email";
import { recordMarketingSends } from "@/lib/frequency-cap";
import { enrolmentLinkEmail } from "@/lib/email-templates";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";

import { parseJsonBody } from "@/lib/api-error";
const bodySchema = z.object({
  parentName: z.string().optional(),
  parentEmail: z.string().email("Valid parent email is required"),
  enquiryId: z.string().min(1, "Enquiry ID is required"),
});

export const POST = withApiAuth(async (req, session) => {
  const raw = await parseJsonBody(req);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { parentName, parentEmail, enquiryId } = parsed.data;

  const baseUrl = process.env.NEXTAUTH_URL || "https://amanaoshc.company";
  const enrolUrl = `${baseUrl}/enrol/${enquiryId}`;

  const firstName = (parentName || "").split(" ")[0] || "there";
  const { subject, html } = await enrolmentLinkEmail(firstName, enrolUrl);

  const result = await sendEmail({
    from: FROM_EMAIL,
    to: parentEmail,
    subject,
    html,
  });

  // Frequency-cap ledger: lifecycle mail is 1:1 — RECORDED (it counts toward
  // the parent's weekly marketing-email volume so bulk sends see it) but
  // NEVER cap-blocked. Only actually-sent recipients count (suppressed →
  // sent: []); recordMarketingSends swallows its own errors, so a ledger
  // hiccup never fails a send that already went out.
  if (result.sent.length > 0) {
    await recordMarketingSends(prisma, [{ email: parentEmail }], {
      source: "lifecycle",
    });
  }

  return NextResponse.json({ success: true });
});
