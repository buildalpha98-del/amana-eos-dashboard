/**
 * Transactional email templates for Amana OSHC EOS Dashboard
 * All templates use inline styles for maximum email client compatibility.
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

// ─── Compliance Expiry Alert ─────────────────────────────────

export function complianceAlertEmail(
  name: string,
  certs: { type: string; label: string | null; expiryDate: Date; service: string; urgency: string }[]
) {
  const subject = `${certs.length} compliance certificate${certs.length > 1 ? "s" : ""} expiring — Amana OSHC`;

  const urgencyColor: Record<string, string> = {
    expired: "#dc2626",
    "7 days": "#f59e0b",
    "14 days": "#f97316",
    "30 days": "#6b7280",
  };

  const certRows = certs
    .map(
      (c) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#374151;font-size:13px;">
        ${c.label || c.type}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;">
        ${c.service}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">
        <span style="color:${urgencyColor[c.urgency] || "#6b7280"};font-weight:600;">
          ${c.urgency === "expired" ? "EXPIRED" : c.urgency}
        </span>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;">
        ${new Date(c.expiryDate).toLocaleDateString("en-AU")}
      </td>
    </tr>`
    )
    .join("");

  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Compliance Certificates Expiring
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${name}, the following certificates need attention:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr style="background-color:#f9fafb;">
        <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;">Certificate</th>
        <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;">Centre</th>
        <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;">Status</th>
        <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;">Expiry</th>
      </tr>
      ${certRows}
    </table>
    ${buttonHtml("View Compliance", `${process.env.NEXTAUTH_URL || "https://dashboard.amanaoshc.com.au"}/compliance`)}
  `);

  return { subject, html };
}

export function complianceAdminSummaryEmail(counts: {
  expired: number;
  due7d: number;
  due14d: number;
  due30d: number;
  total: number;
}) {
  const subject = `Compliance Summary: ${counts.total} certificates need attention — Amana OSHC`;

  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Daily Compliance Summary
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Here is today's compliance certificate status across all centres:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:16px;background-color:#fef2f2;border-bottom:1px solid #fecaca;">
          <span style="font-size:24px;font-weight:700;color:#dc2626;">${counts.expired}</span>
          <span style="color:#dc2626;font-size:13px;margin-left:8px;">Expired</span>
        </td>
        <td style="padding:16px;background-color:#fffbeb;border-bottom:1px solid #fde68a;">
          <span style="font-size:24px;font-weight:700;color:#f59e0b;">${counts.due7d}</span>
          <span style="color:#f59e0b;font-size:13px;margin-left:8px;">Within 7 days</span>
        </td>
      </tr>
      <tr>
        <td style="padding:16px;background-color:#fff7ed;">
          <span style="font-size:24px;font-weight:700;color:#f97316;">${counts.due14d}</span>
          <span style="color:#f97316;font-size:13px;margin-left:8px;">Within 14 days</span>
        </td>
        <td style="padding:16px;background-color:#f9fafb;">
          <span style="font-size:24px;font-weight:700;color:#6b7280;">${counts.due30d}</span>
          <span style="color:#6b7280;font-size:13px;margin-left:8px;">Within 30 days</span>
        </td>
      </tr>
    </table>
    ${buttonHtml("View Compliance Dashboard", `${process.env.NEXTAUTH_URL || "https://dashboard.amanaoshc.com.au"}/compliance`)}
  `);

  return { subject, html };
}

// ─── Daily Digest ───────────────────────────────────────────

export function dailyDigestEmail(
  name: string,
  counts: {
    overdueTodos: number;
    offTrackRocks: number;
    expiringCerts: number;
    unreadAnnouncements: number;
  },
  dashboardUrl: string
) {
  const total = counts.overdueTodos + counts.offTrackRocks + counts.expiringCerts + counts.unreadAnnouncements;
  const subject = `Your morning briefing: ${total} item${total > 1 ? "s" : ""} need attention — Amana OSHC`;

  const cards = [
    { label: "Overdue To-Dos", count: counts.overdueTodos, color: "#ef4444", bg: "#fef2f2" },
    { label: "Off-Track Rocks", count: counts.offTrackRocks, color: "#f59e0b", bg: "#fffbeb" },
    { label: "Expiring Certs", count: counts.expiringCerts, color: "#f97316", bg: "#fff7ed" },
    { label: "Unread Updates", count: counts.unreadAnnouncements, color: "#3b82f6", bg: "#eff6ff" },
  ].filter((c) => c.count > 0);

  const cardHtml = cards
    .map(
      (c) => `
    <td style="padding:12px 16px;background-color:${c.bg};text-align:center;width:25%;">
      <div style="font-size:28px;font-weight:700;color:${c.color};">${c.count}</div>
      <div style="font-size:11px;color:${c.color};text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">${c.label}</div>
    </td>`
    )
    .join("");

  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Good Morning, ${name}
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Here is what needs your attention today:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr>
        ${cardHtml}
      </tr>
    </table>
    ${buttonHtml("Open Dashboard", dashboardUrl)}
  `);

  return { subject, html };
}

// ─── Smart Daily Digest (AI-enhanced) ────────────────────────

export function smartDigestEmail(
  name: string,
  counts: {
    overdueTodos: number;
    offTrackRocks: number;
    expiringCerts: number;
    unreadAnnouncements: number;
  },
  aiInsights: string[],
  dashboardUrl: string
) {
  const total = counts.overdueTodos + counts.offTrackRocks + counts.expiringCerts + counts.unreadAnnouncements;
  const subject = total > 0
    ? `Your morning briefing: ${total} item${total > 1 ? "s" : ""} + ${aiInsights.length} AI insight${aiInsights.length > 1 ? "s" : ""} — Amana OSHC`
    : `Morning AI briefing: ${aiInsights.length} insight${aiInsights.length > 1 ? "s" : ""} — Amana OSHC`;

  const cards = [
    { label: "Overdue To-Dos", count: counts.overdueTodos, color: "#ef4444", bg: "#fef2f2" },
    { label: "Off-Track Rocks", count: counts.offTrackRocks, color: "#f59e0b", bg: "#fffbeb" },
    { label: "Expiring Certs", count: counts.expiringCerts, color: "#f97316", bg: "#fff7ed" },
    { label: "Unread Updates", count: counts.unreadAnnouncements, color: "#3b82f6", bg: "#eff6ff" },
  ].filter((c) => c.count > 0);

  const cardHtml = cards.length > 0
    ? cards
        .map(
          (c) => `
      <td style="padding:12px 16px;background-color:${c.bg};text-align:center;width:25%;">
        <div style="font-size:28px;font-weight:700;color:${c.color};">${c.count}</div>
        <div style="font-size:11px;color:${c.color};text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">${c.label}</div>
      </td>`
        )
        .join("")
    : "";

  const insightsHtml = aiInsights
    .map(
      (insight) =>
        `<tr><td style="padding:8px 12px;font-size:13px;color:#4c1d95;border-bottom:1px solid #ede9fe;">${insight}</td></tr>`
    )
    .join("");

  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Good Morning, ${name}
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Here is your AI-powered morning briefing:
    </p>
    ${cardHtml ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr>
        ${cardHtml}
      </tr>
    </table>
    ` : ""}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid #ede9fe;border-radius:8px;overflow:hidden;background-color:#f5f3ff;">
      <tr>
        <td style="padding:12px 12px 8px;font-size:12px;font-weight:600;color:#7c3aed;text-transform:uppercase;letter-spacing:0.5px;">
          ✨ AI Insights
        </td>
      </tr>
      ${insightsHtml}
    </table>
    ${buttonHtml("Open Dashboard", dashboardUrl)}
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

// ─── To-Do Assignment ────────────────────────────────────────

export function todoAssignedEmail(
  assigneeName: string,
  todoTitle: string,
  assignerName: string,
  dashboardUrl: string
) {
  const subject = "You've been assigned a to-do — Amana OSHC";

  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      New To-Do Assigned
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${assigneeName},
    </p>
    <p style="margin:0 0 8px;color:#6b7280;font-size:14px;line-height:1.6;">
      <strong>${assignerName}</strong> has assigned you a new to-do:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:16px;background-color:#f9fafb;">
          <p style="margin:0;color:#111827;font-size:15px;font-weight:600;">
            ${todoTitle}
          </p>
        </td>
      </tr>
    </table>
    ${buttonHtml("View To-Dos", dashboardUrl)}
  `);

  return { subject, html };
}

// ─── Rock Assignment ─────────────────────────────────────────

export function rockAssignedEmail(
  assigneeName: string,
  rockTitle: string,
  assignerName: string,
  dashboardUrl: string
) {
  const subject = "You've been assigned a rock — Amana OSHC";

  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      New Rock Assigned
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${assigneeName},
    </p>
    <p style="margin:0 0 8px;color:#6b7280;font-size:14px;line-height:1.6;">
      <strong>${assignerName}</strong> has assigned you a new rock:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:16px;background-color:#f9fafb;">
          <p style="margin:0;color:#111827;font-size:15px;font-weight:600;">
            ${rockTitle}
          </p>
        </td>
      </tr>
    </table>
    ${buttonHtml("View Rocks", dashboardUrl)}
  `);

  return { subject, html };
}

// ─── Issue Assignment ────────────────────────────────────────

export function issueAssignedEmail(
  assigneeName: string,
  issueTitle: string,
  assignerName: string,
  dashboardUrl: string
) {
  const subject = "An issue has been assigned to you — Amana OSHC";

  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Issue Assigned to You
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${assigneeName},
    </p>
    <p style="margin:0 0 8px;color:#6b7280;font-size:14px;line-height:1.6;">
      <strong>${assignerName}</strong> has assigned you an issue:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:16px;background-color:#f9fafb;">
          <p style="margin:0;color:#111827;font-size:15px;font-weight:600;">
            ${issueTitle}
          </p>
        </td>
      </tr>
    </table>
    ${buttonHtml("View Issues", dashboardUrl)}
  `);

  return { subject, html };
}

// ─── Weekly Report ──────────────────────────────────────────

interface WeeklyReportData {
  weekOf: string;
  totalRevenue: number;
  avgBscOccupancy: number;
  avgAscOccupancy: number;
  overdueTodos: number;
  offTrackRocks: number;
  expiringCerts: number;
  centres: { name: string; code: string; bscOccupancy: number; ascOccupancy: number }[];
  dashboardUrl: string;
}

export function weeklyReportEmail(name: string, data: WeeklyReportData) {
  const subject = `Weekly Report: w/c ${data.weekOf} — Amana OSHC`;

  const riskItems: string[] = [];
  if (data.overdueTodos > 0) riskItems.push(`${data.overdueTodos} overdue to-do${data.overdueTodos > 1 ? "s" : ""}`);
  if (data.offTrackRocks > 0) riskItems.push(`${data.offTrackRocks} off-track rock${data.offTrackRocks > 1 ? "s" : ""}`);
  if (data.expiringCerts > 0) riskItems.push(`${data.expiringCerts} expiring cert${data.expiringCerts > 1 ? "s" : ""}`);

  const riskHtml = riskItems.length > 0
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid #fecaca;border-radius:8px;overflow:hidden;background-color:#fef2f2;">
        <tr><td style="padding:12px 16px;">
          <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#dc2626;">⚠️ Items Needing Attention</p>
          <p style="margin:0;font-size:13px;color:#991b1b;">${riskItems.join(" &bull; ")}</p>
        </td></tr>
       </table>`
    : "";

  const centreRowsHtml = data.centres
    .map((c) => {
      const bscColor = c.bscOccupancy >= 75 ? "#10b981" : c.bscOccupancy >= 50 ? "#f59e0b" : "#ef4444";
      const ascColor = c.ascOccupancy >= 75 ? "#10b981" : c.ascOccupancy >= 50 ? "#f59e0b" : "#ef4444";
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#374151;font-size:13px;">${c.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:center;font-size:13px;font-weight:600;color:${bscColor};">${c.bscOccupancy}%</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:center;font-size:13px;font-weight:600;color:${ascColor};">${c.ascOccupancy}%</td>
      </tr>`;
    })
    .join("");

  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Weekly Leadership Report
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${name}, here is your weekly summary for the week commencing ${data.weekOf}:
    </p>

    <!-- KPI Cards -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:16px;text-align:center;background-color:#f0fdf4;width:33%;">
          <div style="font-size:24px;font-weight:700;color:#10b981;">$${data.totalRevenue.toLocaleString("en-AU", { minimumFractionDigits: 0 })}</div>
          <div style="font-size:11px;color:#059669;text-transform:uppercase;margin-top:4px;">Est. Revenue</div>
        </td>
        <td style="padding:16px;text-align:center;background-color:#eff6ff;width:33%;">
          <div style="font-size:24px;font-weight:700;color:#3b82f6;">${data.avgBscOccupancy}%</div>
          <div style="font-size:11px;color:#2563eb;text-transform:uppercase;margin-top:4px;">BSC Occupancy</div>
        </td>
        <td style="padding:16px;text-align:center;background-color:#f5f3ff;width:34%;">
          <div style="font-size:24px;font-weight:700;color:#8b5cf6;">${data.avgAscOccupancy}%</div>
          <div style="font-size:11px;color:#7c3aed;text-transform:uppercase;margin-top:4px;">ASC Occupancy</div>
        </td>
      </tr>
    </table>

    ${riskHtml}

    <!-- Centre Breakdown -->
    ${data.centres.length > 0 ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr style="background-color:#f9fafb;">
        <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;">Centre</th>
        <th style="padding:8px 12px;text-align:center;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;">BSC %</th>
        <th style="padding:8px 12px;text-align:center;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;">ASC %</th>
      </tr>
      ${centreRowsHtml}
    </table>
    ` : ""}

    ${buttonHtml("Open Dashboard", data.dashboardUrl)}
  `);

  return { subject, html };
}

// ─── Parent Nurture: Welcome ────────────────────────────────

export function nurtureWelcomeEmail(firstName: string, centreName: string) {
  const subject = `Welcome to ${centreName} — Amana OSHC`;
  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Welcome to ${centreName}!
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 8px;color:#6b7280;font-size:14px;line-height:1.6;">
      We're so excited to have your family join us at ${centreName}. Our team is here to make sure your child
      has a safe, fun, and enriching experience in Before and After School Care.
    </p>
    <p style="margin:0 0 8px;color:#6b7280;font-size:14px;line-height:1.6;">
      Over the next couple of weeks, we'll send you a few helpful emails to get you settled in — from
      enrolment tips to what to pack and how to set up the parent app.
    </p>
    <p style="margin:0 0 8px;color:#6b7280;font-size:14px;line-height:1.6;">
      If you have any questions in the meantime, don't hesitate to reach out to our centre team. We're
      always happy to help!
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background-color:#f0fdf4;">
      <tr>
        <td style="padding:16px;">
          <p style="margin:0;color:#065f46;font-size:14px;font-weight:600;">
            What's coming up:
          </p>
          <p style="margin:8px 0 0;color:#047857;font-size:13px;line-height:1.8;">
            1. How to complete your enrolment<br/>
            2. What to bring on your first day<br/>
            3. Setting up the parent app<br/>
            4. Your first week guide
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

// ─── Parent Nurture: How to Enrol ───────────────────────────

export function nurtureHowToEnrolEmail(firstName: string, centreName: string) {
  const subject = `How to complete your enrolment — ${centreName}`;
  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Completing Your Enrolment
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 8px;color:#6b7280;font-size:14px;line-height:1.6;">
      Ready to lock in your child's spot? Here's how to complete the enrolment process:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:16px;background-color:#f9fafb;">
          <p style="margin:0 0 12px;color:#111827;font-size:14px;font-weight:600;">Step 1: Complete the enrolment form</p>
          <p style="margin:0 0 4px;color:#6b7280;font-size:13px;line-height:1.6;">
            Fill in your child's details, emergency contacts, medical information, and authorised pick-up people.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 12px;color:#111827;font-size:14px;font-weight:600;">Step 2: Submit your CCS details</p>
          <p style="margin:0 0 4px;color:#6b7280;font-size:13px;line-height:1.6;">
            If you're eligible for the Child Care Subsidy, make sure your CRN (Customer Reference Number)
            and date of birth are included so we can process your subsidy.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 12px;color:#111827;font-size:14px;font-weight:600;">Step 3: Choose your booking days</p>
          <p style="margin:0 0 4px;color:#6b7280;font-size:13px;line-height:1.6;">
            Select the days and sessions (Before School Care, After School Care, or both) that suit your family.
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;color:#6b7280;font-size:14px;line-height:1.6;">
      If you need help at any stage, just reply to this email or call the centre — we're here for you.
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

// ─── Parent Nurture: What to Bring ──────────────────────────

export function nurtureWhatToBringEmail(firstName: string, centreName: string) {
  const subject = `What to bring to ${centreName} — Amana OSHC`;
  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      What to Bring
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 8px;color:#6b7280;font-size:14px;line-height:1.6;">
      Getting ready for your child's first day? Here's a handy checklist of what to pack:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background-color:#f9fafb;">
      <tr>
        <td style="padding:16px;">
          <p style="margin:0 0 8px;color:#111827;font-size:14px;font-weight:600;">Daily essentials:</p>
          <p style="margin:0;color:#6b7280;font-size:13px;line-height:2;">
            &#10003; Labelled water bottle<br/>
            &#10003; Labelled hat (broad-brimmed or legionnaire)<br/>
            &#10003; A healthy snack or afternoon tea<br/>
            &#10003; Comfortable clothes suitable for active play<br/>
            &#10003; A change of clothes (especially for younger children)<br/>
            &#10003; Sunscreen applied before arrival
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 8px;color:#111827;font-size:14px;font-weight:600;">Good to know:</p>
          <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.8;">
            &#8226; We provide breakfast during BSC and a light snack during ASC<br/>
            &#8226; Please label all belongings with your child's name<br/>
            &#8226; Leave valuables and electronics at home unless needed for homework
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;color:#6b7280;font-size:14px;line-height:1.6;">
      We can't wait to see your child at the centre!
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

// ─── Parent Nurture: App Setup ──────────────────────────────

export function nurtureAppSetupEmail(firstName: string, centreName: string) {
  const subject = `Set up the parent app — ${centreName}`;
  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Setting Up the Parent App
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 8px;color:#6b7280;font-size:14px;line-height:1.6;">
      Stay connected with ${centreName} through our parent app. You'll be able to:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:16px;background-color:#eff6ff;">
          <p style="margin:0;color:#1e40af;font-size:13px;line-height:2;">
            &#10003; View your child's daily activities and updates<br/>
            &#10003; Manage bookings and view your schedule<br/>
            &#10003; Receive important notifications from the centre<br/>
            &#10003; Update your family details and contacts<br/>
            &#10003; View statements and payment history
          </p>
        </td>
      </tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background-color:#f9fafb;">
      <tr>
        <td style="padding:16px;">
          <p style="margin:0 0 8px;color:#111827;font-size:14px;font-weight:600;">How to get started:</p>
          <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.8;">
            1. Download the OWNA app from the App Store or Google Play<br/>
            2. Create your account using the email you enrolled with<br/>
            3. Follow the prompts to link your child's profile
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;color:#6b7280;font-size:14px;line-height:1.6;">
      If you run into any issues, our team at the centre can help you get set up.
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

// ─── Parent Nurture: First Week Guide ───────────────────────

export function nurtureFirstWeekEmail(firstName: string, centreName: string) {
  const subject = `Your first week guide — ${centreName}`;
  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Your First Week Guide
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 8px;color:#6b7280;font-size:14px;line-height:1.6;">
      Your child's first week is an exciting time! Here are some tips to help everything go smoothly:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:16px;background-color:#fefce8;border-bottom:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;color:#854d0e;font-size:14px;font-weight:600;">Before School Care (BSC)</p>
          <p style="margin:0;color:#713f12;font-size:13px;line-height:1.6;">
            Drop-off is from 6:30am. We provide a light breakfast, then walk children to their classrooms
            before the school bell.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px;background-color:#f0fdf4;border-bottom:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;color:#065f46;font-size:14px;font-weight:600;">After School Care (ASC)</p>
          <p style="margin:0;color:#047857;font-size:13px;line-height:1.6;">
            We collect children from their classrooms. Pick-up is available until 6:00pm. We provide
            afternoon tea and a mix of structured activities and free play.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px;background-color:#eff6ff;">
          <p style="margin:0 0 4px;color:#1e40af;font-size:14px;font-weight:600;">Tips for a great start</p>
          <p style="margin:0;color:#1e3a5f;font-size:13px;line-height:1.8;">
            &#8226; Talk to your child about what to expect — it helps them feel prepared<br/>
            &#8226; Arrive a few minutes early on the first day so they can settle in<br/>
            &#8226; Let our educators know about any special needs, allergies, or routines<br/>
            &#8226; Don't worry if there are a few tears — our team is experienced and caring
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;color:#6b7280;font-size:14px;line-height:1.6;">
      We're here to support your family every step of the way. Welcome to the Amana OSHC community!
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

// ─── Holiday Quest Programme ────────────────────────────────

interface HolidayQuestEmailDay {
  date: string;
  theme: string;
  morningActivity: string;
  afternoonActivity: string;
  isExcursion: boolean;
  excursionVenue?: string;
}

export function holidayQuestProgrammeEmail(
  centreName: string,
  periodLabel: string,
  days: HolidayQuestEmailDay[],
) {
  const subject = `Holiday Quest Programme: ${periodLabel} — ${centreName}`;

  const dayRows = days
    .map((d) => {
      const dateStr = new Date(d.date).toLocaleDateString("en-AU", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
      const excursionBadge = d.isExcursion
        ? `<span style="display:inline-block;padding:2px 8px;background-color:#fef3c7;color:#92400e;font-size:11px;font-weight:600;border-radius:4px;margin-left:8px;">EXCURSION${d.excursionVenue ? ` — ${d.excursionVenue}` : ""}</span>`
        : "";
      return `
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #f3f4f6;">
          <p style="margin:0 0 4px;color:#111827;font-size:14px;font-weight:600;">
            ${dateStr}: ${d.theme}${excursionBadge}
          </p>
          <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">
            <strong>AM:</strong> ${d.morningActivity}<br/>
            <strong>PM:</strong> ${d.afternoonActivity}
          </p>
        </td>
      </tr>`;
    })
    .join("");

  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Holiday Quest Programme
    </h2>
    <p style="margin:0 0 4px;color:${BRAND_COLOR};font-size:14px;font-weight:600;">
      ${centreName} — ${periodLabel}
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      We've got an amazing lineup of activities planned for your child! Check out what's
      coming up during the school holidays:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr style="background-color:${BRAND_COLOR};">
        <td style="padding:12px 16px;">
          <p style="margin:0;color:#ffffff;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">
            Daily Programme
          </p>
        </td>
      </tr>
      ${dayRows}
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background-color:#f0fdf4;">
      <tr>
        <td style="padding:16px;text-align:center;">
          <p style="margin:0 0 4px;color:#065f46;font-size:16px;font-weight:700;">
            $100 per day
          </p>
          <p style="margin:0;color:#047857;font-size:13px;">
            Child Care Subsidy may apply — check your eligibility
          </p>
        </td>
      </tr>
    </table>
    ${buttonHtml("Book Now", `${process.env.NEXTAUTH_URL || "https://dashboard.amanaoshc.com.au"}/holiday-quest`)}
    <p style="margin:16px 0 0;color:#9ca3af;font-size:12px;text-align:center;">
      Places are limited — book early to avoid missing out!
    </p>
  `);

  return { subject, html };
}

// ─── Board Report: Draft Notification ───────────────────────

export function boardReportDraftNotificationEmail(
  name: string,
  month: number,
  year: number,
  reportUrl: string,
) {
  const monthName = new Date(year, month - 1).toLocaleDateString("en-AU", { month: "long" });
  const subject = `${monthName} ${year} Board Report Draft Ready — Amana OSHC`;

  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Board Report Draft Ready
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${name}, the <strong>${monthName} ${year}</strong> board report has been automatically generated
      and is ready for your review.
    </p>
    <p style="margin:0 0 8px;color:#6b7280;font-size:14px;line-height:1.6;">
      Please review the data, edit the narrative sections as needed, and send to the board when ready.
    </p>
    ${buttonHtml("Review Report", reportUrl)}
    <p style="margin:16px 0 0;color:#9ca3af;font-size:12px;">
      This report was auto-generated on the 2nd of the month using data from the previous month.
    </p>
  `);

  return { subject, html };
}

// ─── Board Report: Send to Board ────────────────────────────

export function boardReportEmail(
  name: string,
  data: {
    month: string;
    year: number;
    totalRevenue: number;
    grossProfit: number;
    avgMargin: number;
    avgOccupancy: number;
    activeStaff: number;
    rocksOnTrack: number;
    rocksTotal: number;
    executiveSummary: string;
    dashboardUrl: string;
  },
) {
  const subject = `${data.month} ${data.year} Board Report — Amana OSHC`;

  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Monthly Board Report
    </h2>
    <p style="margin:0 0 4px;color:${BRAND_COLOR};font-size:14px;font-weight:600;">
      ${data.month} ${data.year}
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${name}, please find the monthly board report summary below.
    </p>

    <!-- KPI Cards -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:16px;text-align:center;background-color:#f0fdf4;width:33%;">
          <div style="font-size:22px;font-weight:700;color:#10b981;">$${data.totalRevenue.toLocaleString("en-AU", { minimumFractionDigits: 0 })}</div>
          <div style="font-size:11px;color:#059669;text-transform:uppercase;margin-top:4px;">Revenue</div>
        </td>
        <td style="padding:16px;text-align:center;background-color:#eff6ff;width:33%;">
          <div style="font-size:22px;font-weight:700;color:#3b82f6;">${Math.round(data.avgMargin)}%</div>
          <div style="font-size:11px;color:#2563eb;text-transform:uppercase;margin-top:4px;">Margin</div>
        </td>
        <td style="padding:16px;text-align:center;background-color:#f5f3ff;width:34%;">
          <div style="font-size:22px;font-weight:700;color:#8b5cf6;">${data.avgOccupancy}%</div>
          <div style="font-size:11px;color:#7c3aed;text-transform:uppercase;margin-top:4px;">Occupancy</div>
        </td>
      </tr>
      <tr>
        <td style="padding:12px;text-align:center;background-color:#fffbeb;width:33%;">
          <div style="font-size:18px;font-weight:700;color:#f59e0b;">${data.activeStaff}</div>
          <div style="font-size:11px;color:#d97706;text-transform:uppercase;margin-top:2px;">Staff</div>
        </td>
        <td colspan="2" style="padding:12px;text-align:center;background-color:#f9fafb;width:67%;">
          <div style="font-size:18px;font-weight:700;color:${BRAND_COLOR};">${data.rocksOnTrack}/${data.rocksTotal}</div>
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;margin-top:2px;">Rocks On Track</div>
        </td>
      </tr>
    </table>

    <!-- Executive Summary -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:16px;background-color:#f9fafb;">
          <p style="margin:0 0 8px;color:#111827;font-size:14px;font-weight:600;">Executive Summary</p>
          <p style="margin:0;color:#374151;font-size:13px;line-height:1.7;">
            ${data.executiveSummary}
          </p>
        </td>
      </tr>
    </table>

    ${buttonHtml("View Full Report", data.dashboardUrl)}
    <p style="margin:16px 0 0;color:#9ca3af;font-size:12px;text-align:center;">
      View the complete report with detailed breakdowns on the dashboard.
    </p>
  `);

  return { subject, html };
}

// ─── Staffing Alert ─────────────────────────────────────────

interface StaffingAlertService {
  name: string;
  status: "overstaffed" | "understaffed" | "optimal" | "no_data";
  bscVariance: number;
  ascVariance: number;
  totalWaste: number;
  totalRisk: number;
}

export function staffingAlertEmail(
  name: string,
  date: string,
  alerts: StaffingAlertService[],
  dashboardUrl: string,
  qualificationRisks?: Array<{
    serviceName: string;
    sessionType: string;
    diplomaPercent: number;
    diplomaCount: number;
    totalRostered: number;
  }>,
) {
  const wasteAlerts = alerts.filter((a) => a.status === "overstaffed");
  const riskAlerts = alerts.filter((a) => a.status === "understaffed");
  const totalAlerts = wasteAlerts.length + riskAlerts.length;

  const subject = `${totalAlerts} staffing alert${totalAlerts !== 1 ? "s" : ""} for ${date} — Amana OSHC`;

  const statusColor: Record<string, string> = {
    overstaffed: "#f97316",
    understaffed: "#dc2626",
    optimal: "#10b981",
  };

  const alertRows = alerts
    .filter((a) => a.status !== "optimal" && a.status !== "no_data")
    .map(
      (a) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#374151;font-size:13px;font-weight:500;">
        ${a.name}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">
        <span style="color:${statusColor[a.status] || "#6b7280"};font-weight:600;text-transform:uppercase;">
          ${a.status === "overstaffed" ? "OVER" : "UNDER"}
        </span>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;text-align:center;">
        ${a.bscVariance > 0 ? "+" : ""}${a.bscVariance}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;text-align:center;">
        ${a.ascVariance > 0 ? "+" : ""}${a.ascVariance}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;color:${a.totalWaste > 0 ? "#f97316" : "#dc2626"};">
        ${a.totalWaste > 0 ? `$${a.totalWaste.toFixed(0)} waste` : `$${a.totalRisk.toFixed(0)} at risk`}
      </td>
    </tr>`,
    )
    .join("");

  const summaryHtml =
    wasteAlerts.length > 0 || riskAlerts.length > 0
      ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr>
        ${
          wasteAlerts.length > 0
            ? `<td style="padding:16px;text-align:center;background-color:#fff7ed;width:50%;">
            <div style="font-size:24px;font-weight:700;color:#f97316;">$${wasteAlerts.reduce((s, a) => s + a.totalWaste, 0).toFixed(0)}</div>
            <div style="font-size:11px;color:#ea580c;text-transform:uppercase;margin-top:4px;">Overstaffing Waste</div>
          </td>`
            : ""
        }
        ${
          riskAlerts.length > 0
            ? `<td style="padding:16px;text-align:center;background-color:#fef2f2;width:50%;">
            <div style="font-size:24px;font-weight:700;color:#dc2626;">$${riskAlerts.reduce((s, a) => s + a.totalRisk, 0).toFixed(0)}</div>
            <div style="font-size:11px;color:#dc2626;text-transform:uppercase;margin-top:4px;">Revenue at Risk</div>
          </td>`
            : ""
        }
      </tr>
    </table>`
      : "";

  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Staffing Alerts for ${date}
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${name}, the following centres have staffing imbalances for tomorrow:
    </p>

    ${summaryHtml}

    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr style="background-color:#f9fafb;">
        <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;">Centre</th>
        <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;">Status</th>
        <th style="padding:8px 12px;text-align:center;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;">BSC</th>
        <th style="padding:8px 12px;text-align:center;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;">ASC</th>
        <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;">Impact</th>
      </tr>
      ${alertRows}
    </table>

    <p style="margin:16px 0 0;color:#9ca3af;font-size:12px;">
      BSC/ASC values show educator variance (+ = over, - = under). Ratio: 1 educator per 15 children.
    </p>

    ${
      qualificationRisks && qualificationRisks.length > 0
        ? `
    <div style="margin:24px 0 0;">
      <h3 style="margin:0 0 8px;color:#111827;font-size:15px;font-weight:600;">
        VIC Qualification Risks
      </h3>
      <p style="margin:0 0 12px;color:#6b7280;font-size:13px;">
        The following sessions have fewer than 50% diploma-qualified educators rostered:
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr style="background-color:#fef2f2;">
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;">Centre</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;">Session</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;">Diploma %</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;">Qualified / Total</th>
        </tr>
        ${qualificationRisks
          .map(
            (r) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#374151;font-size:13px;font-weight:500;">${r.serviceName}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;text-align:center;">${r.sessionType}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;text-align:center;font-weight:600;color:#dc2626;">${r.diplomaPercent}%</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;text-align:center;">${r.diplomaCount} / ${r.totalRostered}</td>
        </tr>`,
          )
          .join("")}
      </table>
    </div>`
        : ""
    }

    ${buttonHtml("View Staffing Dashboard", dashboardUrl)}
  `);

  return { subject, html };
}

// ─── Marketing Weekly Digest ──────────────────────────────────

export function marketingDigestEmail(data: {
  weekEnding: string;
  centres: Array<{
    name: string;
    posts: number;
    status: string;
    bookingDelta: number;
  }>;
  summary: {
    activeCentres: number;
    moderateCentres: number;
    neglectedCentres: number;
    postsPublished: number;
    tasksCompleted: number;
    tasksOverdue: number;
    newLeads: number;
    conversions: number;
  };
  actionItems: string[];
}): { subject: string; html: string } {
  const { weekEnding, centres, summary, actionItems } = data;
  const subject = `Amana OSHC — Marketing Digest: Week Ending ${weekEnding}`;
  const dashboardUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://eos.amanaoshc.com.au") + "/marketing";

  const statusColor = (s: string) =>
    s === "active" ? "#16a34a" : s === "moderate" ? "#d97706" : "#dc2626";
  const statusBg = (s: string) =>
    s === "active" ? "#f0fdf4" : s === "moderate" ? "#fffbeb" : "#fef2f2";
  const deltaStr = (d: number) =>
    d > 0 ? `+${d}` : d === 0 ? "—" : String(d);
  const deltaColor = (d: number) =>
    d > 0 ? "#16a34a" : d < 0 ? "#dc2626" : "#6b7280";

  const centreRows = centres
    .map(
      (c) => `
    <tr style="background-color:${statusBg(c.status)};">
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#111827;">${c.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:center;">${c.posts}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:center;">
        <span style="color:${statusColor(c.status)};font-weight:600;text-transform:capitalize;">${c.status}</span>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:center;color:${deltaColor(c.bookingDelta)};font-weight:600;">${deltaStr(c.bookingDelta)}</td>
    </tr>`,
    )
    .join("");

  const actionHtml = actionItems.length
    ? actionItems
        .map(
          (item, i) =>
            `<tr>
          <td style="padding:6px 0;font-size:13px;color:#111827;vertical-align:top;">
            <span style="display:inline-block;width:20px;height:20px;line-height:20px;text-align:center;background-color:${BRAND_COLOR};color:#fff;border-radius:50%;font-size:11px;font-weight:700;margin-right:8px;">${i + 1}</span>
            ${item}
          </td>
        </tr>`,
        )
        .join("")
    : `<tr><td style="padding:6px 0;font-size:13px;color:#6b7280;">No urgent actions this week.</td></tr>`;

  const html = baseLayout(`
    <h2 style="margin:0 0 4px;color:#111827;font-size:18px;font-weight:600;">
      Marketing Weekly Digest
    </h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:13px;">
      Week ending ${weekEnding}
    </p>

    <!-- Summary Cards -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="padding:12px;background-color:#f0fdf4;border-radius:8px;text-align:center;width:33%;">
          <div style="font-size:22px;font-weight:700;color:#16a34a;">${summary.activeCentres}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px;">Active</div>
        </td>
        <td style="width:8px;"></td>
        <td style="padding:12px;background-color:#fffbeb;border-radius:8px;text-align:center;width:33%;">
          <div style="font-size:22px;font-weight:700;color:#d97706;">${summary.moderateCentres}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px;">Moderate</div>
        </td>
        <td style="width:8px;"></td>
        <td style="padding:12px;background-color:#fef2f2;border-radius:8px;text-align:center;width:33%;">
          <div style="font-size:22px;font-weight:700;color:#dc2626;">${summary.neglectedCentres}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px;">Neglected</div>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="padding:8px 12px;background-color:#f9fafb;border-radius:6px;font-size:13px;color:#374151;">
          <strong>${summary.postsPublished}</strong> posts published &nbsp;·&nbsp;
          <strong>${summary.tasksCompleted}</strong> tasks done &nbsp;·&nbsp;
          <strong style="color:${summary.tasksOverdue > 0 ? "#dc2626" : "#6b7280"};">${summary.tasksOverdue}</strong> overdue &nbsp;·&nbsp;
          <strong>${summary.newLeads}</strong> new leads &nbsp;·&nbsp;
          <strong>${summary.conversions}</strong> conversions
        </td>
      </tr>
    </table>

    <!-- Centre Coverage Table -->
    <h3 style="margin:0 0 8px;color:#111827;font-size:14px;font-weight:600;">
      Centre Coverage
    </h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
      <tr style="background-color:${BRAND_COLOR};">
        <th style="padding:10px 12px;text-align:left;font-size:12px;color:#ffffff;font-weight:600;">Centre</th>
        <th style="padding:10px 12px;text-align:center;font-size:12px;color:#ffffff;font-weight:600;">Posts</th>
        <th style="padding:10px 12px;text-align:center;font-size:12px;color:#ffffff;font-weight:600;">Status</th>
        <th style="padding:10px 12px;text-align:center;font-size:12px;color:#ffffff;font-weight:600;">Bookings WoW</th>
      </tr>
      ${centreRows}
    </table>

    <!-- Action Items -->
    <h3 style="margin:0 0 8px;color:#111827;font-size:14px;font-weight:600;">
      Top Actions for Next Week
    </h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      ${actionHtml}
    </table>

    ${buttonHtml("Open Marketing Dashboard", dashboardUrl)}
  `);

  return { subject, html };
}

// ─── Parent Nurture: NPS Survey (Day 30) ─────────────────────

export function nurtureNpsSurveyEmail(firstName: string, centreName: string) {
  const surveyUrl = process.env.NPS_SURVEY_URL || "https://eos.amanaoshc.com.au/survey/nps";
  const subject = `How are things going? — ${centreName}`;
  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      We'd Love Your Feedback
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      It's been about a month since your child started at Amana OSHC ${centreName}.
      We'd love to hear how things are going! Please take 30 seconds to share your feedback
      — it helps us improve the experience for every family.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background-color:#f0fdf4;">
      <tr>
        <td style="padding:20px;text-align:center;">
          <p style="margin:0 0 4px;color:#065f46;font-size:16px;font-weight:700;">
            One quick question
          </p>
          <p style="margin:0;color:#047857;font-size:13px;">
            How likely are you to recommend Amana OSHC to a friend? (0–10)
          </p>
        </td>
      </tr>
    </table>
    ${buttonHtml("Share Your Feedback", surveyUrl)}
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Your response is anonymous and takes less than a minute. Thank you for being part of the
      Amana OSHC community!
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

// ─── Enquiry Nurture Templates ─────────────────────────────────

export function nurtureCcsAssistEmail(firstName: string, centreName: string) {
  const subject = `Understanding Child Care Subsidy — ${centreName}`;
  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Did You Know About the Child Care Subsidy?
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Many families at ${centreName} pay significantly less than the listed fee thanks to the
      Child Care Subsidy (CCS). Depending on your household income, the government may cover
      up to 90% of session fees.
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Our team can help you understand your estimated out-of-pocket costs.
      Feel free to reply to this email or call the centre — we're happy to walk you through it.
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

export function nurtureNudge1Email(firstName: string, centreName: string) {
  const subject = `Just checking in — ${centreName}`;
  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      We're Here to Help
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      We sent through some information about our programmes at ${centreName} a few days ago
      and wanted to check if you had any questions. Whether it's about daily routines or costs
      — we're happy to chat. Simply reply to this email or give us a call.
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

export function nurtureFormSupportEmail(firstName: string, centreName: string) {
  const subject = `Need help with the enrolment form? — ${centreName}`;
  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      We Can Help You Complete the Form
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      We noticed you've started the enrolment form for ${centreName} — great to see! If you need
      any help completing it, our team is here. We can walk you through it over the phone or via
      WhatsApp. Just reply and we'll arrange a time.
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

export function nurtureNudge2Email(firstName: string, centreName: string) {
  const subject = `Still thinking it over? — ${centreName}`;
  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      We'd Love to Welcome Your Family
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      We understand choosing the right OSHC programme is an important decision. If there's anything
      holding you back, please don't hesitate to reach out. We're happy to arrange a visit so you
      can see ${centreName} in action.
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

export function nurtureFinalNudgeEmail(firstName: string, centreName: string) {
  const subject = `One last note from ${centreName}`;
  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      We're Here When You're Ready
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      We won't keep sending messages, but please know our door is always open at ${centreName}.
      If your plans change, you can reach us anytime by replying to this email or calling the centre.
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

export function nurtureDay1CheckinEmail(firstName: string, centreName: string) {
  const subject = `How was the first day? — ${centreName}`;
  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Hope Day One Went Well!
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      We hope your child had a wonderful first day at ${centreName}! If you have any questions
      or feedback, please don't hesitate to reach out.
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

export function nurtureDay3CheckinEmail(firstName: string, centreName: string) {
  const subject = `Settling in well? — ${centreName}`;
  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Quick Check-In
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      It's been a few days since your child started at ${centreName}, and we wanted to check in.
      Is everything going well? Let us know if there's anything we can do to make the transition smoother.
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

export function nurtureWeek2FeedbackEmail(firstName: string, centreName: string) {
  const subject = `Two weeks in — how's it going? — ${centreName}`;
  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      We'd Love Your Feedback
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      It's been two weeks since your child started at ${centreName}! Your feedback helps us improve
      the experience for every family. Simply reply to this email with your thoughts.
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

export function nurtureMonth1ReferralEmail(firstName: string, centreName: string) {
  const subject = `Know a family who'd love ${centreName}?`;
  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Refer a Friend, Earn a Reward
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      If you know another family who might benefit from our OSHC programmes at ${centreName},
      we offer a <strong>$50 referral reward</strong> for every family you refer who enrols.
      Just reply with your friend's name and we'll take care of the rest.
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

// ─── Staff Pulse Survey Notification ──────────────────────────

export function pulseSurveyEmail(
  name: string,
  periodMonth: string,
  portalUrl: string,
) {
  const [year, month] = periodMonth.split("-");
  const monthName = new Date(Number(year), Number(month) - 1).toLocaleString(
    "en-AU",
    { month: "long", year: "numeric" },
  );

  const subject = `Your monthly pulse survey is ready — ${monthName}`;

  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      Monthly Pulse Survey
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${name}, your pulse survey for <strong>${monthName}</strong> is ready.
      It takes less than a minute to complete and helps us understand how you're going.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:16px;background-color:#f0fdf4;">
          <p style="margin:0;font-size:13px;color:#166534;">
            Your responses are reviewed in aggregate to improve the workplace for everyone.
            Individual feedback is only visible to centre management.
          </p>
        </td>
      </tr>
    </table>

    ${buttonHtml("Complete Survey", portalUrl)}

    <p style="margin:16px 0 0;color:#9ca3af;font-size:12px;">
      The survey covers happiness, support, scheduling satisfaction, and whether you'd recommend us as an employer.
    </p>
  `);

  return { subject, html };
}

// ─── Exit Survey Email ──────────────────────────────────────────

export function nurtureExitSurveyEmail(
  firstName: string,
  centreName: string,
  surveyUrl: string,
) {
  const subject = `We'd love your feedback — ${centreName}`;
  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      We're sorry to see you go
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      We understand that your family will be leaving ${centreName}. We truly value the time
      your child spent with us, and we'd love to hear about your experience.
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Your feedback helps us improve our service for all families. The survey takes
      less than 2 minutes to complete.
    </p>

    ${buttonHtml("Share Your Feedback", surveyUrl)}

    <p style="margin:16px 0 0;color:#9ca3af;font-size:12px;">
      This link will expire in 30 days. Your responses are confidential.
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      Warm regards,<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);

  return { subject, html };
}

// ─── Enrolment Confirmation ─────────────────────────────────

export function enrolmentConfirmationEmail(parentName: string, childNames: string) {
  const subject = "Enrolment Received — Amana OSHC";
  const html = baseLayout(`
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
  const html = baseLayout(`
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

// ─── First Session Reminder (day before) ─────────────────────

export function nurtureSessionReminderEmail(
  firstName: string,
  centreName: string,
  serviceAddress?: string,
  orientationVideoUrl?: string
) {
  const subject = `See you tomorrow! — ${centreName}`;
  const addressBlock = serviceAddress
    ? `<p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
        <strong>Where to go:</strong> ${serviceAddress}
      </p>`
    : "";
  const videoBlock = orientationVideoUrl
    ? `<p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
        Before your child's first day, we recommend watching our short orientation video:
      </p>
      ${buttonHtml("Watch Orientation Video", orientationVideoUrl)}`
    : "";
  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:600;">
      See You Tomorrow!
    </h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Hi ${firstName},
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      We're excited to welcome your child to ${centreName} tomorrow! Here's everything
      you need to know for a smooth first day.
    </p>
    ${addressBlock}
    <div style="background-color:#f9fafb;border-radius:8px;padding:16px;margin:0 0 16px;">
      <p style="margin:0 0 8px;color:#111827;font-size:14px;font-weight:600;">What to Bring:</p>
      <ul style="margin:0;padding:0 0 0 20px;color:#6b7280;font-size:14px;line-height:1.8;">
        <li>A labelled water bottle</li>
        <li>A hat (we are a SunSmart centre)</li>
        <li>Comfortable clothes and shoes for active play</li>
        <li>A change of clothes (just in case)</li>
        <li>Any medication with a signed medication form</li>
      </ul>
    </div>
    <div style="background-color:#f9fafb;border-radius:8px;padding:16px;margin:0 0 16px;">
      <p style="margin:0 0 8px;color:#111827;font-size:14px;font-weight:600;">Drop-off & Pickup:</p>
      <ul style="margin:0;padding:0 0 0 20px;color:#6b7280;font-size:14px;line-height:1.8;">
        <li><strong>Before School Care:</strong> Drop off from 6:30 AM</li>
        <li><strong>After School Care:</strong> Pick up by 6:00 PM</li>
        <li>Please sign your child in and out at the front desk</li>
        <li>Only authorised persons can collect your child</li>
      </ul>
    </div>
    ${videoBlock}
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      If you have any last-minute questions, feel free to call or message us.
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
      See you soon!<br/>
      <strong>The ${centreName} Team</strong>
    </p>
  `);
  return { subject, html };
}

// ─── Unsubscribe footer helper ───────────────────────────────

export function nurtureUnsubscribeFooter(contactId: string, baseUrl: string) {
  const unsubUrl = `${baseUrl}/notifications/preferences/${contactId}`;
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
