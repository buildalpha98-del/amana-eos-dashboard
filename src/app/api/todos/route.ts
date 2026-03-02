import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const createTodoSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  assigneeId: z.string().min(1, "Assignee is required"),
  rockId: z.string().optional().nullable(),
  issueId: z.string().optional().nullable(),
  dueDate: z.string().min(1, "Due date is required"),
  weekOf: z.string().min(1, "Week is required"),
});

// GET /api/todos — list todos with optional filters
export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
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

  const todos = await prisma.todo.findMany({
    where,
    include: {
      assignee: { select: { id: true, name: true, email: true, avatar: true } },
      rock: { select: { id: true, title: true } },
      issue: { select: { id: true, title: true } },
    },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
  });

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
      rockId: parsed.data.rockId || null,
      issueId: parsed.data.issueId || null,
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

  return NextResponse.json(todo, { status: 201 });
}
