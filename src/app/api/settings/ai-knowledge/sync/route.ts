/**
 * GET  /api/settings/ai-knowledge/sync — latest KnowledgeSyncRun per adapter
 *      + `embeddingsConfigured` (the console banners when it is false)
 * POST /api/settings/ai-knowledge/sync — kick a server-runnable adapter
 *
 * Only adapters in RUNNABLE_ADAPTERS can be triggered from here (SharePoint
 * is local-export-only in slice 1 — see src/lib/knowledge/sync.ts).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { ADMIN_ROLES } from "@/lib/role-permissions";
import { runAdapter, RUNNABLE_ADAPTERS } from "@/lib/knowledge/sync";
import { isEmbeddingsConfigured } from "@/lib/embeddings";

export const maxDuration = 300;
const schema = z.object({ adapter: z.enum(RUNNABLE_ADAPTERS) });
/**
 * A run still open after this long was killed by a platform timeout (the
 * route's own catch finalises every run it can) — email-janitor closes it
 * as "timed out"; until then it must not block a fresh click forever.
 */
const OPEN_RUN_WINDOW_MS = 60 * 60 * 1000;

/**
 * Latest run per adapter (incl. the script-written `sharepoint` runs) — feeds
 * the console's Last-sync panel. `distinct` + `orderBy` keeps the first
 * (newest) row per adapter, so a burst of backfill runs can't push another
 * adapter off the panel. Prisma dedupes in memory (no `nativeDistinct`), so
 * the query reads the whole table; it stays small because the email-janitor
 * cron prunes runs older than 90 days.
 */
export const GET = withApiAuth(
  async () => {
    const runs = await prisma.knowledgeSyncRun.findMany({
      distinct: ["adapter"],
      orderBy: { startedAt: "desc" },
      select: { id: true, adapter: true, startedAt: true, finishedAt: true, counts: true, details: true, error: true },
    });
    return NextResponse.json({ runs, embeddingsConfigured: isEmbeddingsConfigured() });
  },
  { roles: [...ADMIN_ROLES] },
);

export const POST = withApiAuth(
  async (req, session) => {
    const parsed = schema.safeParse(await parseJsonBody(req));
    if (!parsed.success) throw ApiError.badRequest("adapter must be one of: " + RUNNABLE_ADAPTERS.join(", "));
    // Two admins (or a double click) must not run the same adapter twice at
    // once — each walk re-downloads every policy PDF and re-fetches every
    // regulator page, and both would write the same rows.
    const open = await prisma.knowledgeSyncRun.findFirst({
      where: { adapter: parsed.data.adapter, finishedAt: null, startedAt: { gt: new Date(Date.now() - OPEN_RUN_WINDOW_MS) } },
      select: { id: true, startedAt: true },
    });
    if (open) {
      throw ApiError.conflict(
        `A ${parsed.data.adapter} sync started at ${open.startedAt.toISOString()} is still running — wait for it to finish.`,
      );
    }
    const run = await runAdapter(parsed.data.adapter, session!.user.id);
    return NextResponse.json(run);
  },
  // withApiAuth races the handler against a 55s default — a few seconds under
  // maxDuration so the wrapper, not the platform, reports the timeout.
  { roles: [...ADMIN_ROLES], rateLimit: { max: 5, windowMs: 60_000 }, timeoutMs: 290_000 },
);
