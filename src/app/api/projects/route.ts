import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
const createProjectSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  serviceId: z.string().optional().nullable(),
  templateId: z.string().optional().nullable(),
  ownerId: z.string().min(1, "Owner is required"),
  startDate: z.string().optional().nullable(),
  targetDate: z.string().optional().nullable(),
});

// GET /api/projects
export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const serviceId = searchParams.get("serviceId");
  const ownerId = searchParams.get("ownerId");

  const where: Record<string, unknown> = { deleted: false };
  if (status) where.status = status;
  if (serviceId) where.serviceId = serviceId;
  if (ownerId) where.ownerId = ownerId;

  const projects = await prisma.project.findMany({
    where,
    include: {
      owner: { select: { id: true, name: true, email: true, avatar: true } },
      service: { select: { id: true, name: true, code: true } },
      template: { select: { id: true, name: true } },
      _count: {
        select: {
          todos: { where: { deleted: false } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Add computed progress for each project
  const projectsWithProgress = await Promise.all(
    projects.map(async (p) => {
      const totalTodos = await prisma.todo.count({
        where: { projectId: p.id, deleted: false },
      });
      const completedTodos = await prisma.todo.count({
        where: { projectId: p.id, deleted: false, status: "complete" },
      });
      return {
        ...p,
        progress: {
          total: totalTodos,
          completed: completedTodos,
          percent: totalTodos > 0 ? Math.round((completedTodos / totalTodos) * 100) : 0,
        },
      };
    })
  );

  return NextResponse.json(projectsWithProgress);
});

// POST /api/projects
export const POST = withApiAuth(async (req, session) => {
const body = await parseJsonBody(req);
  const parsed = createProjectSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const project = await prisma.project.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description || null,
      serviceId: parsed.data.serviceId || null,
      templateId: parsed.data.templateId || null,
      ownerId: parsed.data.ownerId,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
      targetDate: parsed.data.targetDate ? new Date(parsed.data.targetDate) : null,
    },
    include: {
      owner: { select: { id: true, name: true, email: true, avatar: true } },
      service: { select: { id: true, name: true, code: true } },
    },
  });

  // If created from a template, generate todos from template tasks
  if (parsed.data.templateId) {
    const templateTasks = await prisma.projectTemplateTask.findMany({
      where: { templateId: parsed.data.templateId },
      orderBy: { sortOrder: "asc" },
    });

    const today = new Date();
    const weekOf = new Date(today);
    weekOf.setDate(weekOf.getDate() - weekOf.getDay() + 1); // Monday of this week

    for (const task of templateTasks) {
      const dueDate = new Date(today);
      if (task.defaultDays) {
        dueDate.setDate(dueDate.getDate() + task.defaultDays);
      } else {
        dueDate.setDate(dueDate.getDate() + 14); // default 2 weeks
      }

      await prisma.todo.create({
        data: {
          title: task.title,
          description: task.description,
          assigneeId: parsed.data.ownerId,
          createdById: session!.user.id,
          projectId: project.id,
          serviceId: parsed.data.serviceId || null,
          dueDate,
          weekOf,
          status: "pending",
        },
      });
    }
  }

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "Project",
      entityId: project.id,
      details: { name: project.name, templateId: parsed.data.templateId },
    },
  });

  return NextResponse.json(project, { status: 201 });
  // 2026-04-30: opened up to coordinator + member for service-level projects.
}, { roles: ["owner", "head_office", "admin", "member"] });
