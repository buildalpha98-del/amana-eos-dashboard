import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  responsibilities: z.array(z.string()).optional(),
  parentId: z.string().nullable().optional(),
  order: z.number().optional(),
  assigneeIds: z.array(z.string()).optional(),
});

// ---------- PATCH /api/accountability-chart/[id] ----------

export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { title, responsibilities, parentId, order, assigneeIds } = parsed.data;

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
    let current: string | null = parentId;
    while (current) {
      const node: { parentId: string | null } | null = await prisma.accountabilitySeat.findUnique({
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

  // Handle assignee changes — atomic delete+create in a transaction
  if (assigneeIds !== undefined) {
    await prisma.$transaction(async (tx) => {
      await tx.accountabilitySeatAssignment.deleteMany({ where: { seatId: id } });
      if (Array.isArray(assigneeIds) && assigneeIds.length > 0) {
        await tx.accountabilitySeatAssignment.createMany({
          data: (assigneeIds as string[]).map((userId: string) => ({ seatId: id, userId })),
        });
      }
    });
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
}, { roles: ["owner", "head_office", "admin"] });

// ---------- DELETE /api/accountability-chart/[id] ----------

export const DELETE = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const existing = await prisma.accountabilitySeat.findUnique({
    where: { id },
    include: { children: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Seat not found" }, { status: 404 });
  }

  // Atomic: reparent children, delete assignments, delete seat
  await prisma.$transaction(async (tx) => {
    if (existing.children.length > 0) {
      await tx.accountabilitySeat.updateMany({
        where: { parentId: id },
        data: { parentId: existing.parentId },
      });
    }

    await tx.accountabilitySeatAssignment.deleteMany({ where: { seatId: id } });
    await tx.accountabilitySeat.delete({ where: { id } });
  });

  return NextResponse.json({ success: true });
}, { roles: ["owner", "head_office", "admin"] });
