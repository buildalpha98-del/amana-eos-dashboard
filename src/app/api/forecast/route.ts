/**
 * GET /api/forecast — forward-looking analytics (2026-07-06).
 *
 * Per-centre occupancy forecast (linear projection over the last 12
 * weeks of average daily attendance, from DailyAttendance) plus an
 * enquiry-pipeline conversion forecast (historical funnel rate applied
 * to the current open pipeline). Powers the Forecast view on
 * /performance and the projection alert chips on /leadership.
 *
 * Admin tier only — cross-service revenue posture is leadership data.
 * ?weeks= sets the horizon (4–8, default 8).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import {
  forecastOccupancy,
  forecastPipeline,
  deriveAlerts,
  CONVERTED_STAGES,
  OPEN_PIPELINE_STAGES,
  type WeekPoint,
} from "@/lib/forecast";

const HISTORY_WEEKS = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Monday (UTC) of the week containing `d` — matches the roster convention. */
function weekStartIso(d: Date): string {
  const day = d.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  return new Date(d.getTime() + offset * DAY_MS).toISOString().slice(0, 10);
}

export const GET = withApiAuth(async (req, session) => {
  if (!isAdminRole(session.user.role ?? "")) {
    throw ApiError.forbidden("Forecasting is admin-tier only.");
  }

  const url = new URL(req.url);
  const weeksAhead = Math.min(
    8,
    Math.max(4, Number(url.searchParams.get("weeks")) || 8),
  );

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const historyStart = new Date(todayStart.getTime() - HISTORY_WEEKS * 7 * DAY_MS);

  const [services, attendance, openEnquiries, convertedCount, coldCount] =
    await Promise.all([
      prisma.service.findMany({
        where: { status: "active" },
        select: { id: true, name: true, code: true, capacity: true },
        orderBy: { name: "asc" },
      }),
      prisma.dailyAttendance.findMany({
        where: { date: { gte: historyStart, lt: todayStart } },
        select: {
          serviceId: true,
          date: true,
          attended: true,
          casual: true,
        },
      }),
      prisma.parentEnquiry.groupBy({
        by: ["stage"],
        where: { stage: { in: [...OPEN_PIPELINE_STAGES] } },
        _count: { _all: true },
      }),
      prisma.parentEnquiry.count({
        where: { stage: { in: [...CONVERTED_STAGES] } },
      }),
      prisma.parentEnquiry.count({ where: { stage: "cold" } }),
    ]);

  // Weekly average daily attendance per service: sum session rows per
  // (service, date), then average the daily totals inside each week.
  const daily = new Map<string, Map<string, number>>(); // serviceId → dateIso → total
  for (const row of attendance) {
    const dateIso = row.date.toISOString().slice(0, 10);
    let perService = daily.get(row.serviceId);
    if (!perService) {
      perService = new Map();
      daily.set(row.serviceId, perService);
    }
    perService.set(
      dateIso,
      (perService.get(dateIso) ?? 0) + row.attended + row.casual,
    );
  }

  const serviceForecasts = services.map((svc) => {
    const perService = daily.get(svc.id);
    const weekly = new Map<string, { sum: number; days: number }>();
    if (perService) {
      for (const [dateIso, total] of perService) {
        const wk = weekStartIso(new Date(`${dateIso}T00:00:00.000Z`));
        const agg = weekly.get(wk) ?? { sum: 0, days: 0 };
        agg.sum += total;
        agg.days += 1;
        weekly.set(wk, agg);
      }
    }
    const history: WeekPoint[] = [...weekly.entries()]
      .map(([weekStart, { sum, days }]) => ({
        weekStart,
        value: Math.round((sum / days) * 10) / 10,
      }))
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

    return {
      serviceId: svc.id,
      serviceName: svc.name,
      code: svc.code,
      capacity: svc.capacity ?? null,
      history,
      forecast: forecastOccupancy(history, weeksAhead, svc.capacity ?? null),
    };
  });

  const openByStage: Record<string, number> = {};
  for (const g of openEnquiries) {
    openByStage[g.stage] = g._count._all;
  }

  return NextResponse.json({
    weeksAhead,
    services: serviceForecasts,
    pipeline: forecastPipeline(openByStage, convertedCount, coldCount),
    alerts: deriveAlerts(serviceForecasts, weeksAhead),
  });
});
