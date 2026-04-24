/**
 * Report and operational email templates.
 */

import { baseLayout, buttonHtml, BRAND_COLOR } from "./base";

// ─── Weekly Report ──────────────────────────────────────────

export interface WeeklyReportData {
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

// ─── Weekly Marketing Report (Sprint 2 — Marketing Cockpit) ──

export interface WeeklyMarketingReportEmailData {
  weekStart: string;
  weekEnd: string;
  akramName: string;
  wins?: string | null;
  blockers?: string | null;
  nextWeekTop3?: string | null;
  bodyHtml: string;
  dashboardUrl: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function section(title: string, body: string | null | undefined): string {
  const trimmed = (body ?? "").trim();
  if (!trimmed) return "";
  const safe = escapeHtml(trimmed).replace(/\n/g, "<br/>");
  return `
    <h3 style="margin:24px 0 8px;color:#111827;font-size:15px;font-weight:600;">${title}</h3>
    <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">${safe}</p>
  `;
}

export function weeklyMarketingReportEmail(
  recipientName: string,
  data: WeeklyMarketingReportEmailData,
) {
  const subject = `Weekly Marketing Report — ${data.weekStart} to ${data.weekEnd}`;

  const html = baseLayout(`
    <h2 style="margin:0 0 8px;color:${BRAND_COLOR};font-size:20px;font-weight:700;">
      Weekly Marketing Report
    </h2>
    <p style="margin:0 0 4px;color:#6b7280;font-size:13px;">
      ${escapeHtml(data.weekStart)} &rarr; ${escapeHtml(data.weekEnd)}
    </p>
    <p style="margin:0 0 20px;color:#6b7280;font-size:13px;">
      Prepared by ${escapeHtml(data.akramName)}
    </p>

    <p style="margin:0 0 12px;color:#374151;font-size:14px;line-height:1.6;">
      Hi ${escapeHtml(recipientName)}, here's this week's marketing summary across all centres.
    </p>

    ${section("Wins", data.wins)}
    ${section("Blockers", data.blockers)}
    ${section("Next Week's Top 3", data.nextWeekTop3)}

    <h3 style="margin:24px 0 8px;color:#111827;font-size:15px;font-weight:600;">Full Report</h3>
    <div style="color:#374151;font-size:14px;line-height:1.6;">
      ${data.bodyHtml}
    </div>

    <div style="margin-top:24px;">
      ${buttonHtml("Open Cockpit", data.dashboardUrl)}
    </div>
  `);

  return { subject, html };
}
