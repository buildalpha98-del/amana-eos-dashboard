import { NextRequest, NextResponse } from "next/server";
import { serviceDateOnly } from "@/lib/timezone";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { canEnterScorecardValues } from "@/lib/scorecard-permissions";
import type { Session } from "next-auth";
import { ROLES } from "@/lib/role-enum";

/**
 * Anyone on the measurable's scorecard may enter its weekly number, as well
 * as the roles that always could (src/lib/scorecard-permissions.ts). The
 * route still declares its roles — every role but the read-only eos_viewer —
 * so that refusal happens before any database read.
 */
const ENTRY_ROUTE_ROLES = ROLES.filter((r) => r !== "eos_viewer");
async function assertCanEnter(session: Session, measurable: { scorecardId: string; ownerId: string | null }) {
  const scorecard = await prisma.scorecard.findUnique({
    where: { id: measurable.scorecardId },
    select: { ownerId: true, state: true, members: { select: { userId: true } } },
  });
  const viewer = { id: session.user.id, role: session.user.role, state: session.user.state ?? null };
  if (!scorecard || !canEnterScorecardValues(viewer, scorecard, scorecard.members.map((m) => m.userId), measurable.ownerId)) {
    throw ApiError.forbidden("You're not on this scorecard, so you can't enter its numbers. Ask the scorecard's owner to add you.");
  }
}

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
  await assertCanEnter(session, measurable);

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

  // The week is the CENTRE's (Sydney) Monday, stored as UTC midnight — the
  // same shape the auto-measurables crons write and the grid reads. The
  // grid sends its column as an ISO instant (Mon 00:00 Sydney is still
  // Sunday in UTC); truncating that to UTC midnight stored entries under
  // the SUNDAY, so after the 9 Oct Sydney-date change the grid couldn't
  // find them and typed values "disappeared" on refetch (12 Oct 2026).
  const weekOf = serviceDateOnly(new Date(parsed.data.weekOf));

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
}, { roles: [...ENTRY_ROUTE_ROLES] });

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
    select: { id: true, scorecardId: true, ownerId: true },
  });
  if (!measurable) {
    return NextResponse.json({ error: "Measurable not found" }, { status: 404 });
  }
  await assertCanEnter(session, measurable);

  // Same Sydney-Monday normalisation as the POST, so the unique key matches.
  const weekOf = serviceDateOnly(new Date(parsed.data.weekOf));

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
}, { roles: [...ENTRY_ROUTE_ROLES] });
