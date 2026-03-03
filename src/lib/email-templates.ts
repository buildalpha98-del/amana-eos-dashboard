/**
 * Transactional email templates for Amana OSHC EOS Dashboard
 * All templates use inline styles for maximum email client compatibility.
 */

const BRAND_COLOR = "#004E64";
const ACCENT_COLOR = "#FECE00";

function baseLayout(content: string) {
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

function buttonHtml(text: string, href: string) {
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

// ─── Password Reset ──────────────────────────────────────────

export function passwordResetEmail(name: string, resetUrl: string) {
  const subject = "Reset your password — Amana OSHC Dashboard";
  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Password Reset Request
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${name},
    </p>
    <p style="margin:0 0 8px;color:#6b7280;font-size:14px;line-height:1.6;">
      We received a request to reset your password for the Amana OSHC Dashboard.
      Click the button below to set a new password.
    </p>
    ${buttonHtml("Reset Password", resetUrl)}
    <p style="margin:0 0 8px;color:#6b7280;font-size:14px;line-height:1.6;">
      This link will expire in <strong>1 hour</strong>. If you didn't request a password reset,
      you can safely ignore this email.
    </p>
    <p style="margin:16px 0 0;color:#9ca3af;font-size:12px;line-height:1.5;word-break:break-all;">
      If the button doesn't work, copy and paste this URL into your browser:<br/>
      <a href="${resetUrl}" style="color:${BRAND_COLOR};">${resetUrl}</a>
    </p>
  `);

  return { subject, html };
}

// ─── To-Do Reminder ──────────────────────────────────────────

export function todoReminderEmail(
  name: string,
  todos: { title: string; dueDate: string }[],
  dashboardUrl: string
) {
  const subject = `You have ${todos.length} to-do${todos.length > 1 ? "s" : ""} due soon — Amana OSHC`;

  const todoListHtml = todos
    .map(
      (t) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#374151;font-size:14px;">
        ${t.title}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#ef4444;font-size:13px;white-space:nowrap;">
        ${t.dueDate}
      </td>
    </tr>`
    )
    .join("");

  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      To-Do Reminder
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${name}, the following to-dos are due soon or overdue:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr style="background-color:#f9fafb;">
        <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;">Task</th>
        <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;">Due</th>
      </tr>
      ${todoListHtml}
    </table>
    ${buttonHtml("View To-Dos", dashboardUrl)}
  `);

  return { subject, html };
}

// ─── Ticket Notification ─────────────────────────────────────

export function ticketNotificationEmail(
  name: string,
  ticket: { title: string; priority: string; raisedBy?: string },
  ticketUrl: string
) {
  const priorityColor =
    ticket.priority === "critical"
      ? "#dc2626"
      : ticket.priority === "high"
      ? "#f59e0b"
      : "#6b7280";

  const subject = `New ticket assigned: ${ticket.title} — Amana OSHC`;

  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      New Ticket Assigned
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${name}, a new support ticket has been assigned to you:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:12px 16px;background-color:#f9fafb;">
          <p style="margin:0 0 4px;color:#111827;font-size:15px;font-weight:600;">
            ${ticket.title}
          </p>
          <p style="margin:0;color:#6b7280;font-size:13px;">
            Priority: <span style="color:${priorityColor};font-weight:600;text-transform:capitalize;">${ticket.priority}</span>
            ${ticket.raisedBy ? ` &bull; Raised by: ${ticket.raisedBy}` : ""}
          </p>
        </td>
      </tr>
    </table>
    ${buttonHtml("View Ticket", ticketUrl)}
  `);

  return { subject, html };
}

// ─── Welcome Email ───────────────────────────────────────────

export function welcomeEmail(
  name: string,
  tempPassword: string,
  loginUrl: string
) {
  const subject = "Welcome to Amana OSHC Dashboard";

  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Welcome to the Team!
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${name},
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
            ${tempPassword}
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;color:#6b7280;font-size:14px;line-height:1.6;">
      Please change your password after your first login.
    </p>
    ${buttonHtml("Sign In Now", loginUrl)}
  `);

  return { subject, html };
}
