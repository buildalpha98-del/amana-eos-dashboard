import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "../../../_lib/auth";
import { todoUpdateSchema } from "../../../_lib/validation";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

// PATCH /api/cowork/todos/[id] — Mark a todo as complete/incomplete
export const PATCH = withApiHandler(async (req, context) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  try {
    const { id } = await context!.params!;
    const body = await req.json();
    const parsed = todoUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const existing = await prisma.coworkTodo.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Todo not found" }, { status: 404 });
    }

    const updated = await prisma.coworkTodo.update({
      where: { id },
      data: {
        completed: parsed.data.completed,
        completedBy: parsed.data.completed ? (parsed.data.completedBy ?? null) : null,
        completedAt: parsed.data.completed ? new Date() : null,
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    logger.error("Cowork Todos PATCH", { err });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
