/**
 * Email templates for parent portal notifications.
 *
 * Each function returns { subject, html } ready for sendEmail().
 *
 * 2026-05-17: admin-overridable via EmailTemplateOverride (key namespace
 * "parent.*"). Computed values (formatted dates, session labels) are pre-
 * computed in the function before being passed as vars, so admin can
 * rearrange them in the body without losing formatting.
 */

import { baseLayout, buttonHtml } from "./base";
import { applyEmailTemplateOverride } from "@/lib/email-template-overrides";

const PORTAL_URL = process.env.NEXTAUTH_URL ?? "https://amanaoshc.company";

// ── Booking Confirmed ───────────────────────────────────

const BOOKING_CONFIRMED_DEFAULT_SUBJECT =
  "Booking Confirmed — {{childName}} on {{formattedDate}}";

const BOOKING_CONFIRMED_DEFAULT_BODY = `
    <h2 style="color: #004E64; margin: 0 0 16px;">Booking Confirmed</h2>
    <p>Hi {{parentName}},</p>
    <p>{{childName}}'s booking has been confirmed:</p>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <tr>
        <td style="padding: 8px 0; color: #7c7c8a; font-size: 14px;">Date</td>
        <td style="padding: 8px 0; font-weight: 600;">{{formattedDate}}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #7c7c8a; font-size: 14px;">Session</td>
        <td style="padding: 8px 0; font-weight: 600;">{{sessionLabel}}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #7c7c8a; font-size: 14px;">Centre</td>
        <td style="padding: 8px 0; font-weight: 600;">{{serviceName}}</td>
      </tr>
    </table>
    {{viewBookingsButton}}
  `;

export async function bookingConfirmedEmail(data: {
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

  return applyEmailTemplateOverride({
    key: "parent.bookingConfirmed",
    defaultSubject: BOOKING_CONFIRMED_DEFAULT_SUBJECT,
    defaultBody: BOOKING_CONFIRMED_DEFAULT_BODY,
    vars: {
      parentName: data.parentName,
      childName: data.childName,
      formattedDate,
      sessionLabel,
      serviceName: data.serviceName,
      viewBookingsButton: buttonHtml("View Bookings", `${PORTAL_URL}/parent/bookings`),
    },
    wrap: baseLayout,
  });
}

// ── Booking Cancelled by Centre ─────────────────────────

const BOOKING_CANCELLED_DEFAULT_SUBJECT =
  "Booking Cancelled — {{childName}}, {{formattedDate}}";

const BOOKING_CANCELLED_DEFAULT_BODY = `
    <h2 style="color: #004E64; margin: 0 0 16px;">Booking Cancelled</h2>
    <p>Hi {{parentName}},</p>
    <p>{{childName}}'s {{sessionShort}} session on <strong>{{formattedDate}}</strong> at {{serviceName}} has been cancelled by the centre.</p>
    <p style="color: #7c7c8a; font-size: 14px;">If you have questions, please contact the centre or send a message through the parent portal.</p>
    {{viewBookingsButton}}
  `;

export async function bookingCancelledEmail(data: {
  parentName: string;
  childName: string;
  date: string;
  sessionType: string;
  serviceName: string;
}) {
  const sessionShort =
    data.sessionType === "bsc" ? "BSC" : data.sessionType === "asc" ? "ASC" : "VC";

  const formattedDate = new Date(data.date).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return applyEmailTemplateOverride({
    key: "parent.bookingCancelled",
    defaultSubject: BOOKING_CANCELLED_DEFAULT_SUBJECT,
    defaultBody: BOOKING_CANCELLED_DEFAULT_BODY,
    vars: {
      parentName: data.parentName,
      childName: data.childName,
      sessionShort,
      formattedDate,
      serviceName: data.serviceName,
      viewBookingsButton: buttonHtml("View Bookings", `${PORTAL_URL}/parent/bookings`),
    },
    wrap: baseLayout,
  });
}

// ── New Statement Available ─────────────────────────────

const NEW_STATEMENT_DEFAULT_SUBJECT = "New Statement Available — {{period}}";

const NEW_STATEMENT_DEFAULT_BODY = `
    <h2 style="color: #004E64; margin: 0 0 16px;">New Statement</h2>
    <p>Hi {{parentName}},</p>
    <p>Your statement for <strong>{{period}}</strong> is now available.</p>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <tr>
        <td style="padding: 8px 0; color: #7c7c8a; font-size: 14px;">Total Fees</td>
        <td style="padding: 8px 0; font-weight: 600;">{{totalFeesFormatted}}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #7c7c8a; font-size: 14px;">CCS Applied</td>
        <td style="padding: 8px 0; font-weight: 600; color: #16a34a;">-{{totalCcsFormatted}}</td>
      </tr>
      <tr style="border-top: 1px solid #e8e4df;">
        <td style="padding: 8px 0; color: #1a1a2e; font-weight: 600;">Gap Fee</td>
        <td style="padding: 8px 0; font-weight: 700; font-size: 18px;">{{gapFeeFormatted}}</td>
      </tr>
    </table>
    {{viewStatementButton}}
  `;

export async function newStatementEmail(data: {
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

  return applyEmailTemplateOverride({
    key: "parent.newStatement",
    defaultSubject: NEW_STATEMENT_DEFAULT_SUBJECT,
    defaultBody: NEW_STATEMENT_DEFAULT_BODY,
    vars: {
      parentName: data.parentName,
      period,
      totalFeesFormatted: `$${data.totalFees.toFixed(2)}`,
      totalCcsFormatted: `$${data.totalCcs.toFixed(2)}`,
      gapFeeFormatted: `$${data.gapFee.toFixed(2)}`,
      viewStatementButton: buttonHtml("View Statement", `${PORTAL_URL}/parent/billing`),
    },
    wrap: baseLayout,
  });
}

// ── New Message Reply ───────────────────────────────────

const NEW_MESSAGE_REPLY_DEFAULT_SUBJECT = "New reply: {{conversationSubject}}";

const NEW_MESSAGE_REPLY_DEFAULT_BODY = `
    <h2 style="color: #004E64; margin: 0 0 16px;">New Reply</h2>
    <p>Hi {{parentName}},</p>
    <p><strong>{{staffName}}</strong> replied to your conversation:</p>
    <div style="background: #f8f5f2; border-radius: 8px; padding: 16px; margin: 16px 0; border-left: 3px solid #004E64;">
      <p style="color: #7c7c8a; font-size: 12px; margin: 0 0 4px;">Re: {{conversationSubject}}</p>
      <p style="margin: 0; color: #1a1a2e;">{{previewText}}</p>
    </div>
    {{viewConversationButton}}
  `;

export async function newMessageReplyEmail(data: {
  parentName: string;
  subject: string;
  staffName: string;
  previewText: string;
  ticketId: string;
}) {
  const truncatedPreview =
    data.previewText.slice(0, 200) +
    (data.previewText.length > 200 ? "..." : "");

  return applyEmailTemplateOverride({
    key: "parent.newMessageReply",
    defaultSubject: NEW_MESSAGE_REPLY_DEFAULT_SUBJECT,
    defaultBody: NEW_MESSAGE_REPLY_DEFAULT_BODY,
    vars: {
      parentName: data.parentName,
      conversationSubject: data.subject,
      staffName: data.staffName,
      previewText: truncatedPreview,
      viewConversationButton: buttonHtml(
        "View Conversation",
        `${PORTAL_URL}/parent/messages/${data.ticketId}`,
      ),
    },
    wrap: baseLayout,
  });
}

// ── New Child Post (observation/announcement) ──────────

const NEW_CHILD_POST_DEFAULT_SUBJECT = "New {{postType}} about {{childList}}";

const NEW_CHILD_POST_DEFAULT_BODY = `
    <h2 style="color: #004E64; margin: 0 0 16px;">New {{postType}}</h2>
    <p>Hi {{parentName}},</p>
    <p>A new {{postTypeLower}} has been posted about <strong>{{childList}}</strong>:</p>
    <div style="background: #f8f5f2; border-radius: 8px; padding: 16px; margin: 16px 0; border-left: 3px solid #004E64;">
      <p style="margin: 0; color: #1a1a2e; font-weight: 600;">{{postTitle}}</p>
    </div>
    {{viewButton}}
  `;

export async function newChildPostEmail(data: {
  parentName: string;
  childNames: string[];
  postTitle: string;
  postType: string;
}) {
  const childList = data.childNames.join(" & ");
  return applyEmailTemplateOverride({
    key: "parent.newChildPost",
    defaultSubject: NEW_CHILD_POST_DEFAULT_SUBJECT,
    defaultBody: NEW_CHILD_POST_DEFAULT_BODY,
    vars: {
      parentName: data.parentName,
      childList,
      postTitle: data.postTitle,
      postType: data.postType,
      postTypeLower: data.postType.toLowerCase(),
      viewButton: buttonHtml("View in App", `${PORTAL_URL}/parent`),
    },
    wrap: baseLayout,
  });
}
