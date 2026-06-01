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

const deleteQuerySchema = z.object({
  weekOf: z.string().min(1, "weekOf is required"),
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

// DELETE /api/measurables/[id]/entries?weekOf=ISO
//
// Clears a specific week's entry. Idempotent — if no row exists for
// the given week we still 200. Lets users wipe out bad values they
// previously entered (no edit-to-blank affordance otherwise).
export const DELETE = withApiAuth(async (req, session, context) => {
  const { id: measurableId } = await context!.params!;
  const { searchParams } = new URL(req.url);
  const parsed = deleteQuerySchema.safeParse({
    weekOf: searchParams.get("weekOf"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  // Confirm the measurable exists so a typo'd ID doesn't 200 quietly.
  const measurable = await prisma.measurable.findUnique({
    where: { id: measurableId },
    select: { id: true },
  });
  if (!measurable) {
    return NextResponse.json({ error: "Measurable not found" }, { status: 404 });
  }

  const weekOf = new Date(parsed.data.weekOf);
  // Normalise to UTC midnight — same as the POST upsert so the
  // compound unique key matches.
  weekOf.setUTCHours(0, 0, 0, 0);

  // Idempotent — swallow Prisma's P2025 (record not found) so callers
  // can hammer DELETE on already-empty cells without an error.
  try {
    await prisma.measurableEntry.delete({
      where: {
        measurableId_weekOf: {
          measurableId,
          weekOf,
        },
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "entry_clear",
        entityType: "Measurable",
        entityId: measurableId,
        details: { weekOf: weekOf.toISOString() },
      },
    });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code !== "P2025") throw err;
  }

  return NextResponse.json({ ok: true });
});
