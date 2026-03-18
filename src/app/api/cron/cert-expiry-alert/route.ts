import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { acquireCronLock } from "@/lib/cron-guard";

const BRAND_COLOR = "#004E64";
const ACCENT_COLOR = "#FECE00";
const DASHBOARD_URL =
  process.env.NEXTAUTH_URL || "https://dashboard.amanaoshc.com.au";

interface CertRow {
  staffName: string;
  certType: string;
  label: string | null;
  expiryDate: Date;
  daysRemaining: number;
  urgency: "expired" | "critical" | "warning" | "upcoming";
}

/**
 * GET /api/cron/cert-expiry-alert
 *
 * Weekly cron (Monday) — sends a clean certificate expiry summary grouped
 * by service. Service managers receive their centre's expiring certs,
 * and admins receive a network-wide overview.
 *
 * Separate from the daily compliance-alerts cron which is coupled with
 * audit escalation. This provides a focused weekly certificate view.
 *
 * Auth: Bearer CRON_SECRET
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const guard = await acquireCronLock("cert-expiry-alert", "weekly");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const now = new Date();
    const in30days = new Date(now.getTime() + 30 * 86400000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

    // ── 1. Find certs expiring in next 30 days ─────────────
    const expiringCerts = await prisma.complianceCertificate.findMany({
      where: {
        expiryDate: { gte: now, lte: in30days },
      },
      include: {
        user: { select: { id: true, name: true, email: true, active: true } },
        service: { select: { id: true, name: true, code: true, managerId: true } },
      },
      orderBy: { expiryDate: "asc" },
    });

    // ── 2. Find already-expired (within last 30 days) ──────
    const expiredCerts = await prisma.complianceCertificate.findMany({
      where: {
        expiryDate: { lt: now, gte: thirtyDaysAgo },
      },
      include: {
        user: { select: { id: true, name: true, email: true, active: true } },
        service: { select: { id: true, name: true, code: true, managerId: true } },
      },
      orderBy: { expiryDate: "asc" },
    });

    const allCerts = [...expiredCerts, ...expiringCerts];

    if (allCerts.length === 0) {
      await guard.complete({ total: 0, emailsSent: 0 });
      return NextResponse.json({
        message: "No expiring or recently expired certificates",
        total: 0,
        emailsSent: 0,
      });
    }

    // ── 3. Classify and group by service ────────────────────
    const in7days = new Date(now.getTime() + 7 * 86400000);
    const in14days = new Date(now.getTime() + 14 * 86400000);

    const byServiceId = new Map<
      string,
      {
        serviceName: string;
        serviceCode: string;
        managerId: string | null;
        certs: CertRow[];
      }
    >();

    let expiredCount = 0;
    let criticalCount = 0;
    let warningCount = 0;
    let upcomingCount = 0;

    for (const cert of allCerts) {
      if (!cert.user || !cert.user.active) continue;

      const expiry = new Date(cert.expiryDate);
      const daysRemaining = Math.ceil(
        (expiry.getTime() - now.getTime()) / 86400000,
      );

      let urgency: CertRow["urgency"];
      if (expiry < now) {
        urgency = "expired";
        expiredCount++;
      } else if (expiry <= in7days) {
        urgency = "critical";
        criticalCount++;
      } else if (expiry <= in14days) {
        urgency = "warning";
        warningCount++;
      } else {
        urgency = "upcoming";
        upcomingCount++;
      }

      const serviceId = cert.service?.id || "unknown";
      if (!byServiceId.has(serviceId)) {
        byServiceId.set(serviceId, {
          serviceName: cert.service?.name || "Unknown",
          serviceCode: cert.service?.code || "",
          managerId: cert.service?.managerId || null,
          certs: [],
        });
      }

      byServiceId.get(serviceId)!.certs.push({
        staffName: cert.user.name,
        certType: cert.type.replace(/_/g, " ").toUpperCase(),
        label: cert.label,
        expiryDate: cert.expiryDate,
        daysRemaining,
        urgency,
      });
    }

    // ── 4. Build cert table HTML helper ─────────────────────
    function buildCertTable(certs: CertRow[]): string {
      const rows = certs
        .sort((a, b) => a.daysRemaining - b.daysRemaining)
        .map((c) => {
          const urgencyColors: Record<string, { bg: string; text: string }> = {
            expired: { bg: "#fef2f2", text: "#dc2626" },
            critical: { bg: "#fff7ed", text: "#ea580c" },
            warning: { bg: "#fefce8", text: "#ca8a04" },
            upcoming: { bg: "#f9fafb", text: "#6b7280" },
          };
          const colors = urgencyColors[c.urgency];
          const dateStr = c.expiryDate.toLocaleDateString("en-AU", {
            day: "numeric",
            month: "short",
            year: "numeric",
          });
          const daysLabel =
            c.urgency === "expired"
              ? `${Math.abs(c.daysRemaining)}d overdue`
              : `${c.daysRemaining}d left`;

          return `<tr style="background:${colors.bg};">
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;">${c.staffName}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;">${c.label || c.certType}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;">${dateStr}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:600;color:${colors.text};">${daysLabel}</td>
          </tr>`;
        })
        .join("");

      return `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="padding:8px 12px;background:#f9fafb;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Staff</td>
          <td style="padding:8px 12px;background:#f9fafb;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Certificate</td>
          <td style="padding:8px 12px;background:#f9fafb;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Expiry</td>
          <td style="padding:8px 12px;background:#f9fafb;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Status</td>
        </tr>
        ${rows}
      </table>`;
    }

    // ── 5. Send per-service manager emails ──────────────────
    let emailsSent = 0;
    const errors: string[] = [];

    for (const [serviceId, data] of byServiceId) {
      if (!data.managerId) continue;

      const manager = await prisma.user.findUnique({
        where: { id: data.managerId },
        select: { name: true, email: true, active: true },
      });
      if (!manager || !manager.active) continue;

      try {
        const firstName = manager.name.split(" ")[0];
        const expiredInService = data.certs.filter(
          (c) => c.urgency === "expired",
        ).length;
        const criticalInService = data.certs.filter(
          (c) => c.urgency === "critical",
        ).length;

        const urgentBanner =
          expiredInService > 0 || criticalInService > 0
            ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-radius:8px;overflow:hidden;">
                <tr><td style="padding:12px 16px;background:#fef2f2;border-left:4px solid #dc2626;">
                  <p style="margin:0;color:#dc2626;font-size:14px;font-weight:600;">${expiredInService} expired, ${criticalInService} expiring within 7 days</p>
                </td></tr>
              </table>`
            : "";

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#f4f4f5;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <tr><td style="background:${BRAND_COLOR};padding:24px 32px;text-align:center;">
        <h1 style="margin:0;color:#fff;font-size:20px;">Amana OSHC</h1>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.6);font-size:11px;text-transform:uppercase;letter-spacing:1.5px;">Certificate Expiry Alert</p>
      </td></tr>
      <tr><td style="padding:32px;">
        <p style="margin:0 0 8px;color:#6b7280;font-size:14px;">Hi ${firstName},</p>
        <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">The following certificates at <strong>${data.serviceName}</strong> are expiring or have recently expired. Please follow up with staff to arrange renewals.</p>

        ${urgentBanner}
        ${buildCertTable(data.certs)}

        <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
          <tr><td align="center">
            <a href="${DASHBOARD_URL}/services/${serviceId}" style="display:inline-block;padding:12px 32px;background:${BRAND_COLOR};color:#fff;text-decoration:none;font-size:14px;font-weight:600;border-radius:8px;">View Service</a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:16px 32px 24px;border-top:1px solid #e5e7eb;">
        <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">Automated alert from Amana OSHC Dashboard</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

        await sendEmail({
          to: manager.email,
          subject: `Certificate Expiry: ${data.certs.length} cert${data.certs.length === 1 ? "" : "s"} at ${data.serviceName}${expiredInService > 0 ? " — Action Required" : ""}`,
          html,
        });
        emailsSent++;
      } catch (err) {
        errors.push(
          `Failed manager ${data.serviceName}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // ── 6. Send admin summary ───────────────────────────────
    const admins = await prisma.user.findMany({
      where: {
        role: { in: ["owner", "admin", "head_office"] },
        active: true,
      },
      select: { name: true, email: true },
    });

    // Build per-service summary rows
    const serviceSummaryRows = Array.from(byServiceId.values())
      .sort((a, b) => {
        const aExpired = a.certs.filter((c) => c.urgency === "expired").length;
        const bExpired = b.certs.filter((c) => c.urgency === "expired").length;
        return bExpired - aExpired || b.certs.length - a.certs.length;
      })
      .map((s) => {
        const exp = s.certs.filter((c) => c.urgency === "expired").length;
        const crit = s.certs.filter((c) => c.urgency === "critical").length;
        const warn = s.certs.filter(
          (c) => c.urgency === "warning" || c.urgency === "upcoming",
        ).length;
        return `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;">${s.serviceName}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:600;color:#dc2626;text-align:center;">${exp}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:600;color:#ea580c;text-align:center;">${crit}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;text-align:center;">${warn}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:600;color:#374151;text-align:center;">${s.certs.length}</td>
        </tr>`;
      })
      .join("");

    for (const admin of admins) {
      try {
        const firstName = admin.name.split(" ")[0];
        const adminHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#f4f4f5;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <tr><td style="background:${BRAND_COLOR};padding:24px 32px;text-align:center;">
        <h1 style="margin:0;color:#fff;font-size:20px;">Amana OSHC</h1>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.6);font-size:11px;text-transform:uppercase;letter-spacing:1.5px;">Weekly Certificate Expiry Summary</p>
      </td></tr>
      <tr><td style="padding:32px;">
        <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">Hi ${firstName}, here is the network-wide certificate expiry overview.</p>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
          <tr>
            <td style="padding:12px 8px;background:#dc2626;border-radius:8px 0 0 8px;text-align:center;width:25%;">
              <div style="font-size:24px;font-weight:700;color:#fff;">${expiredCount}</div>
              <div style="font-size:11px;color:rgba(255,255,255,0.8);margin-top:2px;">Expired</div>
            </td>
            <td style="padding:12px 8px;background:#ea580c;text-align:center;width:25%;">
              <div style="font-size:24px;font-weight:700;color:#fff;">${criticalCount}</div>
              <div style="font-size:11px;color:rgba(255,255,255,0.8);margin-top:2px;">&lt;7 days</div>
            </td>
            <td style="padding:12px 8px;background:#ca8a04;text-align:center;width:25%;">
              <div style="font-size:24px;font-weight:700;color:#fff;">${warningCount}</div>
              <div style="font-size:11px;color:rgba(255,255,255,0.8);margin-top:2px;">&lt;14 days</div>
            </td>
            <td style="padding:12px 8px;background:#6b7280;border-radius:0 8px 8px 0;text-align:center;width:25%;">
              <div style="font-size:24px;font-weight:700;color:#fff;">${upcomingCount}</div>
              <div style="font-size:11px;color:rgba(255,255,255,0.8);margin-top:2px;">&lt;30 days</div>
            </td>
          </tr>
        </table>

        <h3 style="margin:0 0 8px;font-size:15px;color:${BRAND_COLOR};">By Service</h3>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:8px 12px;background:#f9fafb;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Service</td>
            <td style="padding:8px 12px;background:#f9fafb;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;text-align:center;">Expired</td>
            <td style="padding:8px 12px;background:#f9fafb;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;text-align:center;">&lt;7d</td>
            <td style="padding:8px 12px;background:#f9fafb;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;text-align:center;">&lt;30d</td>
            <td style="padding:8px 12px;background:#f9fafb;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;text-align:center;">Total</td>
          </tr>
          ${serviceSummaryRows}
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
          <tr><td align="center">
            <a href="${DASHBOARD_URL}/dashboard" style="display:inline-block;padding:12px 32px;background:${BRAND_COLOR};color:#fff;text-decoration:none;font-size:14px;font-weight:600;border-radius:8px;">View Dashboard</a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:16px 32px 24px;border-top:1px solid #e5e7eb;">
        <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">Automated alert from Amana OSHC Dashboard</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

        await sendEmail({
          to: admin.email,
          subject: `Certificate Expiry Summary: ${allCerts.length} cert${allCerts.length === 1 ? "" : "s"} across network${expiredCount > 0 ? ` — ${expiredCount} expired` : ""}`,
          html: adminHtml,
        });
        emailsSent++;
      } catch (err) {
        errors.push(
          `Failed admin ${admin.email}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    await guard.complete({
      total: allCerts.length,
      expired: expiredCount,
      critical: criticalCount,
      warning: warningCount,
      upcoming: upcomingCount,
      servicesAffected: byServiceId.size,
      emailsSent,
    });

    return NextResponse.json({
      message: "Certificate expiry alerts sent",
      total: allCerts.length,
      expired: expiredCount,
      critical: criticalCount,
      warning: warningCount,
      upcoming: upcomingCount,
      servicesAffected: byServiceId.size,
      emailsSent,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    await guard.fail(err);
    console.error("[Cron: cert-expiry-alert]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 },
    );
  }
}
