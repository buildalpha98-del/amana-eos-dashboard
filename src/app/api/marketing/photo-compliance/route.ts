import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

// GET /api/marketing/photo-compliance — last 7 days of photo compliance per centre
export const GET = withApiAuth(async (req, session) => {
  // Build last 7 dates (today minus 1..7, since today isn't complete yet)
  const dates: Date[] = [];
  const now = new Date();
  for (let i = 1; i <= 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    dates.push(d);
  }

  // Earliest and latest for query range
  const start = dates[dates.length - 1]; // oldest
  const end = dates[0]; // most recent
  const endPlusOne = new Date(end);
  endPlusOne.setDate(endPlusOne.getDate() + 1);

  // Fetch all active services
  const services = await prisma.service.findMany({
    where: { status: "active" },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });

  // Fetch all compliance logs in the date range
  const logs = await prisma.photoComplianceLog.findMany({
    where: {
      serviceId: { in: services.map((s) => s.id) },
      date: { gte: start, lt: endPlusOne },
    },
    select: {
      serviceId: true,
      date: true,
      confirmed: true,
      confirmedAt: true,
    },
  });

  // Index logs by serviceId+dateString
  const logMap = new Map<string, { confirmed: boolean; confirmedAt: Date | null }>();
  for (const log of logs) {
    const dateKey = log.date.toISOString().split("T")[0];
    logMap.set(`${log.serviceId}:${dateKey}`, {
      confirmed: log.confirmed,
      confirmedAt: log.confirmedAt,
    });
  }

  // Date strings for the response
  const dateStrings = dates.map((d) => d.toISOString().split("T")[0]);

  let totalConfirmed = 0;
  let totalChecks = 0;

  const serviceResults = services.map((svc) => {
    let confirmed = 0;
    let currentStreak = 0;
    let streakBroken = false;

    const days = dateStrings.map((dateStr) => {
      const entry = logMap.get(`${svc.id}:${dateStr}`);
      const isConfirmed = entry?.confirmed ?? false;
      if (isConfirmed) {
        confirmed++;
        if (!streakBroken) currentStreak++;
      } else {
        streakBroken = true;
      }
      totalChecks++;
      if (isConfirmed) totalConfirmed++;

      return {
        date: dateStr,
        confirmed: isConfirmed,
        confirmedAt: entry?.confirmedAt?.toISOString() ?? null,
      };
    });

    return {
      id: svc.id,
      name: svc.name,
      code: svc.code,
      days,
      streak: currentStreak,
      complianceRate: Math.round((confirmed / 7) * 100) / 100,
    };
  });

  return NextResponse.json({
    dateRange: {
      start: dateStrings[dateStrings.length - 1],
      end: dateStrings[0],
    },
    services: serviceResults,
    overallRate: totalChecks > 0 ? Math.round((totalConfirmed / totalChecks) * 100) / 100 : 0,
  });
}, { roles: ["owner", "head_office", "admin", "marketing"] });
