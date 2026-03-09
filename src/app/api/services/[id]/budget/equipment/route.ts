import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { z } from "zod";

const equipmentItemSchema = z.object({
  name: z.string().min(1).max(200),
  amount: z.number().positive(),
  category: z.enum([
    "kitchen", "sports", "art_craft", "furniture",
    "technology", "cleaning", "safety", "other",
  ]),
  date: z.string(),
  notes: z.string().max(500).optional(),
});

// GET /api/services/[id]/budget/equipment — list equipment items
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { id } = await params;
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const category = url.searchParams.get("category");

  const where: Record<string, unknown> = { serviceId: id };
  if (from || to) {
    where.date = {};
    if (from) (where.date as Record<string, unknown>).gte = new Date(from);
    if (to) (where.date as Record<string, unknown>).lte = new Date(to);
  }
  if (category) where.category = category;

  const items = await prisma.budgetItem.findMany({
    where,
    include: {
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { date: "desc" },
  });

  return NextResponse.json(items);
}

// POST /api/services/[id]/budget/equipment — create equipment item
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const parsed = equipmentItemSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  // Verify service exists
  const service = await prisma.service.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  const item = await prisma.budgetItem.create({
    data: {
      serviceId: id,
      name: data.name,
      amount: data.amount,
      category: data.category,
      date: new Date(data.date),
      notes: data.notes || null,
      createdById: session!.user.id,
    },
    include: {
      createdBy: { select: { id: true, name: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "BudgetItem",
      entityId: item.id,
      details: { serviceId: id, name: data.name, amount: data.amount, category: data.category },
    },
  });

  return NextResponse.json(item, { status: 201 });
}
