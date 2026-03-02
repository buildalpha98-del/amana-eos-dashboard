import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const createMeasurableSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  ownerId: z.string().min(1, "Owner is required"),
  goalValue: z.number(),
  goalDirection: z.enum(["above", "below", "exact"]),
  unit: z.string().optional().nullable(),
  frequency: z.enum(["weekly", "monthly"]).optional(),
});

// POST /api/measurables — create a new measurable
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const body = await req.json();
  const parsed = createMeasurableSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  // Find or create default scorecard
  let scorecard = await prisma.scorecard.findFirst();
  if (!scorecard) {
    scorecard = await prisma.scorecard.create({
      data: { title: "Weekly Leadership Scorecard" },
    });
  }

  const measurable = await prisma.measurable.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      ownerId: parsed.data.ownerId,
      goalValue: parsed.data.goalValue,
      goalDirection: parsed.data.goalDirection,
      unit: parsed.data.unit || null,
      frequency: parsed.data.frequency || "weekly",
      scorecardId: scorecard.id,
    },
    include: {
      owner: { select: { id: true, name: true, email: true, avatar: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "Measurable",
      entityId: measurable.id,
      details: { title: measurable.title },
    },
  });

  return NextResponse.json(measurable, { status: 201 });
}
