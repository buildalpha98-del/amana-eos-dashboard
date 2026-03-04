import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const createTemplateSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  assigneeId: z.string().min(1, "Assignee is required"),
  serviceId: z.string().optional().nullable(),
  recurrence: z.enum(["daily", "weekly", "fortnightly", "monthly", "quarterly"]),
  nextRunAt: z.string().min(1, "Next run date is required"),
});

// GET /api/todo-templates — list all active templates
export async function GET() {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const templates = await prisma.todoTemplate.findMany({
    where: { isActive: true },
    include: {
      assignee: { select: { id: true, name: true, email: true, avatar: true } },
      service: { select: { id: true, name: true, code: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(templates);
}

// POST /api/todo-templates — create a new template
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const body = await req.json();
  const parsed = createTemplateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const template = await prisma.todoTemplate.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      assigneeId: parsed.data.assigneeId,
      serviceId: parsed.data.serviceId || null,
      recurrence: parsed.data.recurrence,
      nextRunAt: new Date(parsed.data.nextRunAt),
      createdById: session!.user.id,
    },
    include: {
      assignee: { select: { id: true, name: true, email: true, avatar: true } },
      service: { select: { id: true, name: true, code: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "TodoTemplate",
      entityId: template.id,
      details: { title: template.title },
    },
  });

  return NextResponse.json(template, { status: 201 });
}
