import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  amount: z.number().positive().optional(),
  category: z.enum([
    "kitchen", "sports", "art_craft", "furniture",
    "technology", "cleaning", "safety", "other",
  ]).optional(),
  date: z.string().optional(),
  notes: z.string().max(500).optional().nullable(),
});

// PATCH /api/services/[id]/budget/equipment/[itemId]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { id, itemId } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Verify item belongs to this service
  const existing = await prisma.budgetItem.findFirst({
    where: { id: itemId, serviceId: id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Budget item not found" }, { status: 404 });
  }

  const data = parsed.data;
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.amount !== undefined) updateData.amount = data.amount;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.date !== undefined) updateData.date = new Date(data.date);
  if (data.notes !== undefined) updateData.notes = data.notes;

  const item = await prisma.budgetItem.update({
    where: { id: itemId },
    data: updateData,
    include: {
      createdBy: { select: { id: true, name: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "BudgetItem",
      entityId: itemId,
      details: { serviceId: id, changes: Object.keys(updateData) },
    },
  });

  return NextResponse.json(item);
}

// DELETE /api/services/[id]/budget/equipment/[itemId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { id, itemId } = await params;

  // Verify item belongs to this service
  const existing = await prisma.budgetItem.findFirst({
    where: { id: itemId, serviceId: id },
    select: { id: true, name: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Budget item not found" }, { status: 404 });
  }

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "delete",
      entityType: "BudgetItem",
      entityId: itemId,
      details: { serviceId: id, name: existing.name },
    },
  });

  await prisma.budgetItem.delete({ where: { id: itemId } });

  return NextResponse.json({ success: true });
}
