import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";

/**
 * POST /api/cowork/finance/budget
 * Create budget items for a service.
 * Used by: fin-weekly-spend-tracker, fin-supply-budget-monitor, fin-grocery-cost-tracker
 */
export async function POST(req: NextRequest) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  const body = await req.json();
  const { serviceCode, items } = body;

  if (!serviceCode || !items || !Array.isArray(items)) {
    return NextResponse.json(
      { error: "Bad Request", message: "serviceCode and items[] required" },
      { status: 400 }
    );
  }

  const service = await prisma.service.findUnique({
    where: { code: serviceCode },
    select: { id: true, name: true },
  });

  if (!service) {
    return NextResponse.json(
      { error: "Not Found", message: `Service ${serviceCode} not found` },
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
}
