/**
 * Shared base layout, constants, and helpers for all email templates.
 */

export const BRAND_COLOR = "#004E64";
export const ACCENT_COLOR = "#FECE00";

export function baseLayout(content: string) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color:${BRAND_COLOR};padding:24px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">
                Amana OSHC
              </h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.6);font-size:11px;text-transform:uppercase;letter-spacing:1.5px;">
                EOS Dashboard
              </p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
                Amana OSHC Leadership Team Portal<br/>
                This is an automated email — please do not reply directly.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Parent-facing email layout — no "EOS Dashboard" branding */
export function parentEmailLayout(content: string) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color:${BRAND_COLOR};padding:24px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">
                Amana OSHC
              </h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
                Amana OSHC — Out of School Hours Care<br/>
                This is an automated email — please do not reply directly.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buttonHtml(text: string, href: string) {
  return `
<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td align="center">
      <a href="${href}"
         style="display:inline-block;padding:12px 32px;background-color:${BRAND_COLOR};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;border-radius:8px;">
        ${text}
      </a>
    </td>
  </tr>
</table>`;
}

export function generatePrefToken(contactId: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHmac } = require("crypto");
  const secret = process.env.NOTIFICATION_PREF_SECRET || process.env.NEXTAUTH_SECRET || "";
  return createHmac("sha256", secret).update(contactId).digest("hex");
}

export function nurtureUnsubscribeFooter(contactId: string, baseUrl: string) {
  const token = generatePrefToken(contactId);
  const unsubUrl = `${baseUrl}/notifications/preferences/${contactId}?token=${token}`;
  return `
<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border-top:1px solid #e5e7eb;padding-top:16px;">
  <tr>
    <td align="center">
      <p style="margin:0;color:#9ca3af;font-size:11px;line-height:1.6;">
        You're receiving this because you enquired about Amana OSHC.<br/>
        <a href="${unsubUrl}" style="color:#6b7280;text-decoration:underline;">
          Manage email preferences
        </a>
        &nbsp;|&nbsp;
        <a href="${unsubUrl}?unsubscribe=true" style="color:#6b7280;text-decoration:underline;">
          Unsubscribe
        </a>
      </p>
    </td>
  </tr>
</table>`;
}
