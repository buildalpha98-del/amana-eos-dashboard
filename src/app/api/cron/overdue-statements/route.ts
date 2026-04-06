import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronSecret, acquireCronLock } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/overdue-statements
 * Daily cron: marks issued statements past their due date as overdue.
 * Schedule: daily at 10pm UTC — "0 22 * * *"
 */
export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const guard = await acquireCronLock("overdue-statements", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdueStatements = await prisma.statement.findMany({
      where: {
        status: "issued",
        dueDate: { lt: today },
        balance: { gt: 0 },
      },
      select: { id: true },
    });

    let updated = 0;
    for (const stmt of overdueStatements) {
      await prisma.statement.update({
        where: { id: stmt.id },
        data: { status: "overdue" },
      });
      // TODO: sendOverdueStatementNotification(stmt.id) — wire up once billing notifications module exists
      updated++;
    }

    logger.info("Overdue statements cron completed", {
      found: overdueStatements.length,
      updated,
    });

    await guard.complete({ updated });
    return NextResponse.json({ updated });
  } catch (err) {
    await guard.fail(err);
    throw err;
  }
});
