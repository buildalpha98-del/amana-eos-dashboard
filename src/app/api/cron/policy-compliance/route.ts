import { NextRequest, NextResponse } from "next/server";
import { acquireCronLock } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { checkPolicyCompliance } from "@/lib/policy-compliance";

/**
 * GET /api/cron/policy-compliance
 *
 * Weekly cron (Monday) — checks for unacknowledged published policies and
 * sends reminder emails to users. Also sends an admin summary with overall
 * compliance rates.
 *
 * Auth: Bearer CRON_SECRET
 */
export const GET = withApiHandler(async (req) => {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const guard = await acquireCronLock("policy-compliance", "weekly");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const result = await checkPolicyCompliance();

    if (result.policies === 0) {
      await guard.complete({ policies: 0, emailsSent: 0 });
      return NextResponse.json({
        message: "No published policies found",
        policies: 0,
        emailsSent: 0,
      });
    }

    await guard.complete({
      policies: result.policies,
      users: result.users,
      complianceRate: result.complianceRate,
      usersWithPending: result.usersWithPending,
      emailsSent: result.emailsSent,
    });

    return NextResponse.json({
      message: "Policy compliance check processed",
      ...result,
    });
  } catch (err) {
    await guard.fail(err);
    logger.error("Cron: policy-compliance", { err });
    return NextResponse.json(
      {
        error: "Policy compliance cron failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
});
