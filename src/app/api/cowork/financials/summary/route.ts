import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { checkApiKeyRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/cowork/financials/summary
 * Cowork API — returns network and per-centre financial summary
 * Scope: financials:read
 *
 * Query params:
 *   - periodMonth: "2026-03" (specific month, default: current month)
 *   - from: "2025-01" (range start for aggregation)
 *   - to: "2026-03" (range end for aggregation)
 *   - serviceId: filter to specific centre
 */
export async function GET(req: NextRequest) {
  const { apiKey, error: authError } = await authenticateApiKey(req, "financials:read");
  if (authError) return authError;
  const { limited, resetIn } = await checkApiKeyRateLimit(apiKey!.id);
  if (limited) {
    return NextResponse.json({ error: "Rate limit exceeded", resetIn }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const periodMonth = searchParams.get("periodMonth");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const serviceId = searchParams.get("serviceId");

  try {
    // Build period filter
    const periodWhere: Record<string, unknown> = {};
    if (periodMonth) {
      // Match periods containing this month
      periodWhere.periodStart = { lte: new Date(`${periodMonth}-28`) };
      periodWhere.periodEnd = { gte: new Date(`${periodMonth}-01`) };
    } else if (from || to) {
      if (from) periodWhere.periodStart = { gte: new Date(`${from}-01`) };
      if (to) periodWhere.periodEnd = { lte: new Date(`${to}-28`) };
    }
    if (serviceId) periodWhere.serviceId = serviceId;

    const periods = await prisma.financialPeriod.findMany({
      where: periodWhere,
      include: {
        service: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ periodStart: "desc" }],
    });

    // Network totals
    const totalRevenue = periods.reduce(
      (sum, p) => sum + (p.totalRevenue || 0),
      0,
    );
    const totalCosts = periods.reduce(
      (sum, p) => sum + (p.totalCosts || 0),
      0,
    );
    const grossProfit = totalRevenue - totalCosts;
    const margin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    // Per-centre breakdown
    const byService: Record<
      string,
      {
        serviceId: string;
        serviceName: string;
        serviceCode: string | null;
        revenue: number;
        costs: number;
        profit: number;
        margin: number;
        periods: number;
      }
    > = {};

    for (const p of periods) {
      const key = p.serviceId;
      if (!byService[key]) {
        byService[key] = {
          serviceId: key,
          serviceName: p.service.name,
          serviceCode: p.service.code,
          revenue: 0,
          costs: 0,
          profit: 0,
          margin: 0,
          periods: 0,
        };
      }
      byService[key].revenue += p.totalRevenue || 0;
      byService[key].costs += p.totalCosts || 0;
      byService[key].periods++;
    }

    for (const s of Object.values(byService)) {
      s.profit = s.revenue - s.costs;
      s.margin = s.revenue > 0 ? (s.profit / s.revenue) * 100 : 0;
    }

    // Fetch EBITDA adjustments for the same period
    const adjWhere: Record<string, unknown> = {};
    if (periodMonth) {
      adjWhere.periodMonth = periodMonth;
    } else if (from || to) {
      adjWhere.periodMonth = {};
      if (from) (adjWhere.periodMonth as Record<string, string>).gte = from;
      if (to) (adjWhere.periodMonth as Record<string, string>).lte = to;
    }

    const adjustments = await prisma.eBITDAAdjustment.findMany({
      where: adjWhere,
    });
    const totalAddBacks = adjustments.reduce((sum, a) => sum + a.amount, 0);
    const statutoryEBITDA = grossProfit;
    const adjustedEBITDA = statutoryEBITDA + totalAddBacks;

    return NextResponse.json({
      network: {
        totalRevenue,
        totalCosts,
        grossProfit,
        margin: Math.round(margin * 100) / 100,
        statutoryEBITDA,
        totalAddBacks,
        adjustedEBITDA,
        periodsCount: periods.length,
      },
      byService: Object.values(byService).sort(
        (a, b) => b.revenue - a.revenue,
      ),
      adjustments: {
        count: adjustments.length,
        totalAddBacks,
        byCategory: adjustments.reduce(
          (acc, a) => {
            acc[a.category] = (acc[a.category] || 0) + a.amount;
            return acc;
          },
          {} as Record<string, number>,
        ),
      },
    });
  } catch (err) {
    console.error("[Cowork Financials Summary GET]", err);
    return NextResponse.json(
      { error: "Failed to fetch financial summary" },
      { status: 500 },
    );
  }
}
