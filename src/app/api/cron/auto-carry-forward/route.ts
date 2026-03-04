import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/cron/auto-carry-forward
 *
 * Weekly cron (Monday 6 AM AEST) — carries forward incomplete todos
 * from previous weeks into the current week.
 *
 * Logic: finds todos where status = pending/in_progress, weekOf < thisMonday,
 * and updates weekOf to current Monday so they appear in the current week's view.
 *
 * Auth: Bearer CRON_SECRET
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();

    // Calculate this Monday
    const dayOfWeek = now.getDay();
    const thisMonday = new Date(now);
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    thisMonday.setDate(now.getDate() + mondayOffset);
    thisMonday.setHours(0, 0, 0, 0);

    // Find stale incomplete todos from previous weeks
    const staleTodos = await prisma.todo.findMany({
      where: {
        deleted: false,
        status: { in: ["pending", "in_progress"] },
        weekOf: { lt: thisMonday },
      },
      select: { id: true, assigneeId: true },
    });

    if (staleTodos.length === 0) {
      return NextResponse.json({
        message: "No todos to carry forward",
        carried: 0,
      });
    }

    // Bulk update weekOf to current Monday
    const result = await prisma.todo.updateMany({
      where: {
        id: { in: staleTodos.map((t) => t.id) },
      },
      data: {
        weekOf: thisMonday,
      },
    });

    // Group by assignee for notification context
    const assigneeCounts = new Map<string, number>();
    for (const todo of staleTodos) {
      assigneeCounts.set(
        todo.assigneeId,
        (assigneeCounts.get(todo.assigneeId) || 0) + 1
      );
    }

    return NextResponse.json({
      message: "Auto carry-forward complete",
      carried: result.count,
      assigneesAffected: assigneeCounts.size,
      weekOf: thisMonday.toISOString().split("T")[0],
    });
  } catch (err) {
    console.error("Auto carry-forward cron failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 }
    );
  }
}
