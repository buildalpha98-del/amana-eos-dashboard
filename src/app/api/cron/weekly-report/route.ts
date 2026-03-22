import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getResend, FROM_EMAIL } from "@/lib/email";
import { weeklyReportEmail } from "@/lib/email-templates";
import { notifyWeeklySummary } from "@/lib/teams-notify";
import { acquireCronLock } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/weekly-report
 *
 * Weekly cron (Monday 7 AM AEST) — sends a leadership summary email
 * to all owner/admin users with last week's KPIs across all centres.
 *
 * Auth: Bearer CRON_SECRET
 */
export const GET = withApiHandler(async (req) => {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Idempotency guard — prevent duplicate weekly report emails on retry
  const guard = await acquireCronLock("weekly-report", "weekly");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  const now = new Date();
  const baseUrl = process.env.NEXTAUTH_URL || "https://dashboard.amanaoshc.com.au";

  // Calculate last week's Monday–Sunday
  const dayOfWeek = now.getDay();
  const lastMonday = new Date(now);
  lastMonday.setDate(now.getDate() - dayOfWeek - 6);
  lastMonday.setHours(0, 0, 0, 0);

  const lastSunday = new Date(lastMonday);
  lastSunday.setDate(lastMonday.getDate() + 6);
  lastSunday.setHours(23, 59, 59, 999);

  const lastFriday = new Date(lastMonday);
  lastFriday.setDate(lastMonday.getDate() + 4);
  lastFriday.setHours(23, 59, 59, 999);

  // ── Gather metrics ──────────────────────────────────────

  // 1. Revenue from FinancialPeriod (weekly records)
  const financials = await prisma.financialPeriod.findMany({
    where: {
      periodType: "weekly",
      periodStart: { gte: lastMonday, lte: lastSunday },
    },
    include: { service: { select: { name: true, code: true } } },
  });

  const totalRevenue = financials.reduce((sum, f) => sum + f.totalRevenue, 0);

  // 2. Attendance occupancy from DailyAttendance
  const attendance = await prisma.dailyAttendance.findMany({
    where: {
      date: { gte: lastMonday, lte: lastFriday },
    },
    include: { service: { select: { name: true, code: true } } },
  });

  // Per-centre occupancy
  const centreOccupancy: Record<
    string,
    { name: string; code: string; bscAttended: number; bscCapacity: number; ascAttended: number; ascCapacity: number }
  > = {};

  for (const rec of attendance) {
    const key = rec.serviceId;
    if (!centreOccupancy[key]) {
      centreOccupancy[key] = {
        name: rec.service.name,
        code: rec.service.code,
        bscAttended: 0,
        bscCapacity: 0,
        ascAttended: 0,
        ascCapacity: 0,
      };
    }
    if (rec.sessionType === "bsc") {
      centreOccupancy[key].bscAttended += rec.attended;
      centreOccupancy[key].bscCapacity += rec.capacity;
    } else if (rec.sessionType === "asc") {
      centreOccupancy[key].ascAttended += rec.attended;
      centreOccupancy[key].ascCapacity += rec.capacity;
    }
  }

  const centreData = Object.values(centreOccupancy).map((c) => ({
    name: c.name,
    code: c.code,
    bscOccupancy: c.bscCapacity > 0 ? Math.round((c.bscAttended / c.bscCapacity) * 100) : 0,
    ascOccupancy: c.ascCapacity > 0 ? Math.round((c.ascAttended / c.ascCapacity) * 100) : 0,
  }));

  // Overall averages
  const totalBscAttended = Object.values(centreOccupancy).reduce((s, c) => s + c.bscAttended, 0);
  const totalBscCapacity = Object.values(centreOccupancy).reduce((s, c) => s + c.bscCapacity, 0);
  const totalAscAttended = Object.values(centreOccupancy).reduce((s, c) => s + c.ascAttended, 0);
  const totalAscCapacity = Object.values(centreOccupancy).reduce((s, c) => s + c.ascCapacity, 0);
  const avgBscOccupancy = totalBscCapacity > 0 ? Math.round((totalBscAttended / totalBscCapacity) * 100) : 0;
  const avgAscOccupancy = totalAscCapacity > 0 ? Math.round((totalAscAttended / totalAscCapacity) * 100) : 0;

  // 3. Overdue todos
  const overdueTodosCount = await prisma.todo.count({
    where: {
      deleted: false,
      status: { in: ["pending", "in_progress"] },
      dueDate: { lt: now },
    },
  });

  // 4. Off-track rocks
  const offTrackRocksCount = await prisma.rock.count({
    where: { deleted: false, status: "off_track" },
  });

  // 5. Expiring compliance certs (next 30 days)
  const in30d = new Date(now.getTime() + 30 * 86400000);
  const expiringCertsCount = await prisma.complianceCertificate.count({
    where: { expiryDate: { lte: in30d } },
  });

  // ── Send email to all owner/admin users ─────────────────

  const admins = await prisma.user.findMany({
    where: { role: { in: ["owner", "admin"] }, active: true },
    select: { name: true, email: true },
  });

  const resend = getResend();
  let emailsSent = 0;

  if (resend) {
    for (const admin of admins) {
      try {
        const { subject, html } = weeklyReportEmail(admin.name, {
          weekOf: lastMonday.toLocaleDateString("en-AU"),
          totalRevenue,
          avgBscOccupancy,
          avgAscOccupancy,
          overdueTodos: overdueTodosCount,
          offTrackRocks: offTrackRocksCount,
          expiringCerts: expiringCertsCount,
          centres: centreData,
          dashboardUrl: baseUrl,
        });
        await resend.emails.send({ from: FROM_EMAIL, to: admin.email, subject, html });
        emailsSent++;
      } catch (err) {
        logger.error("Weekly report email failed", { recipient: admin.email, err });
      }
    }
  }

  // ── Teams notification ──────────────────────────────────

  notifyWeeklySummary({
    centres: centreData.length,
    totalRevenue,
    avgOccupancy: Math.round((avgBscOccupancy + avgAscOccupancy) / 2),
    overdueTodos: overdueTodosCount,
    url: `${baseUrl}/dashboard`,
  }).catch(() => {});

  await guard.complete({
    weekOf: lastMonday.toISOString().split("T")[0],
    emailsSent,
    centres: centreData.length,
  });

  return NextResponse.json({
    message: "Weekly report sent",
    weekOf: lastMonday.toISOString().split("T")[0],
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    avgBscOccupancy,
    avgAscOccupancy,
    overdueTodos: overdueTodosCount,
    offTrackRocks: offTrackRocksCount,
    expiringCerts: expiringCertsCount,
    centres: centreData.length,
    emailsSent,
  });
});
