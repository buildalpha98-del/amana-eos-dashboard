/**
 * Authentication-related email templates (password reset, welcome).
 *
 * 2026-05-17: subject + body are admin-overridable via
 * EmailTemplateOverride (key namespace "auth.*"). The hardcoded defaults
 * below are the fallback when no override row exists. Editor lives at
 * /settings/email-templates.
 */

import { baseLayout, buttonHtml, BRAND_COLOR } from "./base";
import { applyEmailTemplateOverride } from "@/lib/email-template-overrides";

// ─── Password Reset ──────────────────────────────────────────

const PASSWORD_RESET_DEFAULT_SUBJECT =
  "Reset your password — Amana OSHC Dashboard";

const PASSWORD_RESET_DEFAULT_BODY = `
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Password Reset Request
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi {{name}},
    </p>
    <p style="margin:0 0 8px;color:#6b7280;font-size:14px;line-height:1.6;">
      We received a request to reset your password for the Amana OSHC Dashboard.
      Click the button below to set a new password.
    </p>
    {{resetButton}}
    <p style="margin:0 0 8px;color:#6b7280;font-size:14px;line-height:1.6;">
      This link will expire in <strong>1 hour</strong>. If you didn't request a password reset,
      you can safely ignore this email.
    </p>
    <p style="margin:16px 0 0;color:#9ca3af;font-size:12px;line-height:1.5;word-break:break-all;">
      If the button doesn't work, copy and paste this URL into your browser:<br/>
      <a href="{{resetUrl}}" style="color:${BRAND_COLOR};">{{resetUrl}}</a>
    </p>
  `;

export async function passwordResetEmail(name: string, resetUrl: string) {
  return applyEmailTemplateOverride({
    key: "auth.passwordReset",
    defaultSubject: PASSWORD_RESET_DEFAULT_SUBJECT,
    defaultBody: PASSWORD_RESET_DEFAULT_BODY,
    vars: {
      name,
      resetUrl,
      // `resetButton` is the pre-rendered HTML CTA — kept as a substituted
      // variable so admins editing the body can move it around but can't
      // accidentally break the button styling.
      resetButton: buttonHtml("Reset Password", resetUrl),
    },
    wrap: baseLayout,
  });
}

// ─── Welcome Email ───────────────────────────────────────────

const WELCOME_DEFAULT_SUBJECT = "Welcome to Amana OSHC Dashboard";

const WELCOME_DEFAULT_BODY = `
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Welcome to the Team!
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi {{name}},
    </p>
    <p style="margin:0 0 8px;color:#6b7280;font-size:14px;line-height:1.6;">
      Your account on the Amana OSHC EOS Dashboard has been created.
      Use the credentials below to sign in:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background-color:#f9fafb;">
      <tr>
        <td style="padding:16px;">
          <p style="margin:0 0 8px;color:#374151;font-size:14px;">
            <strong>Temporary Password:</strong>
          </p>
          <p style="margin:0;padding:8px 12px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:6px;font-family:monospace;font-size:16px;color:#111827;letter-spacing:0.5px;">
            {{tempPassword}}
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;color:#6b7280;font-size:14px;line-height:1.6;">
      Please change your password after your first login.
    </p>
    {{signInButton}}
  `;

export async function welcomeEmail(
  name: string,
  tempPassword: string,
  loginUrl: string,
) {
  return applyEmailTemplateOverride({
    key: "auth.welcomeEmail",
    defaultSubject: WELCOME_DEFAULT_SUBJECT,
    defaultBody: WELCOME_DEFAULT_BODY,
    vars: {
      name,
      tempPassword,
      loginUrl,
      signInButton: buttonHtml("Sign In Now", loginUrl),
    },
    wrap: baseLayout,
  });
}
