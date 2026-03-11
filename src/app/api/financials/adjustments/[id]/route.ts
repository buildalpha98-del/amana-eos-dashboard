import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

/**
 * PATCH /api/financials/adjustments/[id]
 * Update an EBITDA adjustment
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { id } = await params;

  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (body.periodMonth !== undefined) data.periodMonth = body.periodMonth;
    if (body.category !== undefined) data.category = body.category;
    if (body.description !== undefined) data.description = body.description;
    if (body.amount !== undefined) data.amount = parseFloat(body.amount);
    if (body.isRecurring !== undefined) data.isRecurring = body.isRecurring;
    if (body.verifiedByAccountant !== undefined) data.verifiedByAccountant = body.verifiedByAccountant;
    if (body.notes !== undefined) data.notes = body.notes;

    const adjustment = await prisma.eBITDAAdjustment.update({
      where: { id },
      data,
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(adjustment);
  } catch (err) {
    console.error("[Adjustments PATCH/:id]", err);
    return NextResponse.json({ error: "Failed to update adjustment" }, { status: 500 });
  }
}
