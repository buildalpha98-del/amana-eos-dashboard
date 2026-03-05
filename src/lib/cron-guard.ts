/**
 * Cron idempotency guard.
 *
 * Uses the CronRun model to ensure each cron job only executes once per
 * period (daily or weekly). This prevents duplicate emails, duplicate
 * todo creation, and duplicate notifications when Vercel retries a cron
 * invocation or a manual trigger fires twice.
 *
 * Usage:
 * ```ts
 * const guard = await acquireCronLock("daily-digest", "daily");
 * if (!guard.acquired) {
 *   return NextResponse.json({ message: guard.reason, skipped: true });
 * }
 * try {
 *   // ... do work ...
 *   await guard.complete({ emailsSent: 5 });
 * } catch (err) {
 *   await guard.fail(err);
 *   throw err;
 * }
 * ```
 */

import { prisma } from "@/lib/prisma";

type CronPeriod = "daily" | "weekly";

interface CronGuard {
  acquired: boolean;
  reason?: string;
  /** Mark the cron run as successfully completed */
  complete: (details?: Record<string, unknown>) => Promise<void>;
  /** Mark the cron run as failed */
  fail: (error: unknown) => Promise<void>;
}

/**
 * Get the period key for the current date.
 *
 * - daily  → "2025-03-05"
 * - weekly → "2025-W10"
 */
function getPeriodKey(type: CronPeriod): string {
  const now = new Date();

  if (type === "daily") {
    return now.toISOString().split("T")[0]; // "YYYY-MM-DD"
  }

  // ISO week number
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor(
    (now.getTime() - jan1.getTime()) / 86400000,
  ) + 1;
  const weekNum = Math.ceil((dayOfYear + jan1.getDay()) / 7);
  return `${now.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

/**
 * Attempt to acquire an idempotent lock for a cron job.
 *
 * If the cron has already completed (or is still running) for the current
 * period, `acquired` will be `false`.
 */
export async function acquireCronLock(
  cronName: string,
  periodType: CronPeriod,
): Promise<CronGuard> {
  const period = getPeriodKey(periodType);

  // Check for an existing run in this period
  const existing = await prisma.cronRun.findUnique({
    where: { cronName_period: { cronName, period } },
  });

  if (existing) {
    if (existing.status === "completed") {
      return {
        acquired: false,
        reason: `Cron "${cronName}" already completed for period ${period}`,
        complete: async () => {},
        fail: async () => {},
      };
    }

    // If it's been "running" for more than 10 minutes, it likely failed silently.
    // Allow re-acquisition by deleting the stale record.
    const staleThreshold = 10 * 60 * 1000; // 10 minutes
    const elapsed = Date.now() - existing.startedAt.getTime();

    if (existing.status === "running" && elapsed < staleThreshold) {
      return {
        acquired: false,
        reason: `Cron "${cronName}" is already running for period ${period} (started ${Math.round(elapsed / 1000)}s ago)`,
        complete: async () => {},
        fail: async () => {},
      };
    }

    // Stale "running" or "failed" record — delete so we can re-acquire
    await prisma.cronRun.delete({
      where: { cronName_period: { cronName, period } },
    });
  }

  // Create the lock record
  try {
    const run = await prisma.cronRun.create({
      data: { cronName, period, status: "running" },
    });

    const runId = run.id;

    return {
      acquired: true,
      complete: async (details) => {
        await prisma.cronRun.update({
          where: { id: runId },
          data: {
            status: "completed",
            completedAt: new Date(),
            details: details ? JSON.parse(JSON.stringify(details)) : undefined,
          },
        });
      },
      fail: async (error) => {
        await prisma.cronRun.update({
          where: { id: runId },
          data: {
            status: "failed",
            completedAt: new Date(),
            details: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
        });
      },
    };
  } catch (err: unknown) {
    // Unique constraint violation — another instance beat us to it
    const prismaError = err as { code?: string };
    if (prismaError.code === "P2002") {
      return {
        acquired: false,
        reason: `Cron "${cronName}" lock contention for period ${period}`,
        complete: async () => {},
        fail: async () => {},
      };
    }
    throw err;
  }
}

/**
 * Verify the CRON_SECRET bearer token from the request.
 * Returns an error response if unauthorized, or null if valid.
 */
export function verifyCronSecret(
  req: Request,
): { error: Response } | null {
  const authHeader = (req.headers as Headers).get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return {
      error: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }

  return null;
}
