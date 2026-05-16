/**
 * Parent Portal email templates.
 *
 * 2026-05-17: parentMagicLinkEmail is admin-overridable via
 * EmailTemplateOverride (key "parentPortal.magicLink").
 */

import { parentEmailLayout, buttonHtml } from "./base";
import { applyEmailTemplateOverride } from "@/lib/email-template-overrides";

// ─── Magic Link Login ────────────────────────────────────────

const MAGIC_LINK_DEFAULT_SUBJECT = "Log in to Amana OSHC Parent Portal";

const MAGIC_LINK_DEFAULT_BODY = `
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Welcome back, {{name}}
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Click the button below to log in to the Amana OSHC Parent Portal.
    </p>
    {{loginButton}}
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
  `;

export async function parentMagicLinkEmail(name: string, loginUrl: string) {
  return applyEmailTemplateOverride({
    key: "parentPortal.magicLink",
    defaultSubject: MAGIC_LINK_DEFAULT_SUBJECT,
    defaultBody: MAGIC_LINK_DEFAULT_BODY,
    vars: {
      name,
      loginUrl,
      loginButton: buttonHtml("Log in to Parent Portal", loginUrl),
    },
    wrap: parentEmailLayout,
  });
}
