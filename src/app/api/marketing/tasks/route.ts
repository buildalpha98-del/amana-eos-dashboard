import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  status: z
    .enum(["todo", "in_progress", "in_review", "done"])
    .default("todo"),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  dueDate: z.coerce.date().optional(),
  assigneeId: z.string().optional(),
  campaignId: z.string().optional(),
  postId: z.string().optional(),
  serviceId: z.string().optional(),
});

const taskIncludes = {
  assignee: { select: { id: true, name: true, avatar: true } },
  campaign: { select: { id: true, name: true } },
  post: { select: { id: true, title: true } },
  service: { select: { id: true, name: true, code: true } },
} as const;

// GET /api/marketing/tasks — list tasks with optional filters
export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const priority = searchParams.get("priority");
  const assigneeId = searchParams.get("assigneeId");
  const campaignId = searchParams.get("campaignId");
  const serviceId = searchParams.get("serviceId");

  const tasks = await prisma.marketingTask.findMany({
    where: {
      deleted: false,
      ...(status ? { status: status as any } : {}),
      ...(priority ? { priority: priority as any } : {}),
      ...(assigneeId ? { assigneeId } : {}),
      ...(campaignId ? { campaignId } : {}),
      ...(serviceId ? { serviceId } : {}),
    },
    include: taskIncludes,
    orderBy: [
      { dueDate: { sort: "asc", nulls: "last" } },
      { createdAt: "desc" },
    ],
  });

  return NextResponse.json(tasks);
}, { roles: ["owner", "head_office", "admin", "marketing"] });

// POST /api/marketing/tasks — create a new task
export const POST = withApiAuth(async (req, session) => {
const body = await req.json();
  const parsed = createTaskSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const task = await prisma.marketingTask.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      status: parsed.data.status,
      priority: parsed.data.priority,
      dueDate: parsed.data.dueDate || null,
      assigneeId: parsed.data.assigneeId || null,
      campaignId: parsed.data.campaignId || null,
      postId: parsed.data.postId || null,
      serviceId: parsed.data.serviceId || null,
    },
    include: taskIncludes,
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "MarketingTask",
      entityId: task.id,
      details: { title: task.title },
    },
  });

  return NextResponse.json(task, { status: 201 });
}, { roles: ["owner", "head_office", "admin", "marketing"] });
