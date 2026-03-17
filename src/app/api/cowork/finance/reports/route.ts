import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";

const postSchema = z.object({
  serviceCode: z.string(),
  reportType: z.enum([
    "weekly_revenue",
    "monthly_revenue",
    "ccs_reconciliation",
    "budget_variance",
    "quarterly_summary",
    "payroll_precheck",
    "attendance_revenue",
    "educator_cost",
    "holiday_costing",
    "insurance",
    "month_end_close",
    "annual_budget",
    "new_centre_model",
  ]),
  period: z.string(),
  title: z.string(),
  content: z.string(),
  metrics: z.record(z.string(), z.any()).optional(),
  status: z.enum(["draft", "final", "archived"]).default("draft"),
});

/**
 * POST /api/cowork/finance/reports
 * Create or update a finance report (upsert by serviceCode + reportType + period).
 */
export async function POST(req: NextRequest) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const parsed = postSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Bad Request", message: parsed.error.message },
        { status: 400 }
      );
    }

    const { serviceCode, reportType, period, title, content, metrics, status } =
      parsed.data;

    // Resolve serviceCode to serviceId (unless "all")
    let serviceId: string | null = null;
    if (serviceCode !== "all") {
      const service = await prisma.service.findUnique({
        where: { code: serviceCode },
        select: { id: true },
      });
      if (!service) {
        return NextResponse.json(
          {
            error: "Not Found",
            message: `Service with code "${serviceCode}" not found`,
          },
          { status: 404 }
        );
      }
      serviceId = service.id;
    }

    // Check existence before upsert to determine created vs updated
    const existing = await prisma.financeReport.findUnique({
      where: { serviceCode_reportType_period: { serviceCode, reportType, period } },
      select: { id: true },
    });

    const report = await prisma.financeReport.upsert({
      where: { serviceCode_reportType_period: { serviceCode, reportType, period } },
      update: {
        title,
        content,
        metrics: metrics ?? Prisma.DbNull,
        status,
        ...(serviceId !== null ? { serviceId } : {}),
      },
      create: {
        serviceCode,
        reportType,
        period,
        title,
        content,
        metrics: metrics ?? Prisma.DbNull,
        status,
        ...(serviceId !== null ? { serviceId } : {}),
      },
      select: {
        id: true,
        serviceCode: true,
        reportType: true,
        period: true,
        title: true,
        status: true,
      },
    });

    const created = !existing;

    return NextResponse.json(
      { success: true, report, created },
      { status: created ? 201 : 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[POST /api/cowork/finance/reports]", err);
    return NextResponse.json(
      { error: "Internal Server Error", message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cowork/finance/reports
 * List finance reports. Supports filtering by serviceCode, reportType, period, status.
 * Content is excluded from list view for performance.
 */
export async function GET(req: NextRequest) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  try {
    const { searchParams } = req.nextUrl;
    const serviceCode = searchParams.get("serviceCode") ?? undefined;
    const reportType = searchParams.get("reportType") ?? undefined;
    const period = searchParams.get("period") ?? undefined;
    const status = searchParams.get("status") ?? undefined;
    const limit = Math.min(
      parseInt(searchParams.get("limit") ?? "20", 10) || 20,
      100
    );

    const reports = await prisma.financeReport.findMany({
      where: {
        ...(serviceCode ? { serviceCode } : {}),
        ...(reportType ? { reportType } : {}),
        ...(period ? { period } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        serviceCode: true,
        reportType: true,
        period: true,
        title: true,
        metrics: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ success: true, reports, count: reports.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[GET /api/cowork/finance/reports]", err);
    return NextResponse.json(
      { error: "Internal Server Error", message },
      { status: 500 }
    );
  }
}
