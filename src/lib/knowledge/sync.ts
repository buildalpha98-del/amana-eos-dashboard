/**
 * Run a server-side adapter under a KnowledgeSyncRun row. The SharePoint
 * adapter is NOT runnable here in slice 1 (local export only — spec §5.1);
 * slice 2b adds it once Graph app-only access exists.
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
  if (!(RUNNABLE_ADAPTERS as readonly string[]).includes(adapter)) {
    throw new Error(`Adapter "${adapter}" is not runnable from the server`);
  }
  const run = await prisma.knowledgeSyncRun.create({
    data: { adapter, startedById, counts: {}, details: {} },
  });
  try {
    let counts: SyncCounts;
    let details: Record<string, unknown>;
    if (adapter === "backfill") {
      const r = await runBackfill();
      const all = [...r.handbook, ...r.helpArticles, ...r.centreFacts, ...r.lmsCourses, ...r.policies];
      counts = countOutcomes(all);
      details = {
        perAdapter: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, countOutcomes(v)])),
        errors: all.filter((x) => x.outcome === "error").map((x) => ({ sourceId: x.sourceId, error: x.error })),
      };
    } else {
      const r = await syncRegulator();
      counts = countOutcomes(r.results);
      counts.errors += r.errors.length;
      details = { fetchErrors: r.errors };
    }
    return prisma.knowledgeSyncRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        counts: counts as Prisma.InputJsonValue,
        details: details as Prisma.InputJsonValue,
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
