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

const RATIO_THRESHOLD = 13;

interface ShiftGap {
  serviceName: string;
  serviceId: string;
  date: string;
  sessionType: string;
  staffCount: number;
  enrolled: number;
  issue: "no_staff" | "high_ratio";
  ratio?: number;
}

/**
 * GET /api/cron/shift-gap-detector
 *
 * Daily cron (5 AM AEST) — checks rosters for the next 2 days and flags
 * services with zero staff for sessions that have enrolled children, or
 * where the staff-to-child ratio exceeds 1:13.
 *
 * Auth: Bearer CRON_SECRET
 */
export const GET = withApiHandler(async (req) => {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const guard = await acquireCronLock("shift-gap-detector", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const now = new Date();

    // ── 1. Date range: tomorrow + day after tomorrow ────────
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const dayAfterTomorrow = new Date(now);
    dayAfterTomorrow.setDate(now.getDate() + 2);
    dayAfterTomorrow.setHours(23, 59, 59, 999);

    // ── 2. Get roster shifts for next 2 days ────────────────
    const shifts = await prisma.rosterShift.findMany({
      where: {
        date: { gte: tomorrow, lte: dayAfterTomorrow },
      },
      include: {
        service: true,
      },
    });

    // ── 3. Get attendance data for same period ──────────────
    const attendance = await prisma.dailyAttendance.findMany({
      where: {
        date: { gte: tomorrow, lte: dayAfterTomorrow },
      },
    });

    // ── 4. Group shifts by service+date+sessionType ─────────
    const shiftMap = new Map<
      string,
      { staffCount: number; serviceId: string; serviceName: string }
    >();

    for (const shift of shifts) {
      const dateStr = new Date(shift.date).toISOString().split("T")[0];
      const key = `${shift.serviceId}|${dateStr}|${shift.sessionType}`;

      if (!shiftMap.has(key)) {
        shiftMap.set(key, {
          staffCount: 0,
          serviceId: shift.serviceId,
          serviceName: shift.service.name,
        });
      }
      shiftMap.get(key)!.staffCount++;
    }

    // Build attendance lookup
    const attendanceMap = new Map<string, number>();
    for (const a of attendance) {
      const dateStr = new Date(a.date).toISOString().split("T")[0];
      const key = `${a.serviceId}|${dateStr}|${a.sessionType}`;
      attendanceMap.set(key, a.enrolled);
    }

    // ── 5. Detect gaps ──────────────────────────────────────
    const gaps: ShiftGap[] = [];

    // Check all attendance entries for gaps
    for (const [key, enrolled] of attendanceMap) {
      if (enrolled <= 0) continue;

      const [serviceId, dateStr, sessionType] = key.split("|");
      const shiftData = shiftMap.get(key);
      const staffCount = shiftData?.staffCount || 0;

      // Get service name
      const service = shifts.find((s) => s.serviceId === serviceId)?.service;
      const serviceName = shiftData?.serviceName || service?.name || "Unknown";

      // Flag: no staff rostered for session with enrolled children
      if (staffCount === 0) {
        gaps.push({
          serviceName,
          serviceId,
          date: dateStr,
          sessionType,
          staffCount: 0,
          enrolled,
          issue: "no_staff",
        });
      }
      // Flag: ratio exceeds threshold
      else if (enrolled / staffCount > RATIO_THRESHOLD) {
        gaps.push({
          serviceName,
          serviceId,
          date: dateStr,
          sessionType,
          staffCount,
          enrolled,
          issue: "high_ratio",
          ratio: Math.round((enrolled / staffCount) * 10) / 10,
        });
      }
    }

    if (gaps.length === 0) {
      await guard.complete({ shiftsChecked: shifts.length, gaps: 0, emailsSent: 0 });
      return NextResponse.json({
        message: "No shift gaps detected for the next 2 days",
        shiftsChecked: shifts.length,
        gaps: 0,
        emailsSent: 0,
      });
    }

    // ── 6. Group gaps by service for manager emails ─────────
    const byService = new Map<
      string,
      { serviceName: string; managerId: string | null; gaps: ShiftGap[] }
    >();

    // Get service manager IDs
    const serviceIds = [...new Set(gaps.map((g) => g.serviceId))];
    const services = await prisma.service.findMany({
      where: { id: { in: serviceIds } },
      select: { id: true, name: true, managerId: true },
    });
    const serviceManagerMap = new Map(services.map((s) => [s.id, s.managerId]));

    for (const gap of gaps) {
      if (!byService.has(gap.serviceId)) {
        byService.set(gap.serviceId, {
          serviceName: gap.serviceName,
          managerId: serviceManagerMap.get(gap.serviceId) || null,
          gaps: [],
        });
      }
      byService.get(gap.serviceId)!.gaps.push(gap);
    }

    // ── 7. Send manager alerts ──────────────────────────────
    let emailsSent = 0;
    const errors: string[] = [];

    for (const [serviceId, data] of byService) {
      if (!data.managerId) continue;

      const manager = await prisma.user.findUnique({
        where: { id: data.managerId },
        select: { name: true, email: true, active: true },
      });
      if (!manager || !manager.active) continue;

      try {
        const firstName = manager.name.split(" ")[0];
        const gapRows = data.gaps
          .map((g) => {
            const issueColor = g.issue === "no_staff" ? "#dc2626" : "#f59e0b";
            const issueLabel =
              g.issue === "no_staff"
                ? "No Staff Rostered"
                : `Ratio 1:${g.ratio}`;
            const dateLabel = new Date(g.date).toLocaleDateString("en-AU", {
              weekday: "short",
              day: "numeric",
              month: "short",
            });
            return `<tr>
              <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;">${dateLabel}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;text-transform:uppercase;">${g.sessionType}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;text-align:center;">${g.staffCount}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;text-align:center;">${g.enrolled}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;font-weight:600;color:${issueColor};">${issueLabel}</td>
            </tr>`;
          })
          .join("");

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#f4f4f5;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <tr><td style="background:${BRAND_COLOR};padding:24px 32px;text-align:center;">
        <h1 style="margin:0;color:#fff;font-size:20px;">Amana OSHC</h1>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.6);font-size:11px;text-transform:uppercase;letter-spacing:1.5px;">Shift Gap Alert</p>
      </td></tr>
      <tr><td style="padding:32px;">
        <p style="margin:0 0 8px;color:#6b7280;font-size:14px;">Hi ${firstName},</p>
        <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">Roster gaps have been detected for <strong>${data.serviceName}</strong> in the next 2 days. Please review and arrange cover.</p>

        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:8px 12px;background:#f9fafb;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Date</td>
            <td style="padding:8px 12px;background:#f9fafb;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Session</td>
            <td style="padding:8px 12px;background:#f9fafb;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;text-align:center;">Staff</td>
            <td style="padding:8px 12px;background:#f9fafb;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;text-align:center;">Children</td>
            <td style="padding:8px 12px;background:#f9fafb;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Issue</td>
          </tr>
          ${gapRows}
        </table>

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
          subject: `Shift Gap Alert: ${data.serviceName} — ${data.gaps.length} gap${data.gaps.length === 1 ? "" : "s"} in next 2 days`,
          html,
        });
        emailsSent++;
      } catch (err) {
        errors.push(
          `Failed manager ${data.serviceName}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // ── 8. Send admin summary ───────────────────────────────
    const admins = await prisma.user.findMany({
      where: {
        role: { in: ["owner", "admin", "head_office"] },
        active: true,
      },
      select: { name: true, email: true },
    });

    const noStaffGaps = gaps.filter((g) => g.issue === "no_staff");
    const ratioGaps = gaps.filter((g) => g.issue === "high_ratio");

    const summaryRows = gaps
      .map((g) => {
        const issueColor = g.issue === "no_staff" ? "#dc2626" : "#f59e0b";
        const issueLabel =
          g.issue === "no_staff" ? "No Staff" : `Ratio 1:${g.ratio}`;
        const dateLabel = new Date(g.date).toLocaleDateString("en-AU", {
          weekday: "short",
          day: "numeric",
          month: "short",
        });
        return `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;">${g.serviceName}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;">${dateLabel}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;text-transform:uppercase;">${g.sessionType}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:600;color:${issueColor};">${issueLabel}</td>
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
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.6);font-size:11px;text-transform:uppercase;letter-spacing:1.5px;">Shift Gap Summary</p>
      </td></tr>
      <tr><td style="padding:32px;">
        <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">Hi ${firstName}, shift gaps have been detected across the network for the next 2 days.</p>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
          <tr>
            <td style="padding:16px;background:#dc2626;border-radius:8px 0 0 8px;text-align:center;width:50%;">
              <div style="font-size:28px;font-weight:700;color:#fff;">${noStaffGaps.length}</div>
              <div style="font-size:12px;color:rgba(255,255,255,0.8);margin-top:4px;">No Staff</div>
            </td>
            <td style="padding:16px;background:#f59e0b;border-radius:0 8px 8px 0;text-align:center;width:50%;">
              <div style="font-size:28px;font-weight:700;color:#fff;">${ratioGaps.length}</div>
              <div style="font-size:12px;color:rgba(255,255,255,0.8);margin-top:4px;">High Ratio</div>
            </td>
          </tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:8px 12px;background:#f9fafb;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Service</td>
            <td style="padding:8px 12px;background:#f9fafb;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Date</td>
            <td style="padding:8px 12px;background:#f9fafb;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Session</td>
            <td style="padding:8px 12px;background:#f9fafb;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Issue</td>
          </tr>
          ${summaryRows}
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
          subject: `Shift Gap Summary: ${gaps.length} gap${gaps.length === 1 ? "" : "s"} detected across network`,
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
      shiftsChecked: shifts.length,
      gaps: gaps.length,
      noStaff: noStaffGaps.length,
      highRatio: ratioGaps.length,
      servicesAffected: byService.size,
      emailsSent,
    });

    return NextResponse.json({
      message: "Shift gap detection complete",
      shiftsChecked: shifts.length,
      gaps: gaps.length,
      noStaff: noStaffGaps.length,
      highRatio: ratioGaps.length,
      servicesAffected: byService.size,
      emailsSent,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    await guard.fail(err);
    logger.error("Cron: shift-gap-detector", { err });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 },
    );
  }
});
