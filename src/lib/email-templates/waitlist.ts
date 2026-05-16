/**
 * Waitlist-related email templates.
 *
 * 2026-05-17: subject + body are admin-overridable via
 * EmailTemplateOverride. Variable placeholders use {{name}} / {{serviceName}}
 * / {{position}} / {{enrolUrl}}. Default copy below; admin overrides in
 * /settings/email-templates.
 */

import { parentEmailLayout, buttonHtml } from "./base";
import { applyEmailTemplateOverride } from "@/lib/email-template-overrides";

// ─── Waitlist Confirmation ─────────────────────────────────

const WAITLIST_CONFIRMATION_DEFAULT_SUBJECT =
  "You're on the Waitlist — Amana OSHC {{serviceName}}";

const WAITLIST_CONFIRMATION_DEFAULT_BODY = `
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Waitlist Confirmation
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi {{parentName}},
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      You're currently <strong>#{{position}}</strong> on the waitlist for <strong>{{serviceName}}</strong>.
      We'll notify you as soon as a spot becomes available.
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      In the meantime, feel free to contact us at
      <a href="mailto:contact@amanaoshc.com.au" style="color:#004E64;font-weight:600;">contact@amanaoshc.com.au</a>.
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The Amana OSHC Team</strong>
    </p>
  `;

export async function waitlistConfirmationEmail(
  parentName: string,
  serviceName: string,
  position: number,
) {
  return applyEmailTemplateOverride({
    key: "waitlist.confirmation",
    defaultSubject: WAITLIST_CONFIRMATION_DEFAULT_SUBJECT,
    defaultBody: WAITLIST_CONFIRMATION_DEFAULT_BODY,
    vars: {
      parentName,
      serviceName,
      position: String(position),
    },
    wrap: parentEmailLayout,
  });
}

// ─── Spot Available ─────────────────────────────────────────

const SPOT_AVAILABLE_DEFAULT_SUBJECT =
  "A Spot Has Opened! — Amana OSHC {{serviceName}}";

const SPOT_AVAILABLE_DEFAULT_BODY = `
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Great News — A Spot Has Opened!
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi {{parentName}},
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Great news! A spot has opened at <strong>{{serviceName}}</strong>.
      You have <strong>48 hours</strong> to complete your enrolment.
      Click the button below to secure your spot.
    </p>
    {{enrolButton}}
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      If you don't complete your enrolment within 48 hours, the spot will be
      offered to the next family on the waitlist.
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The Amana OSHC Team</strong>
    </p>
  `;

export async function spotAvailableEmail(
  parentName: string,
  serviceName: string,
  enrolUrl: string,
) {
  return applyEmailTemplateOverride({
    key: "waitlist.spotAvailable",
    defaultSubject: SPOT_AVAILABLE_DEFAULT_SUBJECT,
    defaultBody: SPOT_AVAILABLE_DEFAULT_BODY,
    vars: {
      parentName,
      serviceName,
      enrolUrl,
      enrolButton: buttonHtml("Complete Enrolment", enrolUrl),
    },
    wrap: parentEmailLayout,
  });
}

// ─── Spot Expired ───────────────────────────────────────────

const SPOT_EXPIRED_DEFAULT_SUBJECT = "Waitlist Update — Amana OSHC";

const SPOT_EXPIRED_DEFAULT_BODY = `
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Waitlist Update
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi {{parentName}},
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      The spot at <strong>{{serviceName}}</strong> has been offered to the next family
      on the waitlist. You're still on our waitlist and we'll let you know when
      the next spot opens.
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      If you have any questions, please contact us at
      <a href="mailto:contact@amanaoshc.com.au" style="color:#004E64;font-weight:600;">contact@amanaoshc.com.au</a>.
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The Amana OSHC Team</strong>
    </p>
  `;

export async function spotExpiredEmail(
  parentName: string,
  serviceName: string,
) {
  return applyEmailTemplateOverride({
    key: "waitlist.spotExpired",
    defaultSubject: SPOT_EXPIRED_DEFAULT_SUBJECT,
    defaultBody: SPOT_EXPIRED_DEFAULT_BODY,
    vars: { parentName, serviceName },
    wrap: parentEmailLayout,
  });
}
