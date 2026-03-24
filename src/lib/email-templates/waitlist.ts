/**
 * Waitlist-related email templates.
 */

import { parentEmailLayout, buttonHtml } from "./base";

// ─── Waitlist Confirmation ─────────────────────────────────

export function waitlistConfirmationEmail(
  parentName: string,
  serviceName: string,
  position: number,
) {
  const subject = `You're on the Waitlist — Amana OSHC ${serviceName}`;
  const html = parentEmailLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Waitlist Confirmation
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${parentName},
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      You're currently <strong>#${position}</strong> on the waitlist for <strong>${serviceName}</strong>.
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
  `);

  return { subject, html };
}

// ─── Spot Available ─────────────────────────────────────────

export function spotAvailableEmail(
  parentName: string,
  serviceName: string,
  enrolUrl: string,
) {
  const subject = `A Spot Has Opened! — Amana OSHC ${serviceName}`;
  const html = parentEmailLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Great News — A Spot Has Opened!
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${parentName},
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Great news! A spot has opened at <strong>${serviceName}</strong>.
      You have <strong>48 hours</strong> to complete your enrolment.
      Click the button below to secure your spot.
    </p>
    ${buttonHtml("Complete Enrolment", enrolUrl)}
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      If you don't complete your enrolment within 48 hours, the spot will be
      offered to the next family on the waitlist.
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The Amana OSHC Team</strong>
    </p>
  `);

  return { subject, html };
}

// ─── Spot Expired ───────────────────────────────────────────

export function spotExpiredEmail(
  parentName: string,
  serviceName: string,
) {
  const subject = "Waitlist Update — Amana OSHC";
  const html = parentEmailLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Waitlist Update
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${parentName},
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      The spot at <strong>${serviceName}</strong> has been offered to the next family
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
  `);

  return { subject, html };
}
