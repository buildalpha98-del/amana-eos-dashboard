import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const patchPulseSchema = z.object({
  wins: z.string().optional(),
  priorities: z.string().optional(),
  blockers: z.string().optional(),
  mood: z.number().min(1).max(5).optional(),
  notes: z.string().optional(),
  submittedAt: z.string().optional().nullable(),
});

// GET /api/communication/pulse/[id] — Single pulse by ID
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  const pulse = await prisma.weeklyPulse.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, avatar: true } },
    },
  });

  if (!pulse) {
    return NextResponse.json({ error: "Pulse not found" }, { status: 404 });
  }

  return NextResponse.json(pulse);
}

// PATCH /api/communication/pulse/[id] — Update pulse fields
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const parsed = patchPulseSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  // Check the pulse exists and verify ownership
  const existing = await prisma.weeklyPulse.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Pulse not found" }, { status: 404 });
  }

  // Only the pulse owner or owner/admin roles can update
  const isOwnerOrAdmin = session!.user.role === "owner" || session!.user.role === "admin";
  if (existing.userId !== session!.user.id && !isOwnerOrAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.wins !== undefined) data.wins = parsed.data.wins;
  if (parsed.data.priorities !== undefined) data.priorities = parsed.data.priorities;
  if (parsed.data.blockers !== undefined) data.blockers = parsed.data.blockers;
  if (parsed.data.mood !== undefined) data.mood = parsed.data.mood;
  if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;
  if (parsed.data.submittedAt !== undefined) {
    data.submittedAt = parsed.data.submittedAt ? new Date(parsed.data.submittedAt) : null;
  }

  const pulse = await prisma.weeklyPulse.update({
    where: { id },
    data,
    include: {
      user: { select: { id: true, name: true, email: true, avatar: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "WeeklyPulse",
      entityId: pulse.id,
      details: { changes: Object.keys(data) },
    },
  });

  return NextResponse.json(pulse);
}

// DELETE /api/communication/pulse/[id] — Hard delete pulse
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  // Check the pulse exists and verify ownership
  const existing = await prisma.weeklyPulse.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Pulse not found" }, { status: 404 });
  }

  // Only the pulse owner or owner/admin roles can delete
  const isOwnerOrAdmin = session!.user.role === "owner" || session!.user.role === "admin";
  if (existing.userId !== session!.user.id && !isOwnerOrAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.weeklyPulse.delete({ where: { id } });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "delete",
      entityType: "WeeklyPulse",
      entityId: id,
      details: { weekOf: existing.weekOf.toISOString() },
    },
  });

  return NextResponse.json({ success: true });
}
