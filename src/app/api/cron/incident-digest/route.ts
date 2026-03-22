import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { acquireCronLock } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

const BRAND_COLOR = "#004E64";
const ACCENT_COLOR = "#FECE00";
const DASHBOARD_URL =
  process.env.NEXTAUTH_URL || "https://dashboard.amanaoshc.com.au";

/**
 * GET /api/cron/incident-digest
 *
 * Weekly cron (Friday) — sends a digest of incidents from the past 7 days
 * to all owner/admin/head_office users.
 *
 * Auth: Bearer CRON_SECRET
 */
export const GET = withApiHandler(async (req) => {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const guard = await acquireCronLock("incident-digest", "weekly");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);

    // ── 1. Query incidents from last 7 days ─────────────────
    const incidents = await prisma.incidentRecord.findMany({
      where: {
        incidentDate: { gte: sevenDaysAgo },
        deleted: false,
      },
      include: {
        service: {
          select: { id: true, name: true, code: true, managerId: true },
        },
      },
      orderBy: { incidentDate: "desc" },
    });

    if (incidents.length === 0) {
      await guard.complete({ total: 0, emailsSent: 0 });
      return NextResponse.json({
        message: "No incidents in the last 7 days",
        total: 0,
        emailsSent: 0,
      });
    }

    // ── 2. Aggregate stats ──────────────────────────────────
    const bySeverity: Record<string, number> = {
      minor: 0,
      moderate: 0,
      reportable: 0,
      serious: 0,
    };
    const byType: Record<string, number> = {};
    const byService: Record<string, { count: number; name: string }> = {};
    const pendingFollowUps: typeof incidents = [];

    for (const inc of incidents) {
      // Severity
      const sev = inc.severity?.toLowerCase() || "minor";
      bySeverity[sev] = (bySeverity[sev] || 0) + 1;

      // Type
      const t = inc.incidentType || "Other";
      byType[t] = (byType[t] || 0) + 1;

      // Service
      const svcName = inc.service?.name || "Unknown";
      if (!byService[svcName]) byService[svcName] = { count: 0, name: svcName };
      byService[svcName].count++;

      // Follow-up flags
      if (inc.followUpRequired && !inc.followUpCompleted) {
        pendingFollowUps.push(inc);
      }
    }

    // Top services by incident count
    const topServices = Object.values(byService)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Top types
    const topTypes = Object.entries(byType)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const hasReportable =
      (bySeverity.reportable || 0) + (bySeverity.serious || 0) > 0;

    // ── 3. Build HTML email ─────────────────────────────────
    const fromStr = sevenDaysAgo.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
    });
    const toStr = now.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    function buildDigestHtml(recipientName: string): string {
      const severityRows = Object.entries(bySeverity)
        .filter(([, v]) => v > 0)
        .map(([sev, count]) => {
          const colors: Record<string, string> = {
            serious: "#dc2626",
            reportable: "#ea580c",
            moderate: "#f59e0b",
            minor: "#6b7280",
          };
          const c = colors[sev] || "#6b7280";
          return `<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;text-transform:capitalize;">${sev}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;font-weight:600;color:${c};text-align:right;">${count}</td>
          </tr>`;
        })
        .join("");

      const typeRows = topTypes
        .map(
          ([type, count]) => `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;">${type}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;font-weight:600;color:#374151;text-align:right;">${count}</td>
        </tr>`,
        )
        .join("");

      const serviceRows = topServices
        .map(
          (s) => `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;">${s.name}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;font-weight:600;color:#374151;text-align:right;">${s.count}</td>
        </tr>`,
        )
        .join("");

      const alertBanner = hasReportable
        ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-radius:8px;overflow:hidden;">
            <tr><td style="padding:12px 16px;background:#fef2f2;border-left:4px solid #dc2626;">
              <p style="margin:0;color:#dc2626;font-size:14px;font-weight:600;">Attention: ${bySeverity.reportable || 0} reportable and ${bySeverity.serious || 0} serious incident(s) this week</p>
            </td></tr>
          </table>`
        : "";

      const followUpSection =
        pendingFollowUps.length > 0
          ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;border-radius:8px;overflow:hidden;">
              <tr><td style="padding:12px 16px;background:#fef9c3;border-left:4px solid #f59e0b;">
                <p style="margin:0;color:#92400e;font-size:14px;font-weight:600;">${pendingFollowUps.length} incident(s) require follow-up</p>
                <p style="margin:4px 0 0;color:#92400e;font-size:13px;">These incidents have been flagged for follow-up but are not yet completed.</p>
              </td></tr>
            </table>`
          : "";

      return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#f4f4f5;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <tr><td style="background:${BRAND_COLOR};padding:24px 32px;text-align:center;">
        <h1 style="margin:0;color:#fff;font-size:20px;">Amana OSHC</h1>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.6);font-size:11px;text-transform:uppercase;letter-spacing:1.5px;">Weekly Incident Digest</p>
      </td></tr>
      <tr><td style="padding:32px;">
        <p style="margin:0 0 8px;color:#6b7280;font-size:14px;">Hi ${recipientName},</p>
        <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">Here is your incident summary for <strong>${fromStr} — ${toStr}</strong>.</p>

        ${alertBanner}

        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
          <tr><td style="padding:16px;background:${BRAND_COLOR};border-radius:8px;text-align:center;">
            <div style="font-size:36px;font-weight:700;color:${ACCENT_COLOR};">${incidents.length}</div>
            <div style="font-size:13px;color:rgba(255,255,255,0.8);margin-top:4px;">Total Incidents</div>
          </td></tr>
        </table>

        <h3 style="margin:24px 0 8px;font-size:15px;color:${BRAND_COLOR};">By Severity</h3>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          ${severityRows}
        </table>

        <h3 style="margin:24px 0 8px;font-size:15px;color:${BRAND_COLOR};">By Type</h3>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          ${typeRows}
        </table>

        <h3 style="margin:24px 0 8px;font-size:15px;color:${BRAND_COLOR};">Top Services</h3>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          ${serviceRows}
        </table>

        ${followUpSection}

        <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
          <tr><td align="center">
            <a href="${DASHBOARD_URL}/incidents" style="display:inline-block;padding:12px 32px;background:${BRAND_COLOR};color:#fff;text-decoration:none;font-size:14px;font-weight:600;border-radius:8px;">View All Incidents</a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:16px 32px 24px;border-top:1px solid #e5e7eb;">
        <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">Automated digest from Amana OSHC Dashboard</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
    }

    // ── 4. Send to owner/admin/head_office users ────────────
    const recipients = await prisma.user.findMany({
      where: {
        role: { in: ["owner", "admin", "head_office"] },
        active: true,
      },
      select: { name: true, email: true },
    });

    let emailsSent = 0;
    const errors: string[] = [];

    for (const user of recipients) {
      try {
        const firstName = user.name.split(" ")[0];
        await sendEmail({
          to: user.email,
          subject: `Incident Digest: ${incidents.length} incident${incidents.length === 1 ? "" : "s"} this week${hasReportable ? " — Action Required" : ""}`,
          html: buildDigestHtml(firstName),
        });
        emailsSent++;
      } catch (err) {
        errors.push(
          `Failed ${user.email}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    await guard.complete({
      total: incidents.length,
      bySeverity,
      pendingFollowUps: pendingFollowUps.length,
      emailsSent,
    });

    return NextResponse.json({
      message: "Incident digest sent",
      total: incidents.length,
      bySeverity,
      pendingFollowUps: pendingFollowUps.length,
      emailsSent,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    await guard.fail(err);
    logger.error("Cron: incident-digest", { err });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 },
    );
  }
});
