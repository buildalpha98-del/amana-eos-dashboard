import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const createRockSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  ownerId: z.string().min(1, "Owner is required"),
  quarter: z.string().min(1, "Quarter is required"),
  priority: z.enum(["critical", "high", "medium"]).default("medium"),
  rockType: z.enum(["company", "personal"]).default("personal"),
  oneYearGoalId: z.string().optional().nullable(),
  serviceId: z.string().optional().nullable(),
});

// GET /api/rocks — list rocks with optional quarter filter
export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const quarter = searchParams.get("quarter");
  const serviceId = searchParams.get("serviceId");

  const rockType = searchParams.get("rockType");

  const where: Record<string, unknown> = { deleted: false };
  if (quarter) where.quarter = quarter;
  if (serviceId) where.serviceId = serviceId;
  if (rockType) where.rockType = rockType;

  const rocks = await prisma.rock.findMany({
    where,
    include: {
      owner: { select: { id: true, name: true, email: true, avatar: true } },
      oneYearGoal: { select: { id: true, title: true } },
      _count: {
        select: {
          todos: { where: { deleted: false } },
          issues: { where: { deleted: false } },
          milestones: true,
        },
      },
    },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(rocks);
}

// POST /api/rocks — create a new rock
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const body = await req.json();
  const parsed = createRockSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const rock = await prisma.rock.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      ownerId: parsed.data.ownerId,
      quarter: parsed.data.quarter,
      priority: parsed.data.priority,
      rockType: parsed.data.rockType,
      oneYearGoalId: parsed.data.oneYearGoalId || null,
      serviceId: parsed.data.serviceId || null,
    },
    include: {
      owner: { select: { id: true, name: true, email: true, avatar: true } },
      oneYearGoal: { select: { id: true, title: true } },
      _count: {
        select: {
          todos: { where: { deleted: false } },
          issues: { where: { deleted: false } },
          milestones: true,
        },
      },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "Rock",
      entityId: rock.id,
      details: { title: rock.title, quarter: rock.quarter },
    },
  });

  return NextResponse.json(rock, { status: 201 });
}
