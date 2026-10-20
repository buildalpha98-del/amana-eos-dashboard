/**
 * Knox tick cron (every 5 minutes — vercel.json).
 *
 * Drives the incident-triage agent, in this order:
 *   1. the escalation sweep over unacknowledged alerts — first, because it is
 *      cheap and time-critical, and the job sweep can take ~240 s
 *   2. the reconciliation pass: queues a `sweep` job for any register row
 *      created in the last 6 h that has no triage job (a lost enqueue)
 *   3. the job sweep (and the reap of stale `running` jobs), which picks up
 *      anything step 2 queued
 *
 * Each step is isolated: one throwing does not skip the others. If any threw,
 * the lock is failed with the first error and the route returns 500.
 *
 * When Knox is disabled the lock is still taken and completed with a
 * `knox_disabled` marker so cron-health shows the run — no step executes.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { getKnoxSettings } from "@/lib/knox/settings";
import { DEFAULT_SWEEP_BUDGET_MS, reconcileMissingJobs, runEscalationSweep, sweepJobs } from "@/lib/knox";

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

    let enabled: boolean;
    try {
      enabled = (await getKnoxSettings()).enabled;
    } catch (err) {
      await guard.fail(err);
      throw err;
    }
    if (!enabled) {
      await guard.complete({ skipped: true, reason: DISABLED_REASON });
      return NextResponse.json({ skipped: true, reason: DISABLED_REASON });
    }

    const now = new Date();
    const startedAt = Date.now();
    const errors: unknown[] = [];
    async function step<T>(name: string, run: () => Promise<T>, fallback: T): Promise<T> {
      try {
        return await run();
      } catch (err) {
        logger.error("Knox tick: step failed", {
          step: name,
          err: err instanceof Error ? err.message : String(err),
        });
        errors.push(err);
        return fallback;
      }
    }

    const { escalated } = await step("escalation", () => runEscalationSweep(prisma, now), { escalated: 0 });
    const { reconciled } = await step("reconcile", () => reconcileMissingJobs(prisma, now), { reconciled: 0 });
    // The job sweep gets what is left of its budget after the first two steps.
    const budgetMs = Math.max(0, DEFAULT_SWEEP_BUDGET_MS - (Date.now() - startedAt));
    const { processed, reaped } = await step("sweep", () => sweepJobs(now, { budgetMs }), {
      processed: 0,
      reaped: 0,
    });

    if (errors.length > 0) {
      await guard.fail(errors[0]);
      throw errors[0];
    }
    const result = { escalated, reconciled, processed, reaped };
    await guard.complete(result);
    return NextResponse.json(result);
  },
  { timeoutMs: 290_000 },
);
