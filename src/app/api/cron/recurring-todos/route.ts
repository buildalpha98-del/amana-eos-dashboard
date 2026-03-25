import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getWeekStart } from "@/lib/utils";
import { withApiHandler } from "@/lib/api-handler";
import { acquireCronLock } from "@/lib/cron-guard";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/recurring-todos
 *
 * Daily cron (5 AM AEST / 19:00 UTC) — creates todos from active templates
 * whose nextRunAt has arrived or passed.
 *
 * For each due template:
 * - Creates a Todo with title, assigneeId, weekOf, dueDate, serviceId from template
 * - Advances nextRunAt based on recurrence rule
 *
 * Auth: Bearer CRON_SECRET
 */
export const GET = withApiHandler(async (req) => {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Idempotency guard — prevent double creation on retry
  const guard = await acquireCronLock("recurring-todos", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const now = new Date();

    // Find all active templates whose next run is due
    const dueTemplates = await prisma.todoTemplate.findMany({
      where: {
        isActive: true,
        nextRunAt: { lte: now },
      },
    });

    if (dueTemplates.length === 0) {
      return NextResponse.json({
        message: "No templates due",
        created: 0,
      });
    }

    let created = 0;

    // Process each template in a transaction
    await prisma.$transaction(async (tx) => {
      for (const template of dueTemplates) {
        const weekOf = getWeekStart(template.nextRunAt);
        const dueDate = new Date(template.nextRunAt);
        dueDate.setDate(dueDate.getDate() + 7);

        // Create the todo
        await tx.todo.create({
          data: {
            title: template.title,
            description: template.description,
            assigneeId: template.assigneeId,
            serviceId: template.serviceId,
            weekOf,
            dueDate,
            createdById: template.createdById,
          },
        });

        // Advance nextRunAt based on recurrence
        const nextRun = new Date(template.nextRunAt);

        switch (template.recurrence) {
          case "daily":
            nextRun.setDate(nextRun.getDate() + 1);
            break;
          case "weekly":
            nextRun.setDate(nextRun.getDate() + 7);
            break;
          case "fortnightly":
            nextRun.setDate(nextRun.getDate() + 14);
            break;
          case "monthly":
            nextRun.setMonth(nextRun.getMonth() + 1);
            break;
          case "quarterly":
            nextRun.setMonth(nextRun.getMonth() + 3);
            break;
        }

        await tx.todoTemplate.update({
          where: { id: template.id },
          data: { nextRunAt: nextRun },
        });

        created++;
      }
    });

    return NextResponse.json({
      message: "Recurring todos created",
      created,
    });
  } catch (err) {
    logger.error("Recurring todos cron failed", { err });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 }
    );
  }
});
