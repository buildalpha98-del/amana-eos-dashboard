import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { checkApiKeyRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/cowork/financials/adjustments
 * Cowork API — read EBITDA adjustments for monthly close automation
 * Scope: financials:read
 *
 * Query params:
 *   - periodMonth: "2026-03" (specific month)
 *   - from: "2025-01" (range start)
 *   - to: "2026-03" (range end)
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

  try {
    const where: Record<string, unknown> = {};
    if (periodMonth) {
      where.periodMonth = periodMonth;
    } else if (from || to) {
      where.periodMonth = {};
      if (from) (where.periodMonth as Record<string, string>).gte = from;
      if (to) (where.periodMonth as Record<string, string>).lte = to;
    }

    const adjustments = await prisma.eBITDAAdjustment.findMany({
      where,
      orderBy: [{ periodMonth: "desc" }, { amount: "desc" }],
    });

    const totalAddBacks = adjustments.reduce((sum, a) => sum + a.amount, 0);
    const byCategory: Record<string, number> = {};
    for (const a of adjustments) {
      byCategory[a.category] = (byCategory[a.category] || 0) + a.amount;
    }

    return NextResponse.json({
      adjustments,
      count: adjustments.length,
      summary: { totalAddBacks, byCategory },
    });
  } catch (err) {
    console.error("[Cowork Adjustments GET]", err);
    return NextResponse.json({ error: "Failed to fetch adjustments" }, { status: 500 });
  }
}
