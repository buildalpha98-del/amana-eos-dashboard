/**
 * Notification and digest email templates.
 */

import { baseLayout, buttonHtml, BRAND_COLOR } from "./base";

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

// ─── Notification Digest Email ────────────────────────────────

export interface DigestNotification {
  type: string;
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  link: string;
}

interface DigestSection {
  label: string;
  icon: string;
  color: string;
  bg: string;
  link: string;
  items: DigestNotification[];
}

const DIGEST_TYPE_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string; link: string }> = {
  overdue_todo: { label: "Overdue To-Dos", icon: "&#9745;", color: "#dc2626", bg: "#fef2f2", link: "/todos" },
  overdue_rock: { label: "Off-Track Rocks", icon: "&#9968;", color: "#f59e0b", bg: "#fffbeb", link: "/rocks" },
  critical_issue: { label: "Critical Issues", icon: "&#9888;", color: "#dc2626", bg: "#fef2f2", link: "/issues" },
  sla_warning: { label: "SLA Warnings", icon: "&#9201;", color: "#dc2626", bg: "#fef2f2", link: "/tickets" },
  unassigned_ticket: { label: "Unassigned Tickets", icon: "&#9993;", color: "#6366f1", bg: "#eef2ff", link: "/tickets" },
  low_compliance: { label: "Compliance Alerts", icon: "&#9888;", color: "#f97316", bg: "#fff7ed", link: "/performance" },
  compliance_expiring: { label: "Expiring Certificates", icon: "&#128196;", color: "#f97316", bg: "#fff7ed", link: "/compliance" },
  new_todo_assigned: { label: "New Assignments", icon: "&#10004;", color: "#3b82f6", bg: "#eff6ff", link: "/todos" },
  new_issue_assigned: { label: "New Issues", icon: "&#128204;", color: "#3b82f6", bg: "#eff6ff", link: "/issues" },
  new_rock_assigned: { label: "New Rocks", icon: "&#127919;", color: "#3b82f6", bg: "#eff6ff", link: "/rocks" },
};

export function notificationDigestEmail(
  firstName: string,
  notifications: DigestNotification[],
  dashboardUrl: string
) {
  // Group notifications by type
  const grouped = new Map<string, DigestNotification[]>();
  for (const n of notifications) {
    const existing = grouped.get(n.type) || [];
    existing.push(n);
    grouped.set(n.type, existing);
  }

  // Build sections with config
  const sections: DigestSection[] = [];
  for (const [type, items] of grouped) {
    const config = DIGEST_TYPE_CONFIG[type] || {
      label: type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      icon: "&#128276;",
      color: "#6b7280",
      bg: "#f9fafb",
      link: "/dashboard",
    };
    sections.push({ ...config, items });
  }

  // Sort sections: critical items first (by max severity), then by count
  const severityRank: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  sections.sort((a, b) => {
    const aMax = Math.min(...a.items.map((i) => severityRank[i.severity] ?? 2));
    const bMax = Math.min(...b.items.map((i) => severityRank[i.severity] ?? 2));
    if (aMax !== bMax) return aMax - bMax;
    return b.items.length - a.items.length;
  });

  const totalCount = notifications.length;
  const criticalCount = notifications.filter((n) => n.severity === "critical").length;

  const subject = criticalCount > 0
    ? `Morning digest: ${criticalCount} critical + ${totalCount - criticalCount} more items — Amana OSHC`
    : `Morning digest: ${totalCount} item${totalCount !== 1 ? "s" : ""} need attention — Amana OSHC`;

  // Build summary bar
  const summaryHtml = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:14px 16px;background-color:#f9fafb;">
          <span style="font-size:14px;color:#374151;font-weight:600;">${totalCount} notification${totalCount !== 1 ? "s" : ""}</span>
          ${criticalCount > 0 ? `<span style="display:inline-block;margin-left:8px;padding:2px 8px;background-color:#fef2f2;color:#dc2626;font-size:11px;font-weight:600;border-radius:10px;">${criticalCount} CRITICAL</span>` : ""}
          <span style="display:inline-block;margin-left:8px;padding:2px 8px;background-color:#f0fdf4;color:#16a34a;font-size:11px;font-weight:600;border-radius:10px;">${sections.length} categor${sections.length !== 1 ? "ies" : "y"}</span>
        </td>
      </tr>
    </table>`;

  // Build each section
  const baseUrl = dashboardUrl.replace(/\/dashboard\/?$/, "");
  const sectionsHtml = sections
    .map((section) => {
      const topItems = section.items.slice(0, 5);
      const remaining = section.items.length - topItems.length;

      const itemRows = topItems
        .map((item) => {
          const sevDot =
            item.severity === "critical"
              ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background-color:#dc2626;margin-right:8px;vertical-align:middle;"></span>`
              : item.severity === "warning"
              ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background-color:#f59e0b;margin-right:8px;vertical-align:middle;"></span>`
              : `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background-color:#3b82f6;margin-right:8px;vertical-align:middle;"></span>`;

          return `<tr><td style="padding:8px 12px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;line-height:1.5;">${sevDot}${item.message}</td></tr>`;
        })
        .join("");

      const remainingRow =
        remaining > 0
          ? `<tr><td style="padding:8px 12px;font-size:12px;color:#6b7280;font-style:italic;">+ ${remaining} more</td></tr>`
          : "";

      const viewAllLink = `<tr><td style="padding:8px 12px;"><a href="${baseUrl}${section.link}" style="font-size:12px;font-weight:600;color:${BRAND_COLOR};text-decoration:none;">View All &rarr;</a></td></tr>`;

      return `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="padding:12px 12px 8px;background-color:${section.bg};">
            <span style="font-size:14px;font-weight:600;color:${section.color};">
              ${section.icon} ${section.label}
            </span>
            <span style="float:right;font-size:12px;font-weight:700;color:${section.color};background-color:rgba(255,255,255,0.7);padding:2px 8px;border-radius:10px;">
              ${section.items.length}
            </span>
          </td>
        </tr>
        ${itemRows}
        ${remainingRow}
        ${viewAllLink}
      </table>`;
    })
    .join("");

  const html = baseLayout(`
    <h2 style="margin:0 0 4px;color:#111827;font-size:18px;font-weight:600;">
      Good morning, ${firstName}!
    </h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px;line-height:1.6;">
      Here's your daily summary. These items need your attention:
    </p>
    ${summaryHtml}
    ${sectionsHtml}
    ${buttonHtml("Open Dashboard", dashboardUrl)}
    <p style="margin:16px 0 0;color:#9ca3af;font-size:11px;text-align:center;">
      You can manage digest preferences in Settings &gt; Notifications.
    </p>
  `);

  return { subject, html };
}
