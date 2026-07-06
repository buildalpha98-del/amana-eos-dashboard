/**
 * Forecast data assembly (2026-07-06) — the Prisma aggregation behind
 * GET /api/forecast, extracted so the morning-briefing cron can reuse
 * the exact same numbers (one source of truth for "projected to hit
 * capacity"). Pure math lives in lib/forecast.ts; this module owns the
 * queries.
 */

import { prisma } from "@/lib/prisma";
import {
  forecastOccupancy,
  deriveAlerts,
  type ForecastAlert,
  type OccupancyForecast,
  type WeekPoint,
} from "@/lib/forecast";

const HISTORY_WEEKS = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Monday (UTC) of the week containing `d` — matches the roster convention. */
export function weekStartIso(d: Date): string {
  const day = d.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  return new Date(d.getTime() + offset * DAY_MS).toISOString().slice(0, 10);
}

export interface ServiceForecastRow {
  serviceId: string;
  serviceName: string;
  code: string;
  capacity: number | null;
  history: WeekPoint[];
  forecast: OccupancyForecast | null;
}

export async function computeServiceForecasts(
  weeksAhead: number,
  now: Date = new Date(),
): Promise<ServiceForecastRow[]> {
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const historyStart = new Date(todayStart.getTime() - HISTORY_WEEKS * 7 * DAY_MS);

  const [services, attendance] = await Promise.all([
    prisma.service.findMany({
      where: { status: "active" },
      select: { id: true, name: true, code: true, capacity: true },
      orderBy: { name: "asc" },
    }),
    prisma.dailyAttendance.findMany({
      where: { date: { gte: historyStart, lt: todayStart } },
      select: { serviceId: true, date: true, attended: true, casual: true },
    }),
  ]);

  // Weekly average daily attendance per service: sum session rows per
  // (service, date), then average the daily totals inside each week.
  const daily = new Map<string, Map<string, number>>();
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

  return services.map((svc) => {
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
}

export async function computeForecastAlerts(
  weeksAhead = 8,
  now: Date = new Date(),
): Promise<ForecastAlert[]> {
  const rows = await computeServiceForecasts(weeksAhead, now);
  return deriveAlerts(rows, weeksAhead);
}
