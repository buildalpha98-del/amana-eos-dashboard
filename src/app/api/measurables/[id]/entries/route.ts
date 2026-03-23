import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";

const entrySchema = z.object({
  weekOf: z.string().min(1, "Week is required"),
  value: z.number(),
  notes: z.string().optional(),
});

// POST /api/measurables/[id]/entries — create or update an entry
export const POST = withApiAuth(async (req, session, context) => {
const { id: measurableId } = await context!.params!;
  const body = await parseJsonBody(req);
  const parsed = entrySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  // Get measurable to check goal
  const measurable = await prisma.measurable.findUnique({
    where: { id: measurableId },
  });

  if (!measurable) {
    return NextResponse.json({ error: "Measurable not found" }, { status: 404 });
  }

  // Determine if on track
  const value = parsed.data.value;
  let onTrack = false;
  switch (measurable.goalDirection) {
    case "above":
      onTrack = value >= measurable.goalValue;
      break;
    case "below":
      onTrack = value <= measurable.goalValue;
      break;
    case "exact":
      onTrack = value === measurable.goalValue;
      break;
  }

  const weekOf = new Date(parsed.data.weekOf);
  // Normalize to UTC midnight to prevent timezone drift on upsert
  weekOf.setUTCHours(0, 0, 0, 0);

  // Upsert — allows re-entering data for the same week
  const entry = await prisma.measurableEntry.upsert({
    where: {
      measurableId_weekOf: {
        measurableId,
        weekOf,
      },
    },
    update: {
      value,
      onTrack,
      notes: parsed.data.notes || null,
      enteredById: session!.user.id,
    },
    create: {
      measurableId,
      weekOf,
      value,
      onTrack,
      notes: parsed.data.notes || null,
      enteredById: session!.user.id,
    },
    include: {
      enteredBy: { select: { id: true, name: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "entry",
      entityType: "Measurable",
      entityId: measurableId,
      details: { value, weekOf: weekOf.toISOString(), onTrack },
    },
  });

  return NextResponse.json(entry, { status: 201 });
});
