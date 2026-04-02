/**
 * Email templates for parent portal notifications.
 *
 * Each function returns { subject, html } ready for sendEmail().
 */

import { baseLayout, buttonHtml } from "./base";

const PORTAL_URL = process.env.NEXTAUTH_URL ?? "https://amanaoshc.company";

// ── Booking Confirmed ───────────────────────────────────

export function bookingConfirmedEmail(data: {
  parentName: string;
  childName: string;
  date: string;
  sessionType: string;
  serviceName: string;
}) {
  const sessionLabel =
    data.sessionType === "bsc"
      ? "Before School Care"
      : data.sessionType === "asc"
        ? "After School Care"
        : "Vacation Care";

  const formattedDate = new Date(data.date).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const subject = `Booking Confirmed — ${data.childName} on ${formattedDate}`;
  const html = baseLayout(`
    <h2 style="color: #004E64; margin: 0 0 16px;">Booking Confirmed</h2>
    <p>Hi ${data.parentName},</p>
    <p>${data.childName}'s booking has been confirmed:</p>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <tr>
        <td style="padding: 8px 0; color: #7c7c8a; font-size: 14px;">Date</td>
        <td style="padding: 8px 0; font-weight: 600;">${formattedDate}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #7c7c8a; font-size: 14px;">Session</td>
        <td style="padding: 8px 0; font-weight: 600;">${sessionLabel}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #7c7c8a; font-size: 14px;">Centre</td>
        <td style="padding: 8px 0; font-weight: 600;">${data.serviceName}</td>
      </tr>
    </table>
    ${buttonHtml("View Bookings", `${PORTAL_URL}/parent/bookings`)}
  `);

  return { subject, html };
}

// ── Booking Cancelled by Centre ─────────────────────────

export function bookingCancelledEmail(data: {
  parentName: string;
  childName: string;
  date: string;
  sessionType: string;
  serviceName: string;
}) {
  const sessionLabel =
    data.sessionType === "bsc" ? "BSC" : data.sessionType === "asc" ? "ASC" : "VC";

  const formattedDate = new Date(data.date).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const subject = `Booking Cancelled — ${data.childName}, ${formattedDate}`;
  const html = baseLayout(`
    <h2 style="color: #004E64; margin: 0 0 16px;">Booking Cancelled</h2>
    <p>Hi ${data.parentName},</p>
    <p>${data.childName}'s ${sessionLabel} session on <strong>${formattedDate}</strong> at ${data.serviceName} has been cancelled by the centre.</p>
    <p style="color: #7c7c8a; font-size: 14px;">If you have questions, please contact the centre or send a message through the parent portal.</p>
    ${buttonHtml("View Bookings", `${PORTAL_URL}/parent/bookings`)}
  `);

  return { subject, html };
}

// ── New Statement Available ─────────────────────────────

export function newStatementEmail(data: {
  parentName: string;
  periodStart: string;
  periodEnd: string;
  totalFees: number;
  totalCcs: number;
  gapFee: number;
}) {
  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short" });

  const period = `${formatDate(data.periodStart)} – ${formatDate(data.periodEnd)}`;

  const subject = `New Statement Available — ${period}`;
  const html = baseLayout(`
    <h2 style="color: #004E64; margin: 0 0 16px;">New Statement</h2>
    <p>Hi ${data.parentName},</p>
    <p>Your statement for <strong>${period}</strong> is now available.</p>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <tr>
        <td style="padding: 8px 0; color: #7c7c8a; font-size: 14px;">Total Fees</td>
        <td style="padding: 8px 0; font-weight: 600;">$${data.totalFees.toFixed(2)}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #7c7c8a; font-size: 14px;">CCS Applied</td>
        <td style="padding: 8px 0; font-weight: 600; color: #16a34a;">-$${data.totalCcs.toFixed(2)}</td>
      </tr>
      <tr style="border-top: 1px solid #e8e4df;">
        <td style="padding: 8px 0; color: #1a1a2e; font-weight: 600;">Gap Fee</td>
        <td style="padding: 8px 0; font-weight: 700; font-size: 18px;">$${data.gapFee.toFixed(2)}</td>
      </tr>
    </table>
    ${buttonHtml("View Statement", `${PORTAL_URL}/parent/billing`)}
  `);

  return { subject, html };
}

// ── New Message Reply ───────────────────────────────────

export function newMessageReplyEmail(data: {
  parentName: string;
  subject: string;
  staffName: string;
  previewText: string;
  ticketId: string;
}) {
  const emailSubject = `New reply: ${data.subject}`;
  const html = baseLayout(`
    <h2 style="color: #004E64; margin: 0 0 16px;">New Reply</h2>
    <p>Hi ${data.parentName},</p>
    <p><strong>${data.staffName}</strong> replied to your conversation:</p>
    <div style="background: #f8f5f2; border-radius: 8px; padding: 16px; margin: 16px 0; border-left: 3px solid #004E64;">
      <p style="color: #7c7c8a; font-size: 12px; margin: 0 0 4px;">Re: ${data.subject}</p>
      <p style="margin: 0; color: #1a1a2e;">${data.previewText.slice(0, 200)}${data.previewText.length > 200 ? "..." : ""}</p>
    </div>
    ${buttonHtml("View Conversation", `${PORTAL_URL}/parent/messages/${data.ticketId}`)}
  `);

  return { subject: emailSubject, html };
}
