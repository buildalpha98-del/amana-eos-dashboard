import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// PATCH /api/measurables/[id] — update a measurable
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();

  const data: Record<string, unknown> = {};
  const fields = ["title", "description", "ownerId", "goalValue", "goalDirection", "unit", "frequency"];

  for (const f of fields) {
    if (body[f] !== undefined) data[f] = body[f];
  }

  const measurable = await prisma.measurable.update({
    where: { id },
    data,
    include: {
      owner: { select: { id: true, name: true, email: true, avatar: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "Measurable",
      entityId: measurable.id,
      details: { changes: Object.keys(data) },
    },
  });

  return NextResponse.json(measurable);
}

// DELETE /api/measurables/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;

  await prisma.measurable.delete({ where: { id } });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "delete",
      entityType: "Measurable",
      entityId: id,
      details: {},
    },
  });

  return NextResponse.json({ success: true });
}
