import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const updateEntrySchema = z.object({
  channel: z
    .enum([
      "social",
      "canva",
      "newsletter",
      "school_comms",
      "activation",
      "whatsapp",
      "compliance",
      "holiday_quest",
    ])
    .optional(),
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z
    .enum(["planned", "in_progress", "completed", "skipped"])
    .optional(),
  assigneeId: z.string().nullable().optional(),
  campaignId: z.string().nullable().optional(),
  week: z.number().int().min(1).max(10).optional(),
});

const entryIncludes = {
  service: { select: { id: true, name: true, code: true } },
  assignee: { select: { id: true, name: true, avatar: true } },
  campaign: { select: { id: true, name: true } },
} as const;

// PATCH /api/marketing/term-calendar/[id] — update an entry
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin", "marketing"]);
  if (error) return error;

  const { id } = await params;

  const existing = await prisma.termCalendarEntry.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Term calendar entry not found" },
      { status: 404 },
    );
  }

  const body = await req.json();
  const parsed = updateEntrySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const entry = await prisma.termCalendarEntry.update({
    where: { id },
    data: parsed.data,
    include: entryIncludes,
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "TermCalendarEntry",
      entityId: entry.id,
      details: { fields: Object.keys(parsed.data) },
    },
  });

  return NextResponse.json(entry);
}

// DELETE /api/marketing/term-calendar/[id] — delete an entry
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin", "marketing"]);
  if (error) return error;

  const { id } = await params;

  const existing = await prisma.termCalendarEntry.findUnique({
    where: { id },
    select: { id: true, title: true },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Term calendar entry not found" },
      { status: 404 },
    );
  }

  await prisma.termCalendarEntry.delete({ where: { id } });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "delete",
      entityType: "TermCalendarEntry",
      entityId: id,
      details: { title: existing.title },
    },
  });

  return NextResponse.json({ success: true });
}
