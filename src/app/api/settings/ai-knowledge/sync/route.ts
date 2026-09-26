/**
 * GET  /api/settings/ai-knowledge/sync — latest KnowledgeSyncRun per adapter
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

export const maxDuration = 300;
const schema = z.object({ adapter: z.enum(RUNNABLE_ADAPTERS) });

/** Latest run per adapter (incl. the script-written `sharepoint` runs) — feeds the console's Last-sync panel. */
export const GET = withApiAuth(
  async () => {
    const runs = await prisma.knowledgeSyncRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 20,
      select: { id: true, adapter: true, startedAt: true, finishedAt: true, counts: true, details: true, error: true },
    });
    const latestByAdapter = new Map<string, (typeof runs)[number]>();
    for (const r of runs) if (!latestByAdapter.has(r.adapter)) latestByAdapter.set(r.adapter, r);
    return NextResponse.json({ runs: [...latestByAdapter.values()] });
  },
  { roles: [...ADMIN_ROLES] },
);

export const POST = withApiAuth(
  async (req, session) => {
    const parsed = schema.safeParse(await parseJsonBody(req));
    if (!parsed.success) throw ApiError.badRequest("adapter must be one of: " + RUNNABLE_ADAPTERS.join(", "));
    const run = await runAdapter(parsed.data.adapter, session!.user.id);
    return NextResponse.json(run);
  },
  { roles: [...ADMIN_ROLES], rateLimit: { max: 5, windowMs: 60_000 } },
);
