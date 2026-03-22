import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";

const patchSchema = z.object({
  itemId: z.string().min(1).optional(),
  checked: z.boolean().optional(),
  notes: z.string().optional(),
  status: z.string().optional(),
});

/**
 * PATCH /api/services/[id]/checklists/[checklistId]
 * Toggle checklist items, update status, add notes.
 * Used by the dashboard Checklists tab to mark items checked/unchecked.
 */
export const PATCH = withApiAuth(async (req, session, context) => {
  const userId = session!.user.id;
  const { id, checklistId } = await context!.params!;

  // Verify the checklist exists and belongs to this service
  const checklist = await prisma.dailyChecklist.findFirst({
    where: { id: checklistId, serviceId: id },
    include: { items: true },
  });

  if (!checklist) {
    return NextResponse.json(
      { error: "Checklist not found" },
      { status: 404 }
    );
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { itemId, checked, notes, status } = parsed.data;

  // Toggle a specific item
  if (itemId) {
    const item = checklist.items.find((i) => i.id === itemId);
    if (!item) {
      return NextResponse.json(
        { error: "Checklist item not found" },
        { status: 404 }
      );
    }

    await prisma.dailyChecklistItem.update({
      where: { id: itemId },
      data: {
        checked: checked ?? !item.checked,
        checkedAt: checked !== false ? new Date() : null,
        checkedById: checked !== false ? userId : null,
        notes: notes !== undefined ? notes : undefined,
      },
    });
  }

  // Update checklist-level fields
  if (notes !== undefined && !itemId) {
    await prisma.dailyChecklist.update({
      where: { id: checklistId },
      data: { notes },
    });
  }

  if (status) {
    const updateData: Record<string, unknown> = { status };
    if (status === "completed") {
      updateData.completedAt = new Date();
      updateData.completedById = userId;
    }
    await prisma.dailyChecklist.update({
      where: { id: checklistId },
      data: updateData,
    });
  }

  // Auto-complete checklist if all required items are checked
  if (itemId) {
    const updatedChecklist = await prisma.dailyChecklist.findUnique({
      where: { id: checklistId },
      include: { items: true },
    });

    if (updatedChecklist) {
      const requiredItems = updatedChecklist.items.filter((i) => i.isRequired);
      const allChecked = requiredItems.every((i) => i.checked);

      if (allChecked && updatedChecklist.status === "pending") {
        await prisma.dailyChecklist.update({
          where: { id: checklistId },
          data: {
            status: "completed",
            completedAt: new Date(),
            completedById: userId,
          },
        });
      }
    }
  }

  // Return updated checklist
  const updated = await prisma.dailyChecklist.findUnique({
    where: { id: checklistId },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      completedBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ checklist: updated });
});

/**
 * GET /api/services/[id]/checklists/[checklistId]
 * Get a single checklist with its items.
 */
export const GET = withApiAuth(async (req, session, context) => {
  const { id, checklistId } = await context!.params!;

  const checklist = await prisma.dailyChecklist.findFirst({
    where: { id: checklistId, serviceId: id },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          checkedBy: { select: { id: true, name: true } },
        },
      },
      completedBy: { select: { id: true, name: true } },
    },
  });

  if (!checklist) {
    return NextResponse.json(
      { error: "Checklist not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ checklist });
});
