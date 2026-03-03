import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { z } from "zod";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") || "monthly";
  const serviceId = searchParams.get("serviceId");

  const where: Record<string, unknown> = {
    periodType: period,
  };
  if (serviceId) where.serviceId = serviceId;

  // dataSource and xeroSyncedAt are included automatically as scalar fields
  const financials = await prisma.financialPeriod.findMany({
    where,
    include: {
      service: { select: { id: true, name: true, code: true, state: true, status: true } },
    },
    orderBy: { periodStart: "desc" },
    take: 100,
  });

  // Calculate summary
  const latestPeriodStart = financials.length > 0 ? financials[0].periodStart : null;
  const latestPeriod = latestPeriodStart
    ? financials.filter(f => f.periodStart.getTime() === latestPeriodStart.getTime())
    : [];

  const totalBudgetRevenue = latestPeriod.reduce((sum, f) => sum + (f.budgetRevenue ?? 0), 0);
  const totalBudgetCosts = latestPeriod.reduce((sum, f) => sum + (f.budgetCosts ?? 0), 0);

  const summary = {
    totalRevenue: latestPeriod.reduce((sum, f) => sum + f.totalRevenue, 0),
    totalCosts: latestPeriod.reduce((sum, f) => sum + f.totalCosts, 0),
    totalProfit: latestPeriod.reduce((sum, f) => sum + f.grossProfit, 0),
    avgMargin: latestPeriod.length > 0
      ? latestPeriod.reduce((sum, f) => sum + f.margin, 0) / latestPeriod.length
      : 0,
    centreCount: latestPeriod.length,
    totalBscAttendance: latestPeriod.reduce((sum, f) => sum + f.bscAttendance, 0),
    totalAscAttendance: latestPeriod.reduce((sum, f) => sum + f.ascAttendance, 0),
    totalBudgetRevenue,
    totalBudgetCosts,
  };

  return NextResponse.json({ financials, summary });
}

const financialEntrySchema = z.object({
  serviceId: z.string().min(1),
  periodType: z.enum(["weekly", "monthly", "quarterly"]),
  periodStart: z.string(),
  periodEnd: z.string(),
  bscRevenue: z.number().min(0).default(0),
  ascRevenue: z.number().min(0).default(0),
  vcRevenue: z.number().min(0).default(0),
  otherRevenue: z.number().min(0).default(0),
  staffCosts: z.number().min(0).default(0),
  foodCosts: z.number().min(0).default(0),
  suppliesCosts: z.number().min(0).default(0),
  rentCosts: z.number().min(0).default(0),
  adminCosts: z.number().min(0).default(0),
  otherCosts: z.number().min(0).default(0),
  bscAttendance: z.number().min(0).default(0),
  ascAttendance: z.number().min(0).default(0),
  vcAttendance: z.number().min(0).default(0),
  bscEnrolments: z.number().min(0).default(0),
  ascEnrolments: z.number().min(0).default(0),
  budgetRevenue: z.number().min(0).optional(),
  budgetCosts: z.number().min(0).optional(),
});

export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const body = await req.json();
  const parsed = financialEntrySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const d = parsed.data;
  const totalRevenue = d.bscRevenue + d.ascRevenue + d.vcRevenue + d.otherRevenue;
  const totalCosts = d.staffCosts + d.foodCosts + d.suppliesCosts + d.rentCosts + d.adminCosts + d.otherCosts;
  const grossProfit = totalRevenue - totalCosts;
  const margin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  const periodStart = new Date(d.periodStart);
  const periodEnd = new Date(d.periodEnd);

  const record = await prisma.financialPeriod.upsert({
    where: {
      serviceId_periodType_periodStart: {
        serviceId: d.serviceId,
        periodType: d.periodType,
        periodStart,
      },
    },
    update: {
      periodEnd,
      bscRevenue: d.bscRevenue,
      ascRevenue: d.ascRevenue,
      vcRevenue: d.vcRevenue,
      otherRevenue: d.otherRevenue,
      totalRevenue,
      staffCosts: d.staffCosts,
      foodCosts: d.foodCosts,
      suppliesCosts: d.suppliesCosts,
      rentCosts: d.rentCosts,
      adminCosts: d.adminCosts,
      otherCosts: d.otherCosts,
      totalCosts,
      grossProfit,
      margin,
      bscAttendance: d.bscAttendance,
      ascAttendance: d.ascAttendance,
      vcAttendance: d.vcAttendance,
      bscEnrolments: d.bscEnrolments,
      ascEnrolments: d.ascEnrolments,
      ...(d.budgetRevenue !== undefined && { budgetRevenue: d.budgetRevenue }),
      ...(d.budgetCosts !== undefined && { budgetCosts: d.budgetCosts }),
      dataSource: "manual",
    },
    create: {
      serviceId: d.serviceId,
      periodType: d.periodType,
      periodStart,
      periodEnd,
      bscRevenue: d.bscRevenue,
      ascRevenue: d.ascRevenue,
      vcRevenue: d.vcRevenue,
      otherRevenue: d.otherRevenue,
      totalRevenue,
      staffCosts: d.staffCosts,
      foodCosts: d.foodCosts,
      suppliesCosts: d.suppliesCosts,
      rentCosts: d.rentCosts,
      adminCosts: d.adminCosts,
      otherCosts: d.otherCosts,
      totalCosts,
      grossProfit,
      margin,
      bscAttendance: d.bscAttendance,
      ascAttendance: d.ascAttendance,
      vcAttendance: d.vcAttendance,
      bscEnrolments: d.bscEnrolments,
      ascEnrolments: d.ascEnrolments,
      ...(d.budgetRevenue !== undefined && { budgetRevenue: d.budgetRevenue }),
      ...(d.budgetCosts !== undefined && { budgetCosts: d.budgetCosts }),
      dataSource: "manual",
    },
    include: {
      service: { select: { id: true, name: true, code: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "FinancialPeriod",
      entityId: record.id,
      details: { serviceId: d.serviceId, periodType: d.periodType },
    },
  });

  return NextResponse.json(record, { status: 201 });
}
