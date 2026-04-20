import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "../../_lib/auth";
import { todosSchema } from "../../_lib/validation";
import { resolveAssignee } from "../_lib/resolve-assignee";
import { withApiHandler } from "@/lib/api-handler";
import { ApiError, parseJsonBody } from "@/lib/api-error";

// POST /api/cowork/todos — Create daily to-dos
export const POST = withApiHandler(async (req: NextRequest) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  const body = await parseJsonBody(req);
  const parsed = todosSchema.safeParse(body);

  if (!parsed.success) {
    throw ApiError.badRequest(parsed.error.issues[0].message);
  }

  const { centreId, date, todos } = parsed.data;

  const resolvedAssignees = await Promise.all(
    todos.map(async (todo) => {
      if (!todo.assignee) return null;
      const userIds = await resolveAssignee({
        assignee: todo.assignee,
        seat: todo.seat ?? undefined,
        serviceCode: centreId,
      });
      return userIds[0] || null;
    })
  );

  const created = await prisma.$transaction(
    todos.map((todo, i) =>
      prisma.coworkTodo.create({
        data: {
          centreId,
          date,
          title: todo.title,
          description: todo.description ?? null,
          category: todo.category,
          dueTime: todo.dueTime ?? null,
          assignedRole: todo.assignedRole ?? todo.assignee ?? null,
          assignedToId: resolvedAssignees[i],
        },
      })
    )
  );

  return NextResponse.json({ todos: created }, { status: 201 });
});

// GET /api/cowork/todos — Retrieve todos
export const GET = withApiHandler(async (req: NextRequest) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const centreId = searchParams.get("centreId");
  const dateParam = searchParams.get("date");

  const dateStr = dateParam ?? new Date().toISOString().split("T")[0];
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw ApiError.badRequest("Invalid date");
  }

  const startOfDay = new Date(date);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setUTCHours(23, 59, 59, 999);

  const where: Record<string, unknown> = {
    date: { gte: startOfDay, lte: endOfDay },
  };
  if (centreId) where.centreId = centreId;

  const todos = await prisma.coworkTodo.findMany({
    where,
    orderBy: [{ dueTime: "asc" }, { category: "asc" }],
  });

  const res = NextResponse.json({ todos });
  res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
  return res;
});
