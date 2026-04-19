/**
 * Send a follow-up SMS to the parent after a VAPI call.
 * Messages are short, branded, and pathway-specific.
 */

import { prisma } from "@/lib/prisma";
import { sendSMS } from "@/lib/twilio";
import { logger } from "@/lib/logger";

function buildSmsBody(call: {
  callType: string;
  urgency: string;
  parentName: string | null;
  childName: string | null;
  centreName: string | null;
}): string | null {
  const name = call.parentName?.split(" ")[0] ?? "";
  const greeting = name ? `Hi ${name}, t` : "T";

  switch (call.callType) {
    case "new_enquiry":
      return `${greeting}hanks for calling Amana OSHC${call.centreName ? ` about ${call.centreName}` : ""}. Our team will be in touch within 24 hours. Start your enrolment now: amanaoshc.com.au — Amana OSHC`;

    case "booking_change":
      return `${greeting}hanks for calling Amana OSHC. Your booking change request${call.childName ? ` for ${call.childName}` : ""} has been logged. We'll confirm within ${call.urgency === "urgent" ? "a few hours" : "24 hours"}. — Amana OSHC`;

    case "billing_issue":
      return `${greeting}hanks for calling Amana OSHC. Your account enquiry has been logged and our team will review it within 24-48 hours. — Amana OSHC`;

    case "escalation":
      return `${greeting}hank you for contacting Amana OSHC. Your concern has been escalated and someone will be in touch ${call.urgency === "critical" ? "within the hour" : "within 24 hours"}. — Amana OSHC`;

    case "holiday_quest":
      return `${greeting}hanks for your interest in Holiday Quest! Our team will send you the upcoming schedule and booking info shortly. Learn more: amanaoshc.com.au — Amana OSHC`;

    default:
      return null;
  }
}

export async function sendCallFollowUpSms(callId: string): Promise<void> {
  const call = await prisma.vapiCall.findUnique({ where: { id: callId } });
  if (!call || !call.parentPhone) return;

  const body = buildSmsBody(call);
  if (!body) return;

  try {
    await sendSMS(call.parentPhone, body);
  } catch (err) {
    logger.error("VAPI: follow-up SMS failed", { callId, error: err });
  }
}
