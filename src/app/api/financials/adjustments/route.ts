import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
import { z } from "zod";

const createAdjustmentSchema = z.object({
  periodMonth: z.string().min(1),
  category: z.enum(["personal_expense", "one_off_cost", "non_operating", "system_migration", "founder_above_market", "other"]),
  description: z.string().min(1),
  amount: z.union([z.number(), z.string().transform(Number)]),
  isRecurring: z.boolean().optional().default(false),
  notes: z.string().optional(),
});
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
export const GET = withApiAuth(async (req, session) => {
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
    logger.error("Adjustments GET", { err });
    return NextResponse.json({ error: "Failed to fetch adjustments" }, { status: 500 });
  }
}, { roles: ["owner", "head_office", "admin"] });

/**
 * POST /api/financials/adjustments
 * Create a new EBITDA adjustment
 */
export const POST = withApiAuth(async (req, session) => {
try {
    const body = await req.json();
    const parsed = createAdjustmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { periodMonth, category, description, amount, isRecurring, notes } = parsed.data;

    const adjustment = await prisma.eBITDAAdjustment.create({
      data: {
        periodMonth,
        category,
        description,
        amount: typeof amount === "number" ? amount : parseFloat(String(amount)),
        isRecurring,
        notes,
        createdById: session!.user.id,
      },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(adjustment, { status: 201 });
  } catch (err) {
    logger.error("Adjustments POST", { err });
    return NextResponse.json({ error: "Failed to create adjustment" }, { status: 500 });
  }
}, { roles: ["owner", "head_office", "admin"] });

/**
 * DELETE /api/financials/adjustments
 * Delete an adjustment by ID (passed as query param)
 */
export const DELETE = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    await prisma.eBITDAAdjustment.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("Adjustments DELETE", { err });
    return NextResponse.json({ error: "Failed to delete adjustment" }, { status: 500 });
  }
}, { roles: ["owner", "head_office"] });
