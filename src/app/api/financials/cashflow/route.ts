import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
import { z } from "zod";

const createCashFlowSchema = z.object({
  periodMonth: z.string().min(1),
  openingBalance: z.number().optional().default(0),
  parentFeeReceipts: z.number().optional().default(0),
  ccsReceipts: z.number().optional().default(0),
  otherReceipts: z.number().optional().default(0),
  payrollPayments: z.number().optional().default(0),
  supplierPayments: z.number().optional().default(0),
  rentPayments: z.number().optional().default(0),
  overheadPayments: z.number().optional().default(0),
  debtRepayments: z.number().optional().default(0),
  investmentOutflows: z.number().optional().default(0),
  isActual: z.boolean().optional(),
});

const forecastSchema = z.object({
  startingBalance: z.number().optional().default(0),
  monthlyGrowthRate: z.number().optional().default(0.02),
  monthlyDebtRepayment: z.number().optional().default(2000),
});
/**
 * GET /api/financials/cashflow
 * Returns all cash flow periods (12+ months)
 */
export const GET = withApiAuth(async (req, session) => {
  try {
    const periods = await prisma.cashFlowPeriod.findMany({
      orderBy: { periodMonth: "asc" },
    });

    return NextResponse.json({ periods, count: periods.length });
  } catch (err) {
    logger.error("CashFlow GET", { err });
    return NextResponse.json({ error: "Failed to fetch cash flow data" }, { status: 500 });
  }
}, { roles: ["owner", "head_office", "admin"] });

/**
 * POST /api/financials/cashflow
 * Create or update a cash flow period
 */
export const POST = withApiAuth(async (req, session) => {
  try {
    const body = await req.json();
    const parsed = createCashFlowSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { periodMonth, ...fields } = parsed.data;

    // Auto-calculate derived fields
    const totalReceipts =
      fields.parentFeeReceipts +
      fields.ccsReceipts +
      fields.otherReceipts;
    const totalPayments =
      fields.payrollPayments +
      fields.supplierPayments +
      fields.rentPayments +
      fields.overheadPayments +
      fields.debtRepayments +
      fields.investmentOutflows;
    const netMovement = totalReceipts - totalPayments;
    const closingBalance = fields.openingBalance + netMovement;

    const data = {
      ...fields,
      totalReceipts,
      totalPayments,
      netMovement,
      closingBalance,
    };

    const period = await prisma.cashFlowPeriod.upsert({
      where: { periodMonth },
      update: data,
      create: { periodMonth, ...data },
    });

    return NextResponse.json(period, { status: 201 });
  } catch (err) {
    logger.error("CashFlow POST", { err });
    return NextResponse.json({ error: "Failed to save cash flow period" }, { status: 500 });
  }
}, { roles: ["owner", "head_office"] });

/**
 * PUT /api/financials/cashflow
 * Auto-generate 12-month forecast from current financial data
 */
export const PUT = withApiAuth(async (req, session) => {
  try {
    const body = await req.json();
    const parsed = forecastSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { startingBalance, monthlyGrowthRate, monthlyDebtRepayment } = parsed.data;

    // Get latest 3 months of financial data for baseline
    const now = new Date();
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const recentPeriods = await prisma.financialPeriod.findMany({
      where: {
        periodStart: { gte: threeMonthsAgo },
      },
    });

    // Calculate monthly averages from recent data
    const monthCount = Math.max(1, new Set(recentPeriods.map((p) => {
      const d = new Date(p.periodStart);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    })).size);

    const avgMonthlyRevenue =
      recentPeriods.reduce((sum, p) => sum + (p.totalRevenue || 0), 0) / monthCount;
    const avgMonthlyCosts =
      recentPeriods.reduce((sum, p) => sum + (p.totalCosts || 0), 0) / monthCount;

    // Split revenue assumption: 60% parent fees, 40% CCS
    const baseParentFees = avgMonthlyRevenue * 0.6;
    const baseCCS = avgMonthlyRevenue * 0.4;

    // Split costs
    const avgStaffCosts =
      recentPeriods.reduce((sum, p) => sum + (p.staffCosts || 0), 0) / monthCount;
    const avgFoodCosts =
      recentPeriods.reduce((sum, p) => sum + (p.foodCosts || 0), 0) / monthCount;
    const avgRentCosts =
      recentPeriods.reduce((sum, p) => sum + (p.rentCosts || 0), 0) / monthCount;
    const avgOtherCosts = avgMonthlyCosts - avgStaffCosts - avgFoodCosts - avgRentCosts;

    // Generate 12 months
    const forecasts = [];
    let openingBalance = startingBalance;

    for (let i = 0; i < 12; i++) {
      const forecastDate = new Date(now);
      forecastDate.setMonth(forecastDate.getMonth() + i);
      const periodMonth = `${forecastDate.getFullYear()}-${String(forecastDate.getMonth() + 1).padStart(2, "0")}`;

      const growthFactor = Math.pow(1 + monthlyGrowthRate, i);
      const parentFeeReceipts = Math.round(baseParentFees * growthFactor);
      const ccsReceipts = Math.round(baseCCS * growthFactor);
      const totalReceipts = parentFeeReceipts + ccsReceipts;

      const payrollPayments = Math.round(avgStaffCosts * (1 + monthlyGrowthRate * i * 0.5));
      const supplierPayments = Math.round(avgFoodCosts);
      const rentPayments = Math.round(avgRentCosts);
      const overheadPayments = Math.round(avgOtherCosts);
      const debtRepayments = monthlyDebtRepayment;
      const totalPayments =
        payrollPayments + supplierPayments + rentPayments + overheadPayments + debtRepayments;

      const netMovement = totalReceipts - totalPayments;
      const closingBalance = openingBalance + netMovement;

      // Check if actual data exists for this month
      const existing = await prisma.cashFlowPeriod.findUnique({
        where: { periodMonth },
      });

      if (!existing || !existing.isActual) {
        await prisma.cashFlowPeriod.upsert({
          where: { periodMonth },
          update: {
            openingBalance,
            parentFeeReceipts,
            ccsReceipts,
            otherReceipts: 0,
            totalReceipts,
            payrollPayments,
            supplierPayments,
            rentPayments,
            overheadPayments,
            debtRepayments,
            investmentOutflows: 0,
            totalPayments,
            netMovement,
            closingBalance,
            isActual: false,
          },
          create: {
            periodMonth,
            openingBalance,
            parentFeeReceipts,
            ccsReceipts,
            totalReceipts,
            payrollPayments,
            supplierPayments,
            rentPayments,
            overheadPayments,
            debtRepayments,
            totalPayments,
            netMovement,
            closingBalance,
            isActual: false,
          },
        });

        forecasts.push({
          periodMonth,
          openingBalance,
          totalReceipts,
          totalPayments,
          netMovement,
          closingBalance,
        });
      }

      openingBalance = closingBalance;
    }

    return NextResponse.json({
      success: true,
      generated: forecasts.length,
      forecasts,
      assumptions: {
        baseMonthlyRevenue: avgMonthlyRevenue,
        baseMonthlyCosts: avgMonthlyCosts,
        monthlyGrowthRate,
        monthlyDebtRepayment,
        startingBalance,
      },
    });
  } catch (err) {
    logger.error("CashFlow PUT/forecast", { err });
    return NextResponse.json({ error: "Failed to generate forecast" }, { status: 500 });
  }
}, { roles: ["owner", "head_office"] });
