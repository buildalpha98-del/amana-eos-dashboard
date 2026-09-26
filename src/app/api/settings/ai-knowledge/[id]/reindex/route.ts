/**
 * POST /api/settings/ai-knowledge/[id]/reindex — re-chunk + re-embed a
 * single source from its already-stored chunk text (e.g. after enabling
 * embeddings, or to retry a source that failed indexing).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { ADMIN_ROLES } from "@/lib/role-permissions";
import { indexSource } from "@/lib/knowledge/pipeline";

interface RouteContext {
  params: Promise<{ id: string }>;
}
export const maxDuration = 120;

export const POST = withApiAuth(
  async (_req, _session, context) => {
    const { id } = await (context as unknown as RouteContext).params;
    const row = await prisma.knowledgeSource.findUnique({
      where: { id },
      select: { id: true, chunks: { orderBy: { chunkIndex: "asc" }, select: { content: true } } },
    });
    if (!row) throw ApiError.notFound("Knowledge source not found");
    const result = await indexSource(id, row.chunks.map((c) => c.content).join("\n\n"));
    return NextResponse.json(result);
  },
  // withApiAuth races the handler against a 55s default — a few seconds under
  // maxDuration so the wrapper, not the platform, reports the timeout.
  { roles: [...ADMIN_ROLES], timeoutMs: 110_000 },
);
