import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";

import { parseJsonBody } from "@/lib/api-error";
// 2026-06-05: vcAttendance kept for backward compatibility with older
// callers; new clients send vcRecurring + vcCasual just like BSC/ASC.
// The route prefers the split values when supplied and falls back to
// vcAttendance otherwise.
const weeklyDataSchema = z.object({
  weekOf: z.string(),
  bscRecurring: z.number().min(0).default(0),
  bscCasual: z.number().min(0).default(0),
  ascRecurring: z.number().min(0).default(0),
  ascCasual: z.number().min(0).default(0),
  vcRecurring: z.number().min(0).optional(),
  vcCasual: z.number().min(0).optional(),
  vcAttendance: z.number().min(0).optional(),
  staffCosts: z.number().min(0).default(0),
  foodCosts: z.number().min(0).default(0),
  suppliesCosts: z.number().min(0).default(0),
  otherCosts: z.number().min(0).default(0),
});

// GET /api/services/[id]/weekly-data — last 13 weekly records
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const records = await prisma.financialPeriod.findMany({
    where: {
      serviceId: id,
      periodType: "weekly",
    },
    orderBy: { periodStart: "desc" },
    take: 13,
  });

  return NextResponse.json(records);
});

// POST /api/services/[id]/weekly-data — create/update weekly record with auto-revenue calc
export const POST = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;
  const body = await parseJsonBody(req);
  const parsed = weeklyDataSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  // Fetch service rates
  const service = await prisma.service.findUnique({
    where: { id },
    select: { bscDailyRate: true, ascDailyRate: true, vcDailyRate: true },
  });

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  const bscRate = service.bscDailyRate || 0;
  const ascRate = service.ascDailyRate || 0;
  const vcRate = service.vcDailyRate || 0;

  // Calculate revenue: attendance × rate × 5 days per week.
  // Resolve vcAttendance from the new split fields when present so
  // forecasts saved with the recurring/casual UI round-trip cleanly.
  const bscAttendance = data.bscRecurring + data.bscCasual;
  const ascAttendance = data.ascRecurring + data.ascCasual;
  const vcRecurring = data.vcRecurring ?? 0;
  const vcCasual = data.vcCasual ?? 0;
  const vcAttendance =
    data.vcRecurring !== undefined || data.vcCasual !== undefined
      ? vcRecurring + vcCasual
      : data.vcAttendance ?? 0;
  const bscRevenue = bscAttendance * bscRate * 5;
  const ascRevenue = ascAttendance * ascRate * 5;
  const vcRevenue = vcAttendance * vcRate * 5;
  const totalRevenue = bscRevenue + ascRevenue + vcRevenue;

  // Calculate costs
  const totalCosts = data.staffCosts + data.foodCosts + data.suppliesCosts + data.otherCosts;
  const grossProfit = totalRevenue - totalCosts;
  const margin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  const weekStart = new Date(data.weekOf);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const record = await prisma.financialPeriod.upsert({
    where: {
      serviceId_periodType_periodStart: {
        serviceId: id,
        periodType: "weekly",
        periodStart: weekStart,
      },
    },
    update: {
      bscRevenue,
      ascRevenue,
      vcRevenue,
      totalRevenue,
      staffCosts: data.staffCosts,
      foodCosts: data.foodCosts,
      suppliesCosts: data.suppliesCosts,
      otherCosts: data.otherCosts,
      totalCosts,
      grossProfit,
      margin,
      bscAttendance,
      ascAttendance,
      vcAttendance,
      bscEnrolments: data.bscRecurring,
      ascEnrolments: data.ascRecurring,
    },
    create: {
      serviceId: id,
      periodType: "weekly",
      periodStart: weekStart,
      periodEnd: weekEnd,
      bscRevenue,
      ascRevenue,
      vcRevenue,
      totalRevenue,
      staffCosts: data.staffCosts,
      foodCosts: data.foodCosts,
      suppliesCosts: data.suppliesCosts,
      otherCosts: data.otherCosts,
      totalCosts,
      grossProfit,
      margin,
      bscAttendance,
      ascAttendance,
      vcAttendance,
      bscEnrolments: data.bscRecurring,
      ascEnrolments: data.ascRecurring,
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "WeeklyData",
      entityId: record.id,
      details: { serviceId: id, weekOf: data.weekOf },
    },
  });

  return NextResponse.json(record);
}, { roles: ["owner", "head_office", "admin"] });
