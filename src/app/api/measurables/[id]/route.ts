import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const updateMeasurableSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  ownerId: z.string().nullable().optional(),
  goalValue: z.number().optional(),
  goalDirection: z.enum(["above", "below", "exact"]).optional(),
  unit: z.string().nullable().optional(),
  frequency: z.enum(["weekly", "monthly"]).optional(),
  serviceId: z.string().nullable().optional(),
});

// PATCH /api/measurables/[id] — update a measurable
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const parsed = updateMeasurableSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.description !== undefined) data.description = parsed.data.description;
  if (parsed.data.ownerId !== undefined) data.ownerId = parsed.data.ownerId;
  if (parsed.data.goalValue !== undefined) data.goalValue = parsed.data.goalValue;
  if (parsed.data.goalDirection !== undefined) data.goalDirection = parsed.data.goalDirection;
  if (parsed.data.unit !== undefined) data.unit = parsed.data.unit;
  if (parsed.data.frequency !== undefined) data.frequency = parsed.data.frequency;
  if (parsed.data.serviceId !== undefined) data.serviceId = parsed.data.serviceId;

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
