import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { getServiceScope } from "@/lib/service-scope";
import { notifyNewIssue } from "@/lib/teams-notify";
import { createIssueSchema } from "@/lib/schemas/issue";
import { parsePagination } from "@/lib/pagination";
import { sendAssignmentEmail } from "@/lib/send-assignment-email";

// GET /api/issues — list issues with optional filters
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const scope = getServiceScope(session);
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

  // Member/staff: only see issues for their service or raised by/owned by them
  if (scope) {
    where.OR = [
      { serviceId: scope },
      { raisedById: session!.user.id },
      { ownerId: session!.user.id },
    ];
  }

  const include = {
    raisedBy: { select: { id: true, name: true, email: true, avatar: true } },
    owner: { select: { id: true, name: true, email: true, avatar: true } },
    rock: { select: { id: true, title: true } },
    _count: {
      select: { spawnedTodos: { where: { deleted: false } } },
    },
  };
  const orderBy = [{ priority: "asc" as const }, { createdAt: "desc" as const }];

  const pagination = parsePagination(searchParams);

  if (pagination) {
    const [items, total] = await Promise.all([
      prisma.issue.findMany({ where, include, orderBy, skip: pagination.skip, take: pagination.limit }),
      prisma.issue.count({ where }),
    ]);
    return NextResponse.json({
      items,
      total,
      page: pagination.page,
      totalPages: Math.ceil(total / pagination.limit),
    });
  }

  const issues = await prisma.issue.findMany({ where, include, orderBy });
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

  // Notify assigned owner via email (fire-and-forget)
  if (issue.ownerId && issue.ownerId !== session!.user.id) {
    sendAssignmentEmail({
      type: "issue",
      assigneeId: issue.ownerId,
      assignerId: session!.user.id,
      entityTitle: issue.title,
    });
  }

  return NextResponse.json(issue, { status: 201 });
}
