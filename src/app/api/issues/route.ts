import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { notifyNewIssue } from "@/lib/teams-notify";

const createIssueSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  ownerId: z.string().optional().nullable(),
  rockId: z.string().optional().nullable(),
  serviceId: z.string().optional().nullable(),
  priority: z.enum(["critical", "high", "medium", "low"]).default("medium"),
});

// GET /api/issues — list issues with optional filters
export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const priority = searchParams.get("priority");
  const ownerId = searchParams.get("ownerId");
  const rockId = searchParams.get("rockId");
  const serviceId = searchParams.get("serviceId");

  const where: Record<string, unknown> = { deleted: false };

  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (ownerId) where.ownerId = ownerId;
  if (rockId) where.rockId = rockId;
  if (serviceId) where.serviceId = serviceId;

  const issues = await prisma.issue.findMany({
    where,
    include: {
      raisedBy: { select: { id: true, name: true, email: true, avatar: true } },
      owner: { select: { id: true, name: true, email: true, avatar: true } },
      rock: { select: { id: true, title: true } },
      _count: {
        select: { spawnedTodos: { where: { deleted: false } } },
      },
    },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(issues);
}

// POST /api/issues — create a new issue
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const body = await req.json();
  const parsed = createIssueSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const issue = await prisma.issue.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      raisedById: session!.user.id,
      ownerId: parsed.data.ownerId || null,
      rockId: parsed.data.rockId || null,
      serviceId: parsed.data.serviceId || null,
      priority: parsed.data.priority,
    },
    include: {
      raisedBy: { select: { id: true, name: true, email: true, avatar: true } },
      owner: { select: { id: true, name: true, email: true, avatar: true } },
      rock: { select: { id: true, title: true } },
      _count: {
        select: { spawnedTodos: { where: { deleted: false } } },
      },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "Issue",
      entityId: issue.id,
      details: { title: issue.title, priority: issue.priority },
    },
  });

  // Teams notification for high/critical issues (fire-and-forget)
  if (["critical", "high"].includes(issue.priority)) {
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    notifyNewIssue({
      title: issue.title,
      priority: issue.priority,
      raisedBy: issue.raisedBy?.name || session!.user.name || "Unknown",
      url: `${baseUrl}/issues`,
    }).catch(() => {});
  }

  return NextResponse.json(issue, { status: 201 });
}
