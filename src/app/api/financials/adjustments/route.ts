import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

/**
 * GET /api/financials/adjustments
 * List EBITDA adjustments by period or date range
 *
 * Query params:
 *   - periodMonth: "2026-03" (specific month)
 *   - from: "2025-01" (range start)
 *   - to: "2026-03" (range end)
 *   - category: filter by category
 */
export async function GET(req: NextRequest) {
  const { error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const periodMonth = searchParams.get("periodMonth");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const category = searchParams.get("category");

  try {
    const where: Record<string, unknown> = {};
    if (periodMonth) {
      where.periodMonth = periodMonth;
    } else if (from || to) {
      where.periodMonth = {};
      if (from) (where.periodMonth as Record<string, string>).gte = from;
      if (to) (where.periodMonth as Record<string, string>).lte = to;
    }
    if (category) where.category = category;

    const adjustments = await prisma.eBITDAAdjustment.findMany({
      where,
      include: {
        createdBy: { select: { id: true, name: true } },
      },
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
      summary: {
        totalAddBacks,
        byCategory,
        verifiedCount: adjustments.filter((a) => a.verifiedByAccountant).length,
        unverifiedCount: adjustments.filter((a) => !a.verifiedByAccountant).length,
      },
    });
  } catch (err) {
    console.error("[Adjustments GET]", err);
    return NextResponse.json({ error: "Failed to fetch adjustments" }, { status: 500 });
  }
}

/**
 * POST /api/financials/adjustments
 * Create a new EBITDA adjustment
 */
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  try {
    const body = await req.json();
    const { periodMonth, category, description, amount, isRecurring, notes } = body;

    if (!periodMonth || !category || !description || amount === undefined) {
      return NextResponse.json(
        { error: "periodMonth, category, description, and amount are required" },
        { status: 400 },
      );
    }

    const validCategories = [
      "personal_expense",
      "one_off_cost",
      "non_operating",
      "system_migration",
      "founder_above_market",
      "other",
    ];
    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { error: `Invalid category. Must be one of: ${validCategories.join(", ")}` },
        { status: 400 },
      );
    }

    const adjustment = await prisma.eBITDAAdjustment.create({
      data: {
        periodMonth,
        category,
        description,
        amount: parseFloat(amount),
        isRecurring: isRecurring || false,
        notes,
        createdById: session!.user.id,
      },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(adjustment, { status: 201 });
  } catch (err) {
    console.error("[Adjustments POST]", err);
    return NextResponse.json({ error: "Failed to create adjustment" }, { status: 500 });
  }
}

/**
 * DELETE /api/financials/adjustments
 * Delete an adjustment by ID (passed as query param)
 */
export async function DELETE(req: NextRequest) {
  const { error } = await requireAuth(["owner", "head_office"]);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    await prisma.eBITDAAdjustment.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Adjustments DELETE]", err);
    return NextResponse.json({ error: "Failed to delete adjustment" }, { status: 500 });
  }
}
