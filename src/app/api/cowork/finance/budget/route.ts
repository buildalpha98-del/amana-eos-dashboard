import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

import { parseJsonBody } from "@/lib/api-error";
const budgetItemSchema = z.object({
  name: z.string().min(1),
  amount: z.number(),
  category: z.enum(["groceries", "kitchen", "sports", "art_craft", "furniture", "technology", "cleaning", "safety", "other"]).optional(),
  date: z.string().min(1),
  notes: z.string().nullable().optional(),
});

const bodySchema = z.object({
  serviceCode: z.string().min(1),
  items: z.array(budgetItemSchema).min(1),
});

/**
 * POST /api/cowork/finance/budget
 * Create budget items for a service.
 * Used by: fin-weekly-spend-tracker, fin-supply-budget-monitor, fin-grocery-cost-tracker
 */
export const POST = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = await parseJsonBody(req);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { serviceCode, items } = parsed.data;

    const service = await prisma.service.findUnique({
      where: { code: serviceCode },
      select: { id: true, name: true },
    });

    if (!service) {
      return NextResponse.json(
        { error: `Service ${serviceCode} not found` },
        { status: 404 }
      );
    }

    let created = 0;
    let totalAmount = 0;
    for (const item of items) {
      await prisma.budgetItem.create({
        data: {
          serviceId: service.id,
          name: item.name,
          amount: item.amount,
          category: item.category || "other",
          date: new Date(item.date + "T00:00:00Z"),
          notes: item.notes || null,
        },
      });
      created++;
      totalAmount += item.amount || 0;
    }

    return NextResponse.json(
      {
        message: "Budget items created",
        serviceCode,
        created,
        totalAmount,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("POST /cowork/finance/budget", { err });
    return NextResponse.json(
      { error: "Internal Server Error", message },
      { status: 500 }
    );
  }
});
