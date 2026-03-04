import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// ---------- PATCH /api/accountability-chart/[id] ----------

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const { title, responsibilities, parentId, order, assigneeIds } = body;

  // Verify seat exists
  const existing = await prisma.accountabilitySeat.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Seat not found" }, { status: 404 });
  }

  // Prevent setting parentId to self or descendant (circular reference)
  if (parentId !== undefined && parentId !== null) {
    if (parentId === id) {
      return NextResponse.json({ error: "Cannot set seat as its own parent" }, { status: 400 });
    }
    // Walk up tree to check for circular reference
    let current = parentId;
    while (current) {
      const node = await prisma.accountabilitySeat.findUnique({
        where: { id: current },
        select: { parentId: true },
      });
      if (!node) break;
      if (node.parentId === id) {
        return NextResponse.json({ error: "Cannot create circular hierarchy" }, { status: 400 });
      }
      current = node.parentId;
    }
  }

  // Build update data
  const updateData: Record<string, unknown> = {};
  if (title !== undefined) updateData.title = title.trim();
  if (responsibilities !== undefined) updateData.responsibilities = responsibilities;
  if (parentId !== undefined) updateData.parentId = parentId;
  if (order !== undefined) updateData.order = order;

  // Handle assignee changes
  if (assigneeIds !== undefined) {
    // Delete old assignments and create new ones
    await prisma.accountabilitySeatAssignment.deleteMany({ where: { seatId: id } });
    if (Array.isArray(assigneeIds) && assigneeIds.length > 0) {
      await prisma.accountabilitySeatAssignment.createMany({
        data: (assigneeIds as string[]).map((userId: string) => ({ seatId: id, userId })),
      });
    }
  }

  const seat = await prisma.accountabilitySeat.update({
    where: { id },
    data: updateData,
    include: {
      assignees: {
        include: {
          user: { select: { id: true, name: true, avatar: true } },
        },
      },
    },
  });

  return NextResponse.json(seat);
}

// ---------- DELETE /api/accountability-chart/[id] ----------

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;

  const existing = await prisma.accountabilitySeat.findUnique({
    where: { id },
    include: { children: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Seat not found" }, { status: 404 });
  }

  // Reparent children to the deleted seat's parent (not cascade delete)
  if (existing.children.length > 0) {
    await prisma.accountabilitySeat.updateMany({
      where: { parentId: id },
      data: { parentId: existing.parentId },
    });
  }

  // Delete assignments + seat
  await prisma.accountabilitySeatAssignment.deleteMany({ where: { seatId: id } });
  await prisma.accountabilitySeat.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
