import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
import { z } from "zod";

import { parseJsonBody } from "@/lib/api-error";
const patchAdjustmentSchema = z.object({
  periodMonth: z.string().min(1).optional(),
  category: z.enum(["personal_expense", "one_off_cost", "non_operating", "system_migration", "founder_above_market", "other"]).optional(),
  description: z.string().min(1).optional(),
  amount: z.union([z.number(), z.string().transform(Number)]).optional(),
  isRecurring: z.boolean().optional(),
  verifiedByAccountant: z.boolean().optional(),
  notes: z.string().optional(),
});

/**
 * PATCH /api/financials/adjustments/[id]
 * Update an EBITDA adjustment
 */
export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  try {
    const body = await parseJsonBody(req);
    const parsed = patchAdjustmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const data: Record<string, unknown> = {};

    if (parsed.data.periodMonth !== undefined) data.periodMonth = parsed.data.periodMonth;
    if (parsed.data.category !== undefined) data.category = parsed.data.category;
    if (parsed.data.description !== undefined) data.description = parsed.data.description;
    if (parsed.data.amount !== undefined) data.amount = typeof parsed.data.amount === "number" ? parsed.data.amount : parseFloat(String(parsed.data.amount));
    if (parsed.data.isRecurring !== undefined) data.isRecurring = parsed.data.isRecurring;
    if (parsed.data.verifiedByAccountant !== undefined) data.verifiedByAccountant = parsed.data.verifiedByAccountant;
    if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;

    const adjustment = await prisma.eBITDAAdjustment.update({
      where: { id },
      data,
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(adjustment);
  } catch (err) {
    logger.error("Adjustments PATCH/:id", { err });
    return NextResponse.json({ error: "Failed to update adjustment" }, { status: 500 });
  }
}, { roles: ["owner", "head_office", "admin"] });
