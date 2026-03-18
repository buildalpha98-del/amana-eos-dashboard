import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import { sendEmail, FROM_EMAIL } from "@/lib/email";
import { enrolmentLinkEmail } from "@/lib/email-templates";

export async function POST(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const { parentName, parentEmail, enquiryId } = await req.json();

  if (!parentEmail) {
    return NextResponse.json({ error: "Parent email is required" }, { status: 400 });
  }
  if (!enquiryId) {
    return NextResponse.json({ error: "Enquiry ID is required" }, { status: 400 });
  }

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
}
