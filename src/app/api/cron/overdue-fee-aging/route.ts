import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronSecret, acquireCronLock } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/overdue-fee-aging
 * Daily cron: recalculates daysOverdue and agingBucket for all outstanding records.
 * Auto-generates reminder Todos at 14/30/60 day thresholds.
 * Schedule: daily at 8pm AEST (10:00 UTC) — "0 10 * * *"
 */
export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const guard = await acquireCronLock("overdue-fee-aging", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const now = new Date();

    // Fetch all non-resolved, non-deleted records
    const records = await prisma.overdueFeeRecord.findMany({
      where: {
        deleted: false,
        reminderStatus: { not: "resolved" },
      },
      include: {
        service: { select: { name: true } },
      },
    });

    let updated = 0;
    let remindersCreated = 0;

    // Find Daniel (head_office) and Jayden (owner) for assignees
    const daniel = await prisma.user.findFirst({
      where: { role: "head_office", active: true },
      select: { id: true },
    });
    const jayden = await prisma.user.findFirst({
      where: { role: "owner", active: true },
      select: { id: true },
    });

    for (const record of records) {
      const daysOverdue = Math.max(
        0,
        Math.floor(
          (now.getTime() - new Date(record.dueDate).getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      );

      let agingBucket = "current";
      if (daysOverdue >= 60) agingBucket = "60plus";
      else if (daysOverdue >= 45) agingBucket = "45d";
      else if (daysOverdue >= 30) agingBucket = "30d";
      else if (daysOverdue >= 14) agingBucket = "14d";
      else if (daysOverdue >= 7) agingBucket = "7d";

      const data: Record<string, unknown> = { daysOverdue, agingBucket };

      // Helper: compute weekOf (Sunday start of week)
      const getWeekOf = (d: Date) => {
        const w = new Date(d);
        w.setDate(w.getDate() - w.getDay());
        w.setHours(0, 0, 0, 0);
        return w;
      };

      // Auto-advance reminder status and create Todos at thresholds
      if (
        daysOverdue >= 14 &&
        record.reminderStatus === "none" &&
        !record.firstReminderSentAt
      ) {
        data.reminderStatus = "first_sent";
        data.firstReminderSentAt = now;

        const dueDate = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
        await prisma.todo.create({
          data: {
            title: `[14-Day Reminder] ${record.parentName} — $${record.balance.toFixed(2)} overdue`,
            description: `${record.service.name}: Invoice ${record.invoiceRef || "N/A"} is ${daysOverdue} days overdue. Balance: $${record.balance.toFixed(2)}. Please send a friendly payment reminder.`,
            assigneeId: daniel?.id || record.assigneeId,
            dueDate,
            weekOf: getWeekOf(dueDate),
          },
        });
        remindersCreated++;
      } else if (
        daysOverdue >= 30 &&
        record.reminderStatus === "first_sent" &&
        !record.secondReminderSentAt
      ) {
        data.reminderStatus = "second_sent";
        data.secondReminderSentAt = now;

        const dueDate = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
        await prisma.todo.create({
          data: {
            title: `[30-Day Follow-up] ${record.parentName} — $${record.balance.toFixed(2)} overdue`,
            description: `${record.service.name}: Invoice ${record.invoiceRef || "N/A"} is ${daysOverdue} days overdue. This is the second reminder. Please follow up with a firmer payment request.`,
            assigneeId: daniel?.id || record.assigneeId,
            dueDate,
            weekOf: getWeekOf(dueDate),
          },
        });
        remindersCreated++;
      } else if (
        daysOverdue >= 60 &&
        record.reminderStatus === "second_sent" &&
        !record.escalatedAt
      ) {
        data.reminderStatus = "escalated";
        data.escalatedAt = now;

        const dueDate = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
        await prisma.todo.create({
          data: {
            title: `[ESCALATED - 60+ Days] ${record.parentName} — $${record.balance.toFixed(2)} overdue`,
            description: `${record.service.name}: Invoice ${record.invoiceRef || "N/A"} is ${daysOverdue} days overdue. Two reminders sent without resolution. Requires escalation decision: payment plan, formal notice, or write-off.`,
            assigneeId: jayden?.id || record.assigneeId,
            dueDate,
            weekOf: getWeekOf(dueDate),
          },
        });
        remindersCreated++;
      }

      // Update record
      if (
        daysOverdue !== record.daysOverdue ||
        agingBucket !== record.agingBucket ||
        Object.keys(data).length > 2
      ) {
        await prisma.overdueFeeRecord.update({
          where: { id: record.id },
          data,
        });
        updated++;
      }
    }

    await guard.complete({
      totalRecords: records.length,
      updated,
      remindersCreated,
    });

    return NextResponse.json({
      success: true,
      totalRecords: records.length,
      updated,
      remindersCreated,
    });
  } catch (err) {
    await guard.fail(err);
    logger.error("Cron overdue-fee-aging", { err });
    return NextResponse.json(
      { error: "Cron failed" },
      { status: 500 },
    );
  }
});
