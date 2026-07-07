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

/** Brand palette (Brand Guidelines 2025) */
export const JONQUIL = "#FECE00";
export const LEMON_CHIFFON = "#FFF2BF";
export const COSMIC_LATTE = "#FFFAE6";

/** Hosted brand assets — served from the dashboard's own /public. */
const EMAIL_ASSET_BASE = process.env.NEXTAUTH_URL || "https://amanaoshc.company";
const LOGO_YELLOW_URL = `${EMAIL_ASSET_BASE}/email/amana-logo-yellow.png`;

const PHONE_DISPLAY = "1300 200 262";
const PHONE_TEL = "tel:1300200262";
const POSTAL_ADDRESS = "9 Epic Place, NSW 2163, Australia";

/**
 * Token replaced with the contact-specific preferences/unsubscribe URL by
 * `appendUnsubscribeFooter` at send time (Spam Act 2003). Test/preview sends
 * substitute a sample link.
 */
export const UNSUBSCRIBE_URL_TOKEN = "{{UNSUBSCRIBE_URL}}";

/**
 * Parent-facing email layout — full Amana brand treatment.
 * Midnight Green header with the yellow sun-ray logo, warm Cosmic Latte
 * canvas, and a compliant footer: call button, reply-welcome note,
 * physical address, and an unsubscribe/preferences link (via token).
 */
export function parentEmailLayout(content: string) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:${COSMIC_LATTE};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${COSMIC_LATTE};padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,78,100,0.12);">
          <!-- Jonquil accent bar -->
          <tr>
            <td style="background-color:${JONQUIL};height:6px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <!-- Header: logo on Midnight Green -->
          <tr>
            <td style="background-color:${BRAND_COLOR};padding:28px 32px 24px;text-align:center;">
              <img src="${LOGO_YELLOW_URL}" alt="Amana OSHC" width="170" style="display:block;margin:0 auto;width:170px;max-width:60%;height:auto;" />
              <p style="margin:12px 0 0;color:${LEMON_CHIFFON};font-size:13px;letter-spacing:2px;text-transform:uppercase;">
                Beyond The Bell
              </p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="background-color:#ffffff;padding:32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer: Midnight Green, compliant + inviting -->
          <tr>
            <td style="background-color:${BRAND_COLOR};padding:28px 32px;text-align:center;">
              <p style="margin:0 0 6px;color:${JONQUIL};font-size:15px;font-weight:700;">
                Questions? We're real people.
              </p>
              <p style="margin:0 0 18px;color:${COSMIC_LATTE};font-size:13px;line-height:1.7;">
                Reply to this email anytime — we read every message.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 20px;">
                <tr>
                  <td style="background-color:${JONQUIL};border-radius:999px;">
                    <a href="${PHONE_TEL}" style="display:inline-block;padding:11px 28px;color:${BRAND_COLOR};text-decoration:none;font-size:14px;font-weight:700;">
                      &#128222;&nbsp; Call ${PHONE_DISPLAY}
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 14px;font-size:12px;">
                <a href="https://amanaoshc.com.au" style="color:${COSMIC_LATTE};text-decoration:underline;">amanaoshc.com.au</a>
                &nbsp;&nbsp;&#8226;&nbsp;&nbsp;
                <a href="mailto:contact@amanaoshc.com.au" style="color:${COSMIC_LATTE};text-decoration:underline;">Contact Us</a>
                &nbsp;&nbsp;&#8226;&nbsp;&nbsp;
                <a href="${UNSUBSCRIBE_URL_TOKEN}" style="color:${COSMIC_LATTE};text-decoration:underline;">Unsubscribe</a>
              </p>
              <p style="margin:0;color:rgba(255,250,230,0.65);font-size:11px;line-height:1.7;">
                Amana OSHC &#8226; Out of School Hours Care<br/>
                ${POSTAL_ADDRESS}<br/>
                You're receiving this email because you enquired about Amana OSHC.
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
      <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>
          <td style="background-color:${JONQUIL};border-radius:999px;">
            <a href="${href}"
               style="display:inline-block;padding:14px 36px;color:${BRAND_COLOR};text-decoration:none;font-size:15px;font-weight:700;">
              ${text}
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

/** Escape HTML-significant characters so untrusted values can't inject markup. */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

/**
 * Append the marketing unsubscribe / manage-preferences footer to a fully
 * rendered email, just inside the closing `</body>`. Used by the nurture-send
 * cron for parent (marketing) emails — transactional emails deliberately don't
 * get an unsubscribe link, so this is applied at the send site, not baked into
 * `parentEmailLayout`.
 */
export function appendUnsubscribeFooter(
  html: string,
  contactId: string,
  baseUrl: string,
): string {
  const token = generatePrefToken(contactId);
  const unsubUrl = `${baseUrl}/notifications/preferences/${contactId}?token=${token}&unsubscribe=true`;

  // Branded layouts carry the unsubscribe link inside their footer — fill in
  // the contact-specific URL.
  if (html.includes(UNSUBSCRIBE_URL_TOKEN)) {
    return html.split(UNSUBSCRIBE_URL_TOKEN).join(unsubUrl);
  }

  // Legacy/custom templates without the token get the footer appended.
  const footer = nurtureUnsubscribeFooter(contactId, baseUrl);
  const container = `
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:0 16px 24px;">
  <tr>
    <td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td>${footer}</td></tr>
      </table>
    </td>
  </tr>
</table>`;
  return html.includes("</body>")
    ? html.replace("</body>", `${container}</body>`)
    : html + container;
}
