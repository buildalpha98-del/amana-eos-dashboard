/**
 * Send parent follow-up emails after VAPI calls.
 * Uses the existing sendEmail() from src/lib/email.ts (Resend).
 */

import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { parentEmailLayout } from "@/lib/email-templates/base";
import { logger } from "@/lib/logger";

function getField(details: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const val = details[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return "";
}

function buildNewEnquiryEmail(parentName: string, details: Record<string, unknown>): { subject: string; html: string } {
  const careType = getField(details, "careType", "programType", "type") || "our programs";
  const schoolName = getField(details, "centreName", "schoolName", "centre") || "your preferred centre";
  const childName = getField(details, "childName", "child_name") || "your child";

  return {
    subject: "Welcome to Amana OSHC — We've Received Your Enquiry",
    html: parentEmailLayout(`
      <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
        Assalamu Alaikum ${parentName},
      </p>
      <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
        Thank you for calling Amana OSHC today. We've received your enquiry about ${careType} at ${schoolName} for ${childName}.
      </p>
      <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
        A member of our team will be in touch within 24 hours. You can begin your enrolment at
        <a href="https://amanaoshc.com.au" style="color:#004E64;font-weight:600;">amanaoshc.com.au</a>.
      </p>
      <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
        Call us on <a href="tel:1300200262" style="color:#004E64;font-weight:600;">1300 200 262</a> if you need anything sooner.
      </p>
      <p style="margin:0 0 4px;color:#374151;font-size:15px;line-height:1.6;">
        Jazak Allahu Khairan,
      </p>
      <p style="margin:0;color:#374151;font-size:15px;line-height:1.6;font-weight:600;">
        The Amana OSHC Team | Beyond The Bell
      </p>
      <p style="margin:8px 0 0;color:#9ca3af;font-size:12px;">
        amanaoshc.com.au | 1300 200 262
      </p>
    `),
  };
}

function buildBookingChangeEmail(parentName: string, details: Record<string, unknown>): { subject: string; html: string } {
  const requestedChange = getField(details, "requestedChange", "changeType", "request") || "update your booking";
  const childName = getField(details, "childName", "child_name") || "your child";
  const centreName = getField(details, "centreName", "schoolName", "centre") || "your centre";

  return {
    subject: "Your Booking Request — Amana OSHC",
    html: parentEmailLayout(`
      <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
        Assalamu Alaikum ${parentName},
      </p>
      <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
        We've received your request to ${requestedChange} for ${childName} at ${centreName}.
        Our team will confirm within 24 hours.
      </p>
      <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
        Call <a href="tel:1300200262" style="color:#004E64;font-weight:600;">1300 200 262</a> if urgent.
      </p>
      <p style="margin:0 0 4px;color:#374151;font-size:15px;line-height:1.6;">
        Jazak Allahu Khairan,
      </p>
      <p style="margin:0;color:#374151;font-size:15px;font-weight:600;">
        The Amana OSHC Team
      </p>
    `),
  };
}

function buildBillingIssueEmail(parentName: string, details: Record<string, unknown>): { subject: string; html: string } {
  const issueType = getField(details, "issueType", "billingIssue", "issue") || "your account";
  const centreName = getField(details, "centreName", "schoolName", "centre") || "your centre";

  return {
    subject: "Your Account Enquiry — Amana OSHC",
    html: parentEmailLayout(`
      <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
        Assalamu Alaikum ${parentName},
      </p>
      <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
        We've received your enquiry regarding ${issueType} at ${centreName}.
        Our accounts team will be in touch within 48 hours.
      </p>
      <p style="margin:0 0 4px;color:#374151;font-size:15px;line-height:1.6;">
        Jazak Allahu Khairan,
      </p>
      <p style="margin:0;color:#374151;font-size:15px;font-weight:600;">
        The Amana OSHC Team
      </p>
    `),
  };
}

function buildEscalationEmail(parentName: string, urgency: string): { subject: string; html: string } {
  const timeline = urgency === "critical"
    ? "Someone will contact you within the hour."
    : "Someone will contact you by the next business day.";

  return {
    subject: "Thank You for Contacting Us — Amana OSHC",
    html: parentEmailLayout(`
      <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
        Assalamu Alaikum ${parentName},
      </p>
      <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
        Thank you for speaking with us. We've passed your concern to our Head Office team.
        ${timeline}
      </p>
      <p style="margin:0 0 4px;color:#374151;font-size:15px;line-height:1.6;">
        Jazak Allahu Khairan,
      </p>
      <p style="margin:0;color:#374151;font-size:15px;font-weight:600;">
        The Amana OSHC Team
      </p>
    `),
  };
}

function buildHolidayQuestEmail(parentName: string, details: Record<string, unknown>): { subject: string; html: string } {
  const childName = getField(details, "childName", "child_name") || "your child";
  const holidayPeriod = getField(details, "holidayPeriod", "period", "dates") || "the upcoming school holidays";

  return {
    subject: "Holiday Quest Information — Amana OSHC",
    html: parentEmailLayout(`
      <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
        Assalamu Alaikum ${parentName},
      </p>
      <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
        Thank you for your interest in Holiday Quest! We'd love to have ${childName} join us during ${holidayPeriod}.
        Our team will send you the schedule shortly.
      </p>
      <p style="margin:0 0 4px;color:#374151;font-size:15px;line-height:1.6;">
        Jazak Allahu Khairan,
      </p>
      <p style="margin:0;color:#374151;font-size:15px;font-weight:600;">
        The Amana OSHC Team
      </p>
    `),
  };
}

export async function sendParentFollowUpEmail(callId: string): Promise<void> {
  const call = await prisma.vapiCall.findUnique({ where: { id: callId } });
  if (!call) return;
  if (!call.parentEmail) return;
  if (call.callType === "general_message") return;

  const parentName = call.parentName || "there";
  const details = (call.callDetails as Record<string, unknown>) ?? {};

  let email: { subject: string; html: string };

  switch (call.callType) {
    case "new_enquiry":
      email = buildNewEnquiryEmail(parentName, details);
      break;
    case "booking_change":
      email = buildBookingChangeEmail(parentName, details);
      break;
    case "billing_issue":
      email = buildBillingIssueEmail(parentName, details);
      break;
    case "escalation":
      email = buildEscalationEmail(parentName, call.urgency);
      break;
    case "holiday_quest":
      email = buildHolidayQuestEmail(parentName, details);
      break;
    default:
      return;
  }

  try {
    await sendEmail({
      to: call.parentEmail,
      subject: email.subject,
      html: email.html,
      replyTo: "contact@amanaoshc.com.au",
    });

    await prisma.vapiCall.update({
      where: { id: callId },
      data: { followUpEmailSent: true },
    });
  } catch (err) {
    logger.error("Failed to send VAPI parent follow-up email", { callId, error: err });
  }
}
