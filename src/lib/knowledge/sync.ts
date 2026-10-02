/**
 * Run a server-side adapter under a KnowledgeSyncRun row. The SharePoint
 * adapter is NOT runnable here in slice 1 (local export only — spec §5.1);
 * slice 2b adds it once Graph app-only access exists.
 *
 * `run.error` is set whenever ANY source failed (`counts.errors > 0`, which
 * for the regulator includes per-URL fetch errors) — "3 sources failed" —
 * so the monthly cron fails its CronRun and the console's Last-sync panel
 * shows the same thing; the per-source detail is in `details.errors` /
 * `details.fetchErrors`. A thrown adapter sets `error` to the message. The
 * row is finalised (`finishedAt`) on every path this function controls; a
 * platform timeout that kills the process cannot reach the catch, which is
 * why email-janitor closes runs still open after an hour as "timed out".
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { runBackfill } from "./adapters/backfill";
import { syncRegulator } from "./adapters/regulator";
import type { UpsertResult } from "./types";

export const RUNNABLE_ADAPTERS = ["backfill", "regulator"] as const;
export type RunnableAdapter = (typeof RUNNABLE_ADAPTERS)[number];

// `type`, not `interface`: Prisma's InputJsonValue rejects named interfaces
// (no implicit index signature) — see parent/enrolment-draft/submit/route.ts:320.
export type SyncCounts = { created: number; updated: number; unchanged: number; errors: number };

export function countOutcomes(results: UpsertResult[]): SyncCounts {
  const c: SyncCounts = { created: 0, updated: 0, unchanged: 0, errors: 0 };
  for (const r of results) {
    if (r.outcome === "error") c.errors++;
    else c[r.outcome]++;
  }
  return c;
}

export async function runAdapter(adapter: RunnableAdapter, startedById: string | null) {
  if (!RUNNABLE_ADAPTERS.includes(adapter)) {
    throw new Error(`Adapter "${adapter}" is not runnable from the server`);
  }
  const run = await prisma.knowledgeSyncRun.create({
    data: { adapter, startedById, counts: {}, details: {} },
  });
  try {
    let counts: SyncCounts;
    let details: Record<string, unknown>;
    if (adapter === "backfill") {
      const { policiesRemaining, ...perAdapter } = await runBackfill();
      const all = Object.values(perAdapter).flat();
      counts = countOutcomes(all);
      details = {
        perAdapter: Object.fromEntries(Object.entries(perAdapter).map(([k, v]) => [k, countOutcomes(v)])),
        errors: all.filter((x) => x.outcome === "error").map((x) => ({ sourceId: x.sourceId, error: x.error })),
        policiesRemaining,
      };
    } else {
      const r = await syncRegulator();
      counts = countOutcomes(r.results);
      counts.errors += r.errors.length;
      details = { fetchErrors: r.errors };
    }
    const error = counts.errors > 0 ? `${counts.errors} source${counts.errors === 1 ? "" : "s"} failed` : null;
    return prisma.knowledgeSyncRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        counts: counts as Prisma.InputJsonValue,
        details: details as Prisma.InputJsonValue,
        error,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Knowledge: adapter run failed", { adapter, runId: run.id, err: message });
    return prisma.knowledgeSyncRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), error: message, counts: {}, details: {} },
    });
  }
}
