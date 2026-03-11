import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { z } from "zod";

const INTEREST_SOURCES = ["interest_book", "verbal", "observation", "parent", "suggestion_box"] as const;

const createSchema = z.object({
  childName: z.string().max(100).optional(),
  interestTopic: z.string().min(1).max(300),
  interestCategory: z.string().max(50).optional(),
  source: z.enum(INTEREST_SOURCES),
  notes: z.string().max(1000).optional(),
});

const patchSchema = z.object({
  actioned: z.boolean().optional(),
  linkedToActivityId: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

// GET /api/services/[id]/interests?actioned=true/false&from=&to=&category=
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const url = new URL(req.url);
  const actioned = url.searchParams.get("actioned");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const category = url.searchParams.get("category");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { serviceId: id };
  if (actioned === "true") where.actioned = true;
  if (actioned === "false") where.actioned = false;
  if (category) where.interestCategory = category;
  if (from || to) {
    where.capturedDate = {};
    if (from) where.capturedDate.gte = new Date(from);
    if (to) where.capturedDate.lte = new Date(to);
  }

  const interests = await prisma.childInterest.findMany({
    where,
    include: {
      capturedBy: { select: { id: true, name: true } },
      linkedToActivity: { select: { id: true, title: true, day: true, weekStart: true } },
    },
    orderBy: { capturedDate: "desc" },
    take: 100,
  });

  return NextResponse.json(interests);
}

// POST /api/services/[id]/interests — create interest
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  const interest = await prisma.childInterest.create({
    data: {
      serviceId: id,
      childName: data.childName || null,
      interestTopic: data.interestTopic,
      interestCategory: data.interestCategory || null,
      source: data.source,
      notes: data.notes || null,
      capturedById: session!.user.id,
    },
    include: {
      capturedBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(interest, { status: 201 });
}

// PATCH /api/services/[id]/interests?interestId=xxx — mark actioned / link to activity
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const url = new URL(req.url);
  const interestId = url.searchParams.get("interestId");
  if (!interestId) {
    return NextResponse.json({ error: "interestId query param required" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.childInterest.findFirst({
    where: { id: interestId, serviceId: id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Interest not found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: any = {};
  if (parsed.data.actioned !== undefined) {
    updateData.actioned = parsed.data.actioned;
    if (parsed.data.actioned) updateData.actionedDate = new Date();
  }
  if (parsed.data.linkedToActivityId !== undefined) {
    updateData.linkedToActivityId = parsed.data.linkedToActivityId;
    updateData.actioned = true;
    updateData.actionedDate = new Date();
  }
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;

  const updated = await prisma.childInterest.update({
    where: { id: interestId },
    data: updateData,
    include: {
      capturedBy: { select: { id: true, name: true } },
      linkedToActivity: { select: { id: true, title: true, day: true, weekStart: true } },
    },
  });

  return NextResponse.json(updated);
}
