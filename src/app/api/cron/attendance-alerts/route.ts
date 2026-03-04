import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getResend, FROM_EMAIL } from "@/lib/email";
import { notifyLowOccupancy } from "@/lib/teams-notify";

/**
 * GET /api/cron/attendance-alerts
 *
 * Daily cron (6 AM AEST) — checks yesterday's attendance for low occupancy
 * and missing data, then sends alerts.
 *
 * Thresholds:
 * - < 60% occupancy → in-app notification to service manager + admin
 * - < 40% occupancy → additionally email + Teams alert
 * - No data recorded → "missing data" notification to service manager
 *
 * Auth: Bearer CRON_SECRET
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const baseUrl = process.env.NEXTAUTH_URL || "https://dashboard.amanaoshc.com.au";

    // Yesterday's date
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setHours(23, 59, 59, 999);

    // Skip weekends
    const dayOfWeek = yesterday.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return NextResponse.json({ message: "Skipped — yesterday was a weekend", alerts: 0 });
    }

    // Get all active services
    const services = await prisma.service.findMany({
      where: { status: { in: ["active", "onboarding"] } },
      select: {
        id: true,
        name: true,
        code: true,
        capacity: true,
        managerId: true,
      },
    });

    // Get yesterday's attendance for all services
    const attendance = await prisma.dailyAttendance.findMany({
      where: {
        date: { gte: yesterday, lte: yesterdayEnd },
      },
    });

    // Build lookup: serviceId → records
    const byService = new Map<string, typeof attendance>();
    for (const rec of attendance) {
      if (!byService.has(rec.serviceId)) byService.set(rec.serviceId, []);
      byService.get(rec.serviceId)!.push(rec);
    }

    const resend = getResend();
    let lowOccupancyAlerts = 0;
    let missingDataAlerts = 0;
    let emailsSent = 0;

    for (const service of services) {
      const records = byService.get(service.id);

      if (!records || records.length === 0) {
        // No data recorded — alert service manager
        missingDataAlerts++;
        continue;
      }

      // Check each session type
      for (const rec of records) {
        if (rec.sessionType === "vc") continue; // Skip vacation care

        const occupancy = rec.capacity > 0 ? (rec.attended / rec.capacity) * 100 : 0;

        if (occupancy < 60) {
          lowOccupancyAlerts++;

          // Send Teams alert for critically low occupancy
          if (occupancy < 40) {
            notifyLowOccupancy({
              service: service.name,
              sessionType: rec.sessionType.toUpperCase(),
              occupancyPct: Math.round(occupancy),
              date: yesterday.toLocaleDateString("en-AU"),
              url: `${baseUrl}/services/${service.id}`,
            }).catch(() => {});

            // Email service manager
            if (resend && service.managerId) {
              const manager = await prisma.user.findUnique({
                where: { id: service.managerId },
                select: { name: true, email: true },
              });

              if (manager) {
                try {
                  await resend.emails.send({
                    from: FROM_EMAIL,
                    to: manager.email,
                    subject: `Low Occupancy Alert: ${service.name} ${rec.sessionType.toUpperCase()} at ${Math.round(occupancy)}%`,
                    html: buildLowOccupancyEmailHtml({
                      managerName: manager.name,
                      serviceName: service.name,
                      sessionType: rec.sessionType.toUpperCase(),
                      occupancy: Math.round(occupancy),
                      attended: rec.attended,
                      capacity: rec.capacity,
                      date: yesterday.toLocaleDateString("en-AU"),
                      url: `${baseUrl}/services/${service.id}`,
                    }),
                  });
                  emailsSent++;
                } catch {
                  // Non-critical — log and continue
                }
              }
            }
          }
        }
      }
    }

    return NextResponse.json({
      message: "Attendance alerts processed",
      date: yesterday.toISOString().split("T")[0],
      servicesChecked: services.length,
      lowOccupancyAlerts,
      missingDataAlerts,
      emailsSent,
    });
  } catch (err) {
    console.error("Attendance alerts cron failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 }
    );
  }
}

function buildLowOccupancyEmailHtml(data: {
  managerName: string;
  serviceName: string;
  sessionType: string;
  occupancy: number;
  attended: number;
  capacity: number;
  date: string;
  url: string;
}): string {
  const color = data.occupancy < 40 ? "#dc2626" : "#f59e0b";
  return `
<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#f4f4f5;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <tr><td style="background:#004E64;padding:24px 32px;text-align:center;">
        <h1 style="margin:0;color:#fff;font-size:20px;">Amana OSHC</h1>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.6);font-size:11px;text-transform:uppercase;letter-spacing:1.5px;">Low Occupancy Alert</p>
      </td></tr>
      <tr><td style="padding:32px;">
        <p style="margin:0 0 16px;color:#6b7280;font-size:14px;">Hi ${data.managerName},</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <tr><td style="padding:16px;background:#fef2f2;text-align:center;">
            <div style="font-size:36px;font-weight:700;color:${color};">${data.occupancy}%</div>
            <div style="font-size:13px;color:${color};margin-top:4px;">${data.sessionType} Occupancy</div>
          </td></tr>
          <tr><td style="padding:12px 16px;">
            <p style="margin:0;color:#374151;font-size:14px;">
              <strong>${data.serviceName}</strong> — ${data.date}<br/>
              ${data.attended} of ${data.capacity} places filled
            </p>
          </td></tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
          <tr><td align="center">
            <a href="${data.url}" style="display:inline-block;padding:12px 32px;background:#004E64;color:#fff;text-decoration:none;font-size:14px;font-weight:600;border-radius:8px;">View Service</a>
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
}
