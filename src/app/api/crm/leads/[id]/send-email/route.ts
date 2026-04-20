import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hasFeature, parseRole } from "@/lib/role-permissions";
import { getResend, FROM_EMAIL } from "@/lib/email";
import { applyMergeTags } from "@/lib/crm/merge-tags";
import { withApiAuth } from "@/lib/server-auth";

/** Escape HTML special characters to prevent injection */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const sendEmailSchema = z.object({
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Body is required"),
  templateId: z.string().optional(),
});

// POST /api/crm/leads/[id]/send-email
export const POST = withApiAuth(async (req, session, context) => {
  const role = parseRole(session!.user.role);
  if (!role || !hasFeature(role, "crm.create")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context!.params!;
  const reqBody = await req.json();
  const parsed = sendEmailSchema.safeParse(reqBody);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const lead = await prisma.lead.findUnique({
    where: { id },
    select: {
      id: true,
      schoolName: true,
      contactName: true,
      contactEmail: true,
      deleted: true,
    },
  });

  if (!lead || lead.deleted) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  if (!lead.contactEmail) {
    return NextResponse.json(
      { error: "Lead has no contact email address" },
      { status: 400 },
    );
  }

  let subject = parsed.data.subject;
  let body = parsed.data.body;

  // If a template is specified, use it and apply merge tags
  if (parsed.data.templateId) {
    const template = await prisma.crmEmailTemplate.findUnique({
      where: { id: parsed.data.templateId },
    });
    if (template) {
      subject = template.subject;
      body = template.body;
    }
  }

  // Escape HTML in user-provided content BEFORE applying merge tags
  // This prevents HTML injection while keeping merge tags functional
  subject = escapeHtml(subject);
  body = escapeHtml(body);

  // Apply merge tags (after escaping — merge tag values are also escaped)
  const sender = await prisma.user.findUnique({
    where: { id: session!.user.id },
    select: { name: true },
  });

  const mergeData: Record<string, string> = {
    schoolName: escapeHtml(lead.schoolName),
    contactName: escapeHtml(lead.contactName || "there"),
    senderName: escapeHtml(sender?.name || "Amana OSHC"),
    companyName: "Amana OSHC",
  };

  subject = applyMergeTags(subject, mergeData);
  body = applyMergeTags(body, mergeData);

  // Send via Resend
  const resend = getResend();
  if (!resend) {
    // Dev mode: log instead of sending
    if (process.env.NODE_ENV !== "production") console.log("[CRM Email] To:", lead.contactEmail, "Subject:", subject);
  } else {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: lead.contactEmail,
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
          ${body.replace(/\n/g, "<br>")}
        </div>
      `,
    });
  }

  // Log the touchpoint
  const touchpoint = await prisma.touchpointLog.create({
    data: {
      leadId: id,
      type: "email_sent",
      subject,
      body,
      sentById: session!.user.id,
    },
    include: {
      sentBy: { select: { id: true, name: true, avatar: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "email_sent",
      entityType: "Lead",
      entityId: id,
      details: { schoolName: lead.schoolName, subject },
    },
  });

  return NextResponse.json(touchpoint, { status: 201 });
});
