import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { z } from "zod";

const bulkTodoSchema = z.object({
  todos: z.array(
    z.object({
      title: z.string().min(1).max(500),
      assigneeId: z.string().min(1),
      dueDate: z.string().min(1),
      weekOf: z.string().optional(),
      serviceId: z.string().optional(),
      description: z.string().optional(),
    })
  ).min(1).max(50),
});

export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const body = await req.json();
  const parsed = bulkTodoSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const items = parsed.data.todos;

  // Validate assignees exist
  const assigneeIds = [...new Set(items.map((i) => i.assigneeId))];
  const validUsers = await prisma.user.findMany({
    where: { id: { in: assigneeIds }, active: true },
    select: { id: true },
  });
  const validUserIds = new Set(validUsers.map((u) => u.id));

  const invalidAssignees = assigneeIds.filter((id) => !validUserIds.has(id));
  if (invalidAssignees.length > 0) {
    return NextResponse.json(
      { error: `Invalid assignee IDs: ${invalidAssignees.join(", ")}` },
      { status: 400 }
    );
  }

  // Validate services if provided
  const serviceIds = [...new Set(items.filter((i) => i.serviceId).map((i) => i.serviceId!))];
  if (serviceIds.length > 0) {
    const validServices = await prisma.service.findMany({
      where: { id: { in: serviceIds } },
      select: { id: true },
    });
    const validServiceIds = new Set(validServices.map((s) => s.id));
    const invalidServices = serviceIds.filter((id) => !validServiceIds.has(id));
    if (invalidServices.length > 0) {
      return NextResponse.json(
        { error: `Invalid service IDs: ${invalidServices.join(", ")}` },
        { status: 400 }
      );
    }
  }

  // Create all todos in a transaction
  const defaultWeekOf = new Date();
  defaultWeekOf.setHours(0, 0, 0, 0);
  // Set to Monday of current week
  const dayOfWeek = defaultWeekOf.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  defaultWeekOf.setDate(defaultWeekOf.getDate() + mondayOffset);

  const created = await prisma.$transaction(
    items.map((item) =>
      prisma.todo.create({
        data: {
          title: item.title,
          assigneeId: item.assigneeId,
          createdById: session!.user.id,
          dueDate: new Date(item.dueDate),
          weekOf: item.weekOf ? new Date(item.weekOf) : defaultWeekOf,
          serviceId: item.serviceId || null,
          description: item.description || null,
          status: "pending",
        },
      })
    )
  );

  return NextResponse.json({
    created: created.length,
    todos: created.map((t) => ({ id: t.id, title: t.title })),
  });
}
