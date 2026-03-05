import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { getServiceScope } from "@/lib/service-scope";
import { createTodoSchema } from "@/lib/schemas/todo";
import { parsePagination } from "@/lib/pagination";
import { sendAssignmentEmail } from "@/lib/send-assignment-email";

// GET /api/todos — list todos with optional filters
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const weekOf = searchParams.get("weekOf");
  const assigneeId = searchParams.get("assigneeId");
  const status = searchParams.get("status");
  const rockId = searchParams.get("rockId");

  const where: Record<string, unknown> = { deleted: false };

  if (weekOf) {
    where.weekOf = new Date(weekOf);
  }
  if (assigneeId) {
    where.assigneeId = assigneeId;
  }
  if (status) {
    where.status = status;
  }
  if (rockId) {
    where.rockId = rockId;
  }
  const serviceId = searchParams.get("serviceId");
  if (serviceId) {
    where.serviceId = serviceId;
  }

  // Staff scoping: only see todos assigned to them or related to their centre
  const scope = getServiceScope(session);
  if (scope) {
    where.OR = [
      { assigneeId: session!.user.id },
      { serviceId: scope },
    ];
  }

  const include = {
    assignee: { select: { id: true, name: true, email: true, avatar: true } },
    rock: { select: { id: true, title: true } },
    issue: { select: { id: true, title: true } },
  };
  const orderBy = [{ status: "asc" as const }, { dueDate: "asc" as const }, { createdAt: "desc" as const }];

  const pagination = parsePagination(searchParams);

  if (pagination) {
    const [items, total] = await Promise.all([
      prisma.todo.findMany({ where, include, orderBy, skip: pagination.skip, take: pagination.limit }),
      prisma.todo.count({ where }),
    ]);
    return NextResponse.json({
      items,
      total,
      page: pagination.page,
      totalPages: Math.ceil(total / pagination.limit),
    });
  }

  const todos = await prisma.todo.findMany({ where, include, orderBy });
  return NextResponse.json(todos);
}

// POST /api/todos — create a new todo
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const body = await req.json();
  const parsed = createTodoSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const todo = await prisma.todo.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      assigneeId: parsed.data.assigneeId,
      createdById: session!.user.id,
      rockId: parsed.data.rockId || null,
      issueId: parsed.data.issueId || null,
      serviceId: parsed.data.serviceId || null,
      projectId: parsed.data.projectId || null,
      isPrivate: parsed.data.isPrivate ?? false,
      dueDate: new Date(parsed.data.dueDate),
      weekOf: new Date(parsed.data.weekOf),
    },
    include: {
      assignee: { select: { id: true, name: true, email: true, avatar: true } },
      rock: { select: { id: true, title: true } },
      issue: { select: { id: true, title: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "Todo",
      entityId: todo.id,
      details: { title: todo.title },
    },
  });

  // Notify assignee via email (fire-and-forget)
  if (todo.assigneeId && todo.assigneeId !== session!.user.id) {
    sendAssignmentEmail({
      type: "todo",
      assigneeId: todo.assigneeId,
      assignerId: session!.user.id,
      entityTitle: todo.title,
    });
  }

  return NextResponse.json(todo, { status: 201 });
}
