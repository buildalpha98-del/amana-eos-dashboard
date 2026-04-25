import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { recalcFinancialsForWeek } from "@/lib/budget-helpers";
import { withApiAuth } from "@/lib/server-auth";
import { ensureCoordOwnService } from "../../route";

import { parseJsonBody } from "@/lib/api-error";
const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  amount: z.number().positive().optional(),
  category: z.enum([
    "groceries", "kitchen", "sports", "art_craft", "furniture",
    "technology", "cleaning", "safety", "other",
  ]).optional(),
  date: z.string().optional(),
  notes: z.string().max(500).optional().nullable(),
});

// PATCH /api/services/[id]/budget/equipment/[itemId]
export const PATCH = withApiAuth(async (req, session, context) => {
const { id, itemId } = await context!.params!;
  ensureCoordOwnService(
    session.user.role ?? "",
    (session.user as { serviceId?: string | null }).serviceId,
    id,
  );
  const body = await parseJsonBody(req);
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

  // Enforce: the "Other" category needs a non-empty description.
  // Applied to the merged post-update state so a PATCH can't leave the item
  // in an invalid state by e.g. flipping category without clearing notes.
  const effectiveCategory = data.category ?? existing.category;
  const effectiveNotes =
    data.notes !== undefined ? data.notes : existing.notes;
  if (
    effectiveCategory === "other" &&
    (!effectiveNotes || effectiveNotes.trim().length === 0)
  ) {
    return NextResponse.json(
      {
        error: {
          fieldErrors: {
            notes: [
              "Please describe what this item is — the Other category needs a description for later reporting.",
            ],
          },
        },
      },
      { status: 400 }
    );
  }
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

  // Sync financials — recalc new week (and old week if date changed)
  const newDate = data.date ? new Date(data.date) : existing.date;
  await recalcFinancialsForWeek(id, newDate);
  if (data.date && new Date(data.date).getTime() !== existing.date.getTime()) {
    await recalcFinancialsForWeek(id, existing.date);
  }

  return NextResponse.json(item);
}, { roles: ["owner", "head_office", "admin", "coordinator"] });

// DELETE /api/services/[id]/budget/equipment/[itemId]
export const DELETE = withApiAuth(async (req, session, context) => {
const { id, itemId } = await context!.params!;
  ensureCoordOwnService(
    session.user.role ?? "",
    (session.user as { serviceId?: string | null }).serviceId,
    id,
  );

  // Verify item belongs to this service
  const existing = await prisma.budgetItem.findFirst({
    where: { id: itemId, serviceId: id },
    select: { id: true, name: true, date: true },
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

  // Sync financials after deletion
  await recalcFinancialsForWeek(id, existing.date);

  return NextResponse.json({ success: true });
}, { roles: ["owner", "head_office", "admin", "coordinator"] });
