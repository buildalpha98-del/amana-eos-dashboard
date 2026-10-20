/**
 * Knox tick cron (every 5 minutes — vercel.json).
 *
 * Drives the incident-triage agent:
 *   1. sweeps pending triage jobs (and reaps stale `running` ones)
 *   2. runs the escalation sweep over unacknowledged alerts
 *
 * When Knox is disabled the lock is still taken and completed with a
 * `knox_disabled` marker so cron-health shows the run — neither sweep
 * executes.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { getKnoxSettings } from "@/lib/knox/settings";
import { runEscalationSweep, sweepJobs } from "@/lib/knox";

export const maxDuration = 300;

const DISABLED_REASON = "knox_disabled";

export const GET = withApiHandler(
  async (req) => {
    const authCheck = verifyCronSecret(req);
    if (authCheck) return authCheck.error;

    const guard = await acquireCronLock("knox-tick", "5min");
    if (!guard.acquired) {
      return NextResponse.json({ skipped: true, reason: guard.reason });
    }

    try {
      if (!(await getKnoxSettings()).enabled) {
        await guard.complete({ skipped: true, reason: DISABLED_REASON });
        return NextResponse.json({ skipped: true, reason: DISABLED_REASON });
      }

      const now = new Date();
      const { processed, reaped } = await sweepJobs(now);
      const { escalated } = await runEscalationSweep(prisma, now);

      await guard.complete({ processed, reaped, escalated });
      return NextResponse.json({ processed, reaped, escalated });
    } catch (err) {
      await guard.fail(err);
      throw err;
    }
  },
  { timeoutMs: 290_000 },
);
