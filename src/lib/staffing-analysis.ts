/**
 * Staffing analysis engine — detects overstaffing/understaffing
 * across Amana OSHC centres using BookingForecast + RosterShift data.
 */

import { prisma } from "@/lib/prisma";
import type { SessionType } from "@prisma/client";

// ── Constants ─────────────────────────────────────────────────

/** Loaded educator cost: $38 wage + 12% super */
const EDUCATOR_HOURLY_COST = 42.56;

/** Approximate shift durations (hours) */
const SHIFT_HOURS: Record<string, number> = {
  bsc: 2,
  asc: 4,
};

/** Cost per educator per shift */
export const SHIFT_COST: Record<string, number> = {
  bsc: EDUCATOR_HOURLY_COST * SHIFT_HOURS.bsc, // $85.12
  asc: EDUCATOR_HOURLY_COST * SHIFT_HOURS.asc, // $170.24
};

/** Required ratio: 1 educator per 15 children */
const CHILDREN_PER_EDUCATOR = 15;

/** Break-even children per educator (regular / casual) */
export const BREAK_EVEN = {
  bsc: { regular: 4, casual: 3 },
  asc: { regular: 5, casual: 5 },
};

// ── Types ─────────────────────────────────────────────────────

export interface SessionAnalysis {
  sessionType: SessionType;
  bookedChildren: number;
  regularBookings: number;
  casualBookings: number;
  requiredEducators: number;
  rosteredEducators: number;
  variance: number; // positive = overstaffed, negative = understaffed
  status: "overstaffed" | "understaffed" | "optimal";
  wasteCost: number; // $ cost of excess educators
  revenueAtRisk: number; // $ revenue at risk if understaffed
  capacity: number;
}

export interface DayAnalysis {
  serviceId: string;
  serviceName: string;
  serviceCode: string;
  date: string; // ISO date
  sessions: SessionAnalysis[];
  totalWaste: number;
  totalRisk: number;
  overallStatus: "overstaffed" | "understaffed" | "optimal" | "no_data";
  totalRostered: number;
  totalRequired: number;
}

export interface WeekAnalysis {
  serviceId: string;
  serviceName: string;
  serviceCode: string;
  weekStart: string;
  days: DayAnalysis[];
  totalWaste: number;
  totalRisk: number;
  worstDay: DayAnalysis | null;
}

export interface NetworkSummary {
  date: string;
  services: DayAnalysis[];
  totalWaste: number;
  totalRisk: number;
  overstaffedCount: number;
  understaffedCount: number;
  optimalCount: number;
  noDataCount: number;
}

// ── Core Analysis ─────────────────────────────────────────────

export async function analyseStaffingForDay(
  serviceId: string,
  date: Date,
): Promise<DayAnalysis> {
  const dateOnly = new Date(date.toISOString().split("T")[0] + "T00:00:00Z");

  // Fetch service info
  const service = await prisma.service.findUniqueOrThrow({
    where: { id: serviceId },
    select: {
      id: true,
      name: true,
      code: true,
      bscDailyRate: true,
      ascDailyRate: true,
      bscCasualRate: true,
      ascCasualRate: true,
    },
  });

  // Fetch bookings and roster for this day
  const [bookings, rosterShifts] = await Promise.all([
    prisma.bookingForecast.findMany({
      where: { serviceId, date: dateOnly },
    }),
    prisma.rosterShift.findMany({
      where: { serviceId, date: dateOnly },
    }),
  ]);

  const sessions: SessionAnalysis[] = [];

  for (const sessionType of ["bsc", "asc"] as SessionType[]) {
    const booking = bookings.find((b) => b.sessionType === sessionType);
    const shifts = rosterShifts.filter((r) => r.sessionType === sessionType);

    const bookedChildren = booking?.total ?? 0;
    const regularBookings = booking?.regular ?? 0;
    const casualBookings = booking?.casual ?? 0;
    const capacity = booking?.capacity ?? 0;
    const rosteredEducators = shifts.length;
    const requiredEducators =
      bookedChildren > 0 ? Math.ceil(bookedChildren / CHILDREN_PER_EDUCATOR) : 0;

    const variance = rosteredEducators - requiredEducators;
    const shiftCost = SHIFT_COST[sessionType] ?? SHIFT_COST.asc;

    let status: SessionAnalysis["status"] = "optimal";
    let wasteCost = 0;
    let revenueAtRisk = 0;

    if (variance > 0) {
      status = "overstaffed";
      wasteCost = variance * shiftCost;
    } else if (variance < 0) {
      status = "understaffed";
      // Revenue at risk: unserved children × daily rate
      const rate =
        sessionType === "bsc"
          ? (service.bscDailyRate ?? 0)
          : (service.ascDailyRate ?? 0);
      const unservedChildren = Math.abs(variance) * CHILDREN_PER_EDUCATOR;
      revenueAtRisk = unservedChildren * rate;
    }

    sessions.push({
      sessionType,
      bookedChildren,
      regularBookings,
      casualBookings,
      requiredEducators,
      rosteredEducators,
      variance,
      status,
      wasteCost,
      revenueAtRisk,
      capacity,
    });
  }

  const totalWaste = sessions.reduce((s, a) => s + a.wasteCost, 0);
  const totalRisk = sessions.reduce((s, a) => s + a.revenueAtRisk, 0);
  const totalRostered = sessions.reduce((s, a) => s + a.rosteredEducators, 0);
  const totalRequired = sessions.reduce((s, a) => s + a.requiredEducators, 0);

  const hasData = bookings.length > 0 || rosterShifts.length > 0;

  let overallStatus: DayAnalysis["overallStatus"] = "no_data";
  if (hasData) {
    if (totalWaste > 0 && totalRisk === 0) overallStatus = "overstaffed";
    else if (totalRisk > 0) overallStatus = "understaffed";
    else overallStatus = "optimal";
  }

  return {
    serviceId: service.id,
    serviceName: service.name,
    serviceCode: service.code,
    date: dateOnly.toISOString().split("T")[0],
    sessions,
    totalWaste,
    totalRisk,
    overallStatus,
    totalRostered,
    totalRequired,
  };
}

// ── Week Analysis ─────────────────────────────────────────────

export async function analyseStaffingForWeek(
  serviceId: string,
  weekStart: Date,
): Promise<WeekAnalysis> {
  const days: DayAnalysis[] = [];
  const start = new Date(weekStart.toISOString().split("T")[0] + "T00:00:00Z");

  // Monday through Friday
  for (let i = 0; i < 5; i++) {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + i);
    const analysis = await analyseStaffingForDay(serviceId, day);
    days.push(analysis);
  }

  const totalWaste = days.reduce((s, d) => s + d.totalWaste, 0);
  const totalRisk = days.reduce((s, d) => s + d.totalRisk, 0);

  const worstDay =
    days.length > 0
      ? days.reduce((worst, d) =>
          d.totalWaste + d.totalRisk > worst.totalWaste + worst.totalRisk
            ? d
            : worst,
        )
      : null;

  const service = await prisma.service.findUniqueOrThrow({
    where: { id: serviceId },
    select: { id: true, name: true, code: true },
  });

  return {
    serviceId: service.id,
    serviceName: service.name,
    serviceCode: service.code,
    weekStart: start.toISOString().split("T")[0],
    days,
    totalWaste,
    totalRisk,
    worstDay: worstDay?.totalWaste || worstDay?.totalRisk ? worstDay : null,
  };
}

// ── Network Summary ───────────────────────────────────────────

export async function getNetworkStaffingSummary(
  date: Date,
): Promise<NetworkSummary> {
  const services = await prisma.service.findMany({
    where: {
      status: "active",
      ownaServiceId: { not: null },
    },
    select: { id: true },
  });

  const analyses = await Promise.all(
    services.map((s) => analyseStaffingForDay(s.id, date)),
  );

  // Sort by waste amount (highest first)
  analyses.sort((a, b) => b.totalWaste - a.totalWaste);

  return {
    date: date.toISOString().split("T")[0],
    services: analyses,
    totalWaste: analyses.reduce((s, a) => s + a.totalWaste, 0),
    totalRisk: analyses.reduce((s, a) => s + a.totalRisk, 0),
    overstaffedCount: analyses.filter((a) => a.overallStatus === "overstaffed")
      .length,
    understaffedCount: analyses.filter(
      (a) => a.overallStatus === "understaffed",
    ).length,
    optimalCount: analyses.filter((a) => a.overallStatus === "optimal").length,
    noDataCount: analyses.filter((a) => a.overallStatus === "no_data").length,
  };
}
