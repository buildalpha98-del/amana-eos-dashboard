/**
 * POST /api/settings/ai-knowledge/register
 *
 * Client-driven post-upload registration. The browser uploads file
 * bytes directly to Vercel Blob via @vercel/blob/client.upload(),
 * then immediately calls THIS endpoint with the resulting blob URL
 * so the KnowledgeSource row is created + indexed synchronously.
 *
 * Why this exists alongside the onUploadCompleted webhook on the
 * /upload route: the webhook can drop or delay under bulk fan-out
 * (Daniel reported uploads "not actually getting uploaded within
 * the dashboard"). The client knows authoritatively when its upload
 * finished, so having it ping us directly removes the unreliability.
 *
 * Idempotent — upserts the KnowledgeSource by externalUrl so a slow
 * webhook arriving after this register call won't create a duplicate.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { extractText } from "@/lib/document-indexer";
import { indexSource } from "@/lib/knowledge/pipeline";
import { createManualSource } from "@/lib/knowledge/adapters/manual";
import { logger } from "@/lib/logger";
import { ADMIN_ROLES } from "@/lib/role-permissions";
import type { KnowledgeCategory } from "@prisma/client";

const schema = z.object({
  blobUrl: z.string().url(),
  fileName: z.string().min(1),
  title: z.string().min(1),
  mimeType: z.string().min(1),
  fileSize: z.number().int().min(0).optional(),
});

// Per-call cap matches the upload route — extraction + chunking can
// take 10–30s on a big PDF, so leave headroom.
export const maxDuration = 120;

export const POST = withApiAuth(
  async (req) => {
    const body = await parseJsonBody(req);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw ApiError.badRequest(
        "Validation failed",
        parsed.error.flatten().fieldErrors,
      );
    }
    const { blobUrl, fileName, title, mimeType } = parsed.data;

    // Auto-categorise from the filename — Daniel's library is full of
    // "QA2 X Policy / Procedure" + "Y Handbook / Guide" files, so a
    // simple keyword sniff puts them in the right console tab without
    // a manual edit later.
    const category = mapCategory(inferDocumentCategory(fileName, title));

    const text = await extractText(blobUrl, mimeType);

    // Upsert by blobUrl so a slow onUploadCompleted webhook arriving
    // after this register call is a no-op rather than a duplicate.
    const existing = await prisma.knowledgeSource.findFirst({
      where: { sourceKind: "manual", externalUrl: blobUrl },
      select: { id: true },
    });

    if (existing) {
      const r = await indexSource(existing.id, text);
      return NextResponse.json({
        id: existing.id,
        outcome: r.ok ? "updated" : "error",
        error: r.ok ? undefined : r.error,
      });
    }

    const r = await createManualSource({ title, text, externalUrl: blobUrl, category });
    if (r.outcome === "error") {
      logger.error("AI knowledge register: indexing failed", {
        sourceId: r.sourceId,
        err: r.error,
      });
    }
    return NextResponse.json({ id: r.sourceId, outcome: r.outcome, error: r.error });
  },
  { roles: [...ADMIN_ROLES] },
);

/**
 * Pick the best category for a freshly-uploaded file from its filename
 * + title. Falls back to "other" when nothing matches. Order matters:
 * "Policy" wins over generic words like "OSHC".
 */
function inferDocumentCategory(
  fileName: string,
  title: string,
): "policy" | "procedure" | "guide" | "compliance" | "other" {
  const haystack = `${fileName} ${title}`.toLowerCase();
  if (/\bpolicy\b|\bpolicies\b/.test(haystack)) return "policy";
  if (/\bprocedure\b|\bprocedures\b/.test(haystack)) return "procedure";
  if (/\bguide\b|\bhandbook\b|\bmanual\b/.test(haystack)) return "guide";
  if (/\bcompliance\b|\baudit\b/.test(haystack)) return "compliance";
  return "other";
}

/** Maps the legacy Document category inference onto KnowledgeCategory. */
function mapCategory(
  inferred: "policy" | "procedure" | "guide" | "compliance" | "other",
): KnowledgeCategory {
  if (inferred === "policy") return "policy";
  if (inferred === "procedure") return "procedure";
  return "guide";
}
