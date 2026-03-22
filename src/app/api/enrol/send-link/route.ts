import { NextRequest, NextResponse } from "next/server";
import { sendEmail, FROM_EMAIL } from "@/lib/email";
import { enrolmentLinkEmail } from "@/lib/email-templates";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";

const bodySchema = z.object({
  parentName: z.string().optional(),
  parentEmail: z.string().email("Valid parent email is required"),
  enquiryId: z.string().min(1, "Enquiry ID is required"),
});

export const POST = withApiAuth(async (req, session) => {
  const raw = await req.json();
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { parentName, parentEmail, enquiryId } = parsed.data;

  const baseUrl = process.env.NEXTAUTH_URL || "https://app.amanaoshc.com.au";
  const enrolUrl = `${baseUrl}/enrol/${enquiryId}`;

  const firstName = (parentName || "").split(" ")[0] || "there";
  const { subject, html } = enrolmentLinkEmail(firstName, enrolUrl);

  await sendEmail({
    from: FROM_EMAIL,
    to: parentEmail,
    subject,
    html,
  });

  return NextResponse.json({ success: true });
});
