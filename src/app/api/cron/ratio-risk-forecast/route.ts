import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { acquireCronLock } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";

const BRAND_COLOR = "#004E64";
const ACCENT_COLOR = "#FECE00";
const DASHBOARD_URL =
  process.env.NEXTAUTH_URL || "https://dashboard.amanaoshc.com.au";

/** OSHC regulatory ratio: 1 educator per 15 school-age children */
const RATIO_WARNING = 13;
const RATIO_CRITICAL = 15;

interface FlaggedService {
  serviceName: string;
  serviceCode: string;
  sessionType: string;
  totalChildren: number;
  staffCount: number;
  ratio: number;
  capacity: number | null;
  overCapacity: boolean;
  severity: "warning" | "critical";
}

function buildManagerEmail(
  managerName: string,
  flags: FlaggedService[],
  dateLabel: string,
): { subject: string; html: string } {
  const hasCritical = flags.some((f) => f.severity === "critical");
  const subject = hasCritical
    ? `CRITICAL: Ratio risk for ${dateLabel}`
    : `Warning: Ratio risk forecast for ${dateLabel}`;

  const rows = flags
    .map((f) => {
      const color = f.severity === "critical" ? "#dc2626" : "#f59e0b";
      const capWarning = f.overCapacity
        ? `<br/><span style="color:#dc2626;font-weight:600;">Over capacity (${f.totalChildren}/${f.capacity})</span>`
        : "";
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${f.serviceName} (${f.serviceCode})</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${f.sessionType.toUpperCase()}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${f.totalChildren}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${f.staffCount}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">
            <span style="color:${color};font-weight:600;">1:${f.ratio.toFixed(1)}</span>
            ${capWarning}
          </td>
        </tr>`;
    })
    .join("");

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:${BRAND_COLOR};padding:24px;text-align:center;">
        <h1 style="color:#ffffff;margin:0;font-size:20px;">Amana OSHC</h1>
      </div>
      <div style="padding:24px;background:#ffffff;">
        <p style="margin:0 0 16px;">Hi ${managerName},</p>
        <p style="margin:0 0 16px;">The following services have <strong>ratio risks</strong> forecasted for <strong>${dateLabel}</strong>:</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead>
            <tr style="background:${BRAND_COLOR};color:#ffffff;">
              <th style="padding:8px 12px;text-align:left;">Service</th>
              <th style="padding:8px 12px;text-align:left;">Session</th>
              <th style="padding:8px 12px;text-align:left;">Children</th>
              <th style="padding:8px 12px;text-align:left;">Staff</th>
              <th style="padding:8px 12px;text-align:left;">Ratio</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="margin:16px 0;">Please arrange additional staff or manage bookings to maintain safe ratios.</p>
        <div style="text-align:center;margin:24px 0;">
          <a href="${DASHBOARD_URL}/services" style="display:inline-block;padding:12px 24px;background:${ACCENT_COLOR};color:${BRAND_COLOR};font-weight:600;text-decoration:none;border-radius:6px;">View Services Dashboard</a>
        </div>
      </div>
      <div style="background:#f3f4f6;padding:16px;text-align:center;font-size:12px;color:#6b7280;">
        Amana OSHC &mdash; Ratio Risk Forecast
      </div>
    </div>`;

  return { subject, html };
}

function buildAdminSummaryEmail(
  allFlags: FlaggedService[],
  dateLabel: string,
  totalServices: number,
): { subject: string; html: string } {
  const criticalCount = allFlags.filter((f) => f.severity === "critical").length;
  const warningCount = allFlags.filter((f) => f.severity === "warning").length;
  const overCapCount = allFlags.filter((f) => f.overCapacity).length;

  const subject = criticalCount > 0
    ? `[Admin] ${criticalCount} critical ratio risks for ${dateLabel}`
    : `[Admin] Ratio risk forecast for ${dateLabel}`;

  const rows = allFlags
    .map((f) => {
      const color = f.severity === "critical" ? "#dc2626" : "#f59e0b";
      return `
        <tr>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;">${f.serviceName}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;">${f.sessionType.toUpperCase()}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;">${f.totalChildren}/${f.staffCount}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;">
            <span style="color:${color};font-weight:600;">1:${f.ratio.toFixed(1)}</span>
          </td>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;">${f.overCapacity ? "YES" : "-"}</td>
        </tr>`;
    })
    .join("");

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:${BRAND_COLOR};padding:24px;text-align:center;">
        <h1 style="color:#ffffff;margin:0;font-size:20px;">Amana OSHC &mdash; Admin Summary</h1>
      </div>
      <div style="padding:24px;background:#ffffff;">
        <h2 style="margin:0 0 16px;font-size:18px;">Ratio Risk Forecast &mdash; ${dateLabel}</h2>
        <div style="display:flex;gap:12px;margin-bottom:20px;">
          <div style="flex:1;padding:12px;background:#fef2f2;border-radius:8px;text-align:center;">
            <div style="font-size:24px;font-weight:700;color:#dc2626;">${criticalCount}</div>
            <div style="font-size:12px;color:#6b7280;">Critical</div>
          </div>
          <div style="flex:1;padding:12px;background:#fffbeb;border-radius:8px;text-align:center;">
            <div style="font-size:24px;font-weight:700;color:#f59e0b;">${warningCount}</div>
            <div style="font-size:12px;color:#6b7280;">Warning</div>
          </div>
          <div style="flex:1;padding:12px;background:#f0fdf4;border-radius:8px;text-align:center;">
            <div style="font-size:24px;font-weight:700;color:#16a34a;">${totalServices - allFlags.length}</div>
            <div style="font-size:12px;color:#6b7280;">Safe</div>
          </div>
        </div>
        ${overCapCount > 0 ? `<p style="color:#dc2626;font-weight:600;margin:0 0 12px;">${overCapCount} service(s) over capacity</p>` : ""}
        ${allFlags.length > 0 ? `
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:${BRAND_COLOR};color:#ffffff;">
              <th style="padding:6px 10px;text-align:left;">Service</th>
              <th style="padding:6px 10px;text-align:left;">Session</th>
              <th style="padding:6px 10px;text-align:left;">Kids/Staff</th>
              <th style="padding:6px 10px;text-align:left;">Ratio</th>
              <th style="padding:6px 10px;text-align:left;">Over Cap</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>` : `<p style="color:#16a34a;font-weight:600;">All services within safe ratios.</p>`}
        <div style="text-align:center;margin:24px 0;">
          <a href="${DASHBOARD_URL}/services" style="display:inline-block;padding:12px 24px;background:${ACCENT_COLOR};color:${BRAND_COLOR};font-weight:600;text-decoration:none;border-radius:6px;">View Services Dashboard</a>
        </div>
      </div>
      <div style="background:#f3f4f6;padding:16px;text-align:center;font-size:12px;color:#6b7280;">
        Amana OSHC &mdash; Ratio Risk Forecast (Admin)
      </div>
    </div>`;

  return { subject, html };
}

/**
 * GET /api/cron/ratio-risk-forecast
 *
 * Daily cron (5 AM AEST / 19:00 UTC previous day) — forecasts
 * staff-to-child ratios for tomorrow and alerts managers of
 * warning (>1:13) or critical (>1:15) risks plus over-capacity.
 *
 * Auth: Bearer CRON_SECRET
 */
export const GET = withApiHandler(async (req) => {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const guard = await acquireCronLock("ratio-risk-forecast", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  // Tomorrow's date (start of day UTC)
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const tomorrowEnd = new Date(tomorrow);
  tomorrowEnd.setHours(23, 59, 59, 999);

  const dateLabel = tomorrow.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Get all active services
  const services = await prisma.service.findMany({
    where: { status: "active" },
    include: {
      manager: { select: { id: true, name: true, email: true, active: true } },
    },
  });

  const allFlags: FlaggedService[] = [];

  for (const service of services) {
    // Get tomorrow's attendance records (all session types)
    const attendance = await prisma.dailyAttendance.findMany({
      where: {
        serviceId: service.id,
        date: { gte: tomorrow, lte: tomorrowEnd },
      },
    });

    // Get tomorrow's roster shifts
    const shifts = await prisma.rosterShift.findMany({
      where: {
        serviceId: service.id,
        date: { gte: tomorrow, lte: tomorrowEnd },
      },
    });

    // Group by session type
    const sessionTypes = new Set([
      ...attendance.map((a) => a.sessionType),
      ...shifts.map((s) => s.sessionType),
    ]);

    for (const sessionType of sessionTypes) {
      const sessionAttendance = attendance.filter(
        (a) => a.sessionType === sessionType,
      );
      const sessionShifts = shifts.filter(
        (s) => s.sessionType === sessionType,
      );

      const totalChildren = sessionAttendance.reduce(
        (sum, a) => sum + a.enrolled + a.casual,
        0,
      );
      const staffCount = sessionShifts.length;

      if (totalChildren === 0) continue;

      const ratio = staffCount > 0 ? totalChildren / staffCount : totalChildren;
      const overCapacity =
        service.capacity != null && totalChildren > service.capacity;

      if (ratio > RATIO_WARNING || overCapacity) {
        allFlags.push({
          serviceName: service.name,
          serviceCode: service.code,
          sessionType,
          totalChildren,
          staffCount,
          ratio,
          capacity: service.capacity,
          overCapacity,
          severity: ratio > RATIO_CRITICAL ? "critical" : "warning",
        });
      }
    }
  }

  let emailsSent = 0;
  const errors: string[] = [];

  if (allFlags.length > 0) {
    // Group flags by manager and send per-manager emails
    const byManager = new Map<
      string,
      { name: string; email: string; flags: FlaggedService[] }
    >();

    for (const flag of allFlags) {
      const service = services.find((s) => s.code === flag.serviceCode);
      if (!service?.manager || !service.manager.active) continue;

      const mgr = service.manager;
      if (!byManager.has(mgr.id)) {
        byManager.set(mgr.id, { name: mgr.name, email: mgr.email, flags: [] });
      }
      byManager.get(mgr.id)!.flags.push(flag);
    }

    for (const [, mgr] of byManager) {
      try {
        const { subject, html } = buildManagerEmail(
          mgr.name,
          mgr.flags,
          dateLabel,
        );
        await sendEmail({ to: mgr.email, subject, html });
        emailsSent++;
      } catch (err) {
        errors.push(
          `Failed to email manager ${mgr.email}: ${err instanceof Error ? err.message : "Unknown"}`,
        );
      }
    }

    // Admin summary
    const admins = await prisma.user.findMany({
      where: { role: { in: ["owner", "admin"] }, active: true },
      select: { email: true },
    });

    const { subject, html } = buildAdminSummaryEmail(
      allFlags,
      dateLabel,
      services.length,
    );

    for (const admin of admins) {
      try {
        await sendEmail({ to: admin.email, subject, html });
        emailsSent++;
      } catch (err) {
        errors.push(
          `Failed admin email ${admin.email}: ${err instanceof Error ? err.message : "Unknown"}`,
        );
      }
    }
  }

  await guard.complete({
    totalServices: services.length,
    flagged: allFlags.length,
    emailsSent,
  });

  return NextResponse.json({
    message: "Ratio risk forecast processed",
    date: dateLabel,
    totalServices: services.length,
    flagged: allFlags.length,
    critical: allFlags.filter((f) => f.severity === "critical").length,
    warning: allFlags.filter((f) => f.severity === "warning").length,
    overCapacity: allFlags.filter((f) => f.overCapacity).length,
    emailsSent,
    errors: errors.length > 0 ? errors : undefined,
  });
});
