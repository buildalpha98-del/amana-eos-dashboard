/**
 * Parent Portal email templates.
 */

import { parentEmailLayout, buttonHtml } from "./base";

// ─── Magic Link Login ────────────────────────────────────────

export function parentMagicLinkEmail(name: string, loginUrl: string) {
  const subject = "Log in to Amana OSHC Parent Portal";
  const html = parentEmailLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Welcome back, ${name}
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Click the button below to log in to the Amana OSHC Parent Portal.
    </p>
    ${buttonHtml("Log in to Parent Portal", loginUrl)}
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      This link expires in <strong>15 minutes</strong>. If you didn't request this, you can safely ignore this email.
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      If you have any questions, contact us at
      <a href="mailto:contact@amanaoshc.com.au" style="color:#004E64;font-weight:600;">contact@amanaoshc.com.au</a>.
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The Amana OSHC Team</strong>
    </p>
  `);

  return { subject, html };
}
