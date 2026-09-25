/**
 * Parent Portal email templates.
 *
 * 2026-05-17: parentMagicLinkEmail is admin-overridable via
 * EmailTemplateOverride (key "parentPortal.magicLink").
 *
 * 2026-09-18: a LOGIN link and a PASSWORD RESET link are different emails and
 * must read differently. The portal only had the first, and used it to answer
 * "I forgot my password" — which signs the parent in without ever letting them
 * set a new one, so the next sign-in fails identically.
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
      This link expires in <strong>1 hour</strong>. If you didn't request this, you can safely ignore this email.
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

// ─── Password Reset ──────────────────────────────────────────

const RESET_DEFAULT_SUBJECT = "Reset your Amana OSHC password";

const RESET_DEFAULT_BODY = `
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Hi {{name}},
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      {{intro}}
    </p>
    {{resetButton}}
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      This link expires in <strong>1 hour</strong> and can only be used once.
      If you didn't ask for this, you can safely ignore this email — your
      current password will keep working.
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

/**
 * `byStaff` changes only the opening line. A parent who rang the centre and
 * was told "I'll send you a reset now" should see an email that matches that
 * conversation, not one implying they clicked something themselves.
 */
export async function parentPasswordResetEmail(
  name: string,
  resetUrl: string,
  opts: { byStaff?: boolean } = {},
) {
  return applyEmailTemplateOverride({
    key: "parentPortal.passwordReset",
    defaultSubject: RESET_DEFAULT_SUBJECT,
    defaultBody: RESET_DEFAULT_BODY,
    vars: {
      name,
      resetUrl,
      intro: opts.byStaff
        ? "We've sent you a link to set a new password for the Amana OSHC Parent Portal, as requested."
        : "You asked to reset your password for the Amana OSHC Parent Portal. Choose a new one using the button below.",
      resetButton: buttonHtml("Choose a new password", resetUrl),
    },
    wrap: parentEmailLayout,
  });
}
