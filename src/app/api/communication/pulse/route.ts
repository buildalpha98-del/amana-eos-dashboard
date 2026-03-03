import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const pulseUpsertSchema = z.object({
  weekOf: z.string().min(1, "weekOf is required"),
  wins: z.string().optional(),
  priorities: z.string().optional(),
  blockers: z.string().optional(),
  mood: z.number().min(1).max(5).optional(),
  notes: z.string().optional(),
  submitted: z.boolean().optional(),
});

// GET /api/communication/pulse — List weekly pulses
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const weekOf = searchParams.get("weekOf");
  const userId = searchParams.get("userId");

  const where: Record<string, unknown> = {};

  if (weekOf) {
    where.weekOf = new Date(weekOf);
  }

  // Members can only view their own pulses
  if (session!.user.role === "member") {
    where.userId = session!.user.id;
  } else if (userId) {
    // Owner/admin can filter by specific user
    where.userId = userId;
  }
  // If owner/admin and no userId filter, return all pulses for that week

  const pulses = await prisma.weeklyPulse.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, email: true, avatar: true } },
    },
    orderBy: [
      { weekOf: "desc" },
      { user: { name: "asc" } },
    ],
  });

  return NextResponse.json(pulses);
}

// POST /api/communication/pulse — Create or update weekly pulse (upsert)
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const body = await req.json();
  const parsed = pulseUpsertSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const weekOfDate = new Date(parsed.data.weekOf);
  const userId = session!.user.id;

  const data: Record<string, unknown> = {};
  if (parsed.data.wins !== undefined) data.wins = parsed.data.wins;
  if (parsed.data.priorities !== undefined) data.priorities = parsed.data.priorities;
  if (parsed.data.blockers !== undefined) data.blockers = parsed.data.blockers;
  if (parsed.data.mood !== undefined) data.mood = parsed.data.mood;
  if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;
  if (parsed.data.submitted === true) data.submittedAt = new Date();

  const pulse = await prisma.weeklyPulse.upsert({
    where: {
      userId_weekOf: {
        userId,
        weekOf: weekOfDate,
      },
    },
    create: {
      userId,
      weekOf: weekOfDate,
      wins: parsed.data.wins || null,
      priorities: parsed.data.priorities || null,
      blockers: parsed.data.blockers || null,
      mood: parsed.data.mood || null,
      notes: parsed.data.notes || null,
      submittedAt: parsed.data.submitted === true ? new Date() : null,
    },
    update: data,
    include: {
      user: { select: { id: true, name: true, email: true, avatar: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "upsert",
      entityType: "WeeklyPulse",
      entityId: pulse.id,
      details: { weekOf: parsed.data.weekOf, changes: Object.keys(data) },
    },
  });

  return NextResponse.json(pulse);
}
