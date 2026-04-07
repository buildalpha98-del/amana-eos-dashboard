/**
 * Send internal team notifications when a VAPI call is received.
 * Routes notifications to the appropriate staff based on call type and centre.
 */

import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { baseLayout } from "@/lib/email-templates/base";
import { logger } from "@/lib/logger";

/**
 * Map centre keywords → coordinator email.
 * VAPI may say "Malek Fahd Greenacre", "MFIS Greenacre", or just "Greenacre".
 * We match on the most specific substring first.
 */
const CENTRE_COORDINATOR_MAP: { keywords: string[]; email: string }[] = [
  { keywords: ["greenacre", "mfis greenacre", "malek fahd greenacre"], email: "coordinator.greenacre@amanaoshc.com.au" },
  { keywords: ["hoxton park", "mfis hoxton", "malek fahd hoxton"], email: "MFIShp@amanaoshc.com.au" },
  { keywords: ["beaumont hills", "mfis beaumont", "malek fahd beaumont"], email: "mfisbh@amanaoshc.com.au" },
  { keywords: ["arkana", "kingsgrove"], email: "arkanacollege@amanaoshc.com.au" },
  { keywords: ["unity grammar", "austral"], email: "unitygrammar@amanaoshc.com.au" },
  { keywords: ["al-taqwa", "altaqwa", "truganina"], email: "altaqwacollege@amanaoshc.com.au" },
  { keywords: ["minaret officer", "officer"], email: "minaretofficer@amanaoshc.com.au" },
  { keywords: ["minaret springvale", "springvale"], email: "minaretspringvale@amanaoshc.com.au" },
  { keywords: ["minaret doveton", "doveton"], email: "minaretdoveton@amanaoshc.com.au" },
  { keywords: ["aia", "kkcc", "coburg", "australian international academy"], email: "Aiakkcc@amanaoshc.com.au" },
];

function findCoordinatorEmail(centreName: string | null): string | undefined {
  if (!centreName) return undefined;
  const lower = centreName.toLowerCase();
  for (const entry of CENTRE_COORDINATOR_MAP) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      return entry.email;
    }
  }
  return undefined;
}

const CALL_TYPE_LABELS: Record<string, string> = {
  new_enquiry: "New Enquiry",
  booking_change: "Booking Change",
  billing_issue: "Billing Issue",
  escalation: "Escalation",
  holiday_quest: "Holiday Quest",
  general_message: "General Message",
};

function humaniseKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

function getRecipients(callType: string, urgency: string, centreName: string | null): string[] {
  const coordinatorEmail = findCoordinatorEmail(centreName);
  const recipients: string[] = [];

  switch (callType) {
    case "new_enquiry":
      recipients.push("akram@amanaoshc.com.au");
      break;
    case "booking_change":
      recipients.push("akram@amanaoshc.com.au");
      if (coordinatorEmail) recipients.push(coordinatorEmail);
      break;
    case "billing_issue":
      recipients.push("akram@amanaoshc.com.au", "jayden@amanaoshc.com.au");
      break;
    case "escalation":
      recipients.push("jayden@amanaoshc.com.au");
      if (coordinatorEmail) recipients.push(coordinatorEmail);
      if (urgency === "critical") recipients.push("akram@amanaoshc.com.au");
      break;
    case "holiday_quest":
      recipients.push("akram@amanaoshc.com.au");
      break;
    case "general_message":
    default:
      recipients.push("akram@amanaoshc.com.au");
      break;
  }

  return [...new Set(recipients)];
}

function buildDetailsHtml(details: Record<string, unknown>): string {
  const rows = Object.entries(details)
    .filter(([, v]) => v != null && v !== "")
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px;white-space:nowrap;vertical-align:top;">${humaniseKey(k)}</td><td style="padding:4px 0;color:#374151;font-size:13px;">${String(v)}</td></tr>`,
    )
    .join("");

  return rows
    ? `<table style="width:100%;border-collapse:collapse;margin:12px 0;">${rows}</table>`
    : "<p style='color:#9ca3af;font-size:13px;'>No additional details captured.</p>";
}

export async function sendInternalNotification(callId: string): Promise<void> {
  const call = await prisma.vapiCall.findUnique({ where: { id: callId } });
  if (!call) return;

  const recipients = getRecipients(call.callType, call.urgency, call.centreName);
  if (recipients.length === 0) return;

  const callTypeLabel = CALL_TYPE_LABELS[call.callType] ?? call.callType;
  const urgencyLabel = call.urgency.toUpperCase();
  const parentName = call.parentName || "Unknown caller";
  const centreName = call.centreName || "Unknown centre";
  const details = (call.callDetails as Record<string, unknown>) ?? {};
  const baseUrl = process.env.NEXTAUTH_URL || "https://amanaoshc.company";

  const urgencyColor =
    call.urgency === "critical" ? "#dc2626" : call.urgency === "urgent" ? "#d97706" : "#6b7280";

  const subject = `[${urgencyLabel}] New ${callTypeLabel} — ${parentName} (${centreName})`;

  const html = baseLayout(`
    <div style="margin-bottom:16px;padding:12px 16px;background-color:${urgencyColor}10;border-left:4px solid ${urgencyColor};border-radius:4px;">
      <p style="margin:0;font-size:14px;font-weight:600;color:${urgencyColor};">
        ${urgencyLabel} — ${callTypeLabel}
      </p>
    </div>

    <h2 style="margin:0 0 16px;color:#111827;font-size:18px;">New VAPI Call Received</h2>

    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:14px;">Parent</td><td style="padding:6px 0;color:#111827;font-size:14px;font-weight:500;">${parentName}</td></tr>
      ${call.parentPhone ? `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:14px;">Phone</td><td style="padding:6px 0;color:#111827;font-size:14px;"><a href="tel:${call.parentPhone}" style="color:#004E64;">${call.parentPhone}</a></td></tr>` : ""}
      ${call.parentEmail ? `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:14px;">Email</td><td style="padding:6px 0;color:#111827;font-size:14px;"><a href="mailto:${call.parentEmail}" style="color:#004E64;">${call.parentEmail}</a></td></tr>` : ""}
      ${call.childName ? `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:14px;">Child</td><td style="padding:6px 0;color:#111827;font-size:14px;">${call.childName}</td></tr>` : ""}
      <tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:14px;">Centre</td><td style="padding:6px 0;color:#111827;font-size:14px;">${centreName}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:14px;">Call Type</td><td style="padding:6px 0;color:#111827;font-size:14px;">${callTypeLabel}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:14px;">Urgency</td><td style="padding:6px 0;color:${urgencyColor};font-size:14px;font-weight:600;">${urgencyLabel}</td></tr>
    </table>

    <h3 style="margin:0 0 8px;color:#374151;font-size:14px;">Call Details</h3>
    ${buildDetailsHtml(details)}

    <div style="margin-top:24px;text-align:center;">
      <a href="${baseUrl}/contact-centre?tab=calls&id=${callId}"
         style="display:inline-block;padding:12px 32px;background-color:#004E64;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;border-radius:8px;">
        View in Contact Centre
      </a>
    </div>
  `);

  try {
    await sendEmail({ to: recipients, subject, html });

    await prisma.vapiCall.update({
      where: { id: callId },
      data: { internalNotificationSent: true },
    });
  } catch (err) {
    logger.error("Failed to send VAPI internal notification", { callId, error: err });
  }
}
