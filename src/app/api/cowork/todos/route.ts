import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "../../_lib/auth";
import { todosSchema } from "../../_lib/validation";

// POST /api/cowork/todos — Create daily to-dos
export async function POST(req: NextRequest) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const parsed = todosSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { centreId, date, todos } = parsed.data;

    // Create all todos in a single transaction
    const created = await prisma.$transaction(
      todos.map((todo) =>
        prisma.coworkTodo.create({
          data: {
            centreId,
            date,
            title: todo.title,
            description: todo.description ?? null,
            category: todo.category,
            dueTime: todo.dueTime ?? null,
            assignedRole: todo.assignedRole ?? null,
          },
        })
      )
    );

    return NextResponse.json({ todos: created }, { status: 201 });
  } catch (err) {
    console.error("[Cowork Todos POST]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET /api/cowork/todos — Retrieve todos
export async function GET(req: NextRequest) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const centreId = searchParams.get("centreId");
    const dateParam = searchParams.get("date");

    // Default to today if no date provided
    const dateStr = dateParam ?? new Date().toISOString().split("T")[0];
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    // Query for the entire day
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

    return NextResponse.json({ todos });
  } catch (err) {
    console.error("[Cowork Todos GET]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
