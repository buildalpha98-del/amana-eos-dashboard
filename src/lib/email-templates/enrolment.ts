/**
 * Enrolment-related email templates.
 */

import { parentEmailLayout, buttonHtml } from "./base";

// ─── Enrolment Confirmation ─────────────────────────────────

export function enrolmentConfirmationEmail(parentName: string, childNames: string) {
  const subject = "Enrolment Received — Amana OSHC";
  const html = parentEmailLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Enrolment Submitted Successfully
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${parentName},
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Thank you for completing the enrolment form for <strong>${childNames}</strong>.
      Our team will review your submission and be in touch within 1-2 business days
      to confirm your enrolment details.
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      If you have any questions in the meantime, feel free to contact us.
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The Amana OSHC Team</strong>
    </p>
  `);

  return { subject, html };
}

// ─── Enrolment Link Email ─────────────────────────────────

export function enrolmentLinkEmail(parentName: string, enrolUrl: string) {
  const subject = "Complete Your Enrolment — Amana OSHC";
  const html = parentEmailLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Complete Your Enrolment
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${parentName},
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      We're excited to welcome your family to Amana OSHC! Please click the button
      below to complete the enrolment form. Some of your details have been pre-filled
      to save you time.
    </p>
    ${buttonHtml("Complete Enrolment", enrolUrl)}
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      The form takes approximately 10-15 minutes to complete. You can save your
      progress and return at any time.
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The Amana OSHC Team</strong>
    </p>
  `);

  return { subject, html };
}
