import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

/**
 * GET /api/holiday-quest/[id] — single day detail
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  const day = await prisma.holidayQuestDay.findUnique({
    where: { id },
    include: { service: { select: { id: true, name: true, code: true } } },
  });

  if (!day) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(day);
}

/**
 * PATCH /api/holiday-quest/[id] — update a day
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();

  const allowedFields = [
    "theme",
    "morningActivity",
    "afternoonActivity",
    "isExcursion",
    "excursionVenue",
    "excursionCost",
    "materialsNeeded",
    "dietaryNotes",
    "maxCapacity",
    "currentBookings",
    "status",
  ];

  const data: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in body) data[key] = body[key];
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const existing = await prisma.holidayQuestDay.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.holidayQuestDay.update({
    where: { id },
    data,
  });

  return NextResponse.json(updated);
}

/**
 * DELETE /api/holiday-quest/[id] — delete a day
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;

  const existing = await prisma.holidayQuestDay.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.holidayQuestDay.delete({ where: { id } });

  return NextResponse.json({ deleted: true });
}
