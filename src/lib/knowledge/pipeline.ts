/**
 * The ONLY writer of KnowledgeSource / KnowledgeChunk.
 *
 *   upsertKnowledgeSource(input)
 *     → find by (sourceKind, externalId)
 *     → hash unchanged? "unchanged" (no re-chunk, no re-embed)
 *     → create/update the source row with derived fields
 *     → indexSource(): chunk → embed → replace chunks in a transaction,
 *       set searchVector via to_tsvector (explicit UPDATE, no trigger)
 *       and embedding via $1::vector. Both UPDATEs go through
 *       $queryRawUnsafe (as document-indexer did) — the test prisma mock
 *       supports $queryRawUnsafe but not $executeRawUnsafe.
 *     → applySupersession() for the source's dedupe key
 *
 * Nothing here reads Document/DocumentChunk — guard-tested.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { chunkText } from "@/lib/document-indexer";
import {
  embedTextsWithUsage,
  toVectorLiteral,
  EMBEDDING_MODEL,
} from "@/lib/embeddings";
import {
  canonicalState,
  hashContent,
  inferTier,
  normalizeTitle,
  parseFilenameMeta,
} from "./normalize";
import type { KnowledgeSourceInput, UpsertResult } from "./types";

/** Manual precedence: an official PDF beats imported text of the same title. */
const KIND_PRIORITY: Record<string, number> = {
  policy_upload: 3,
  manual: 2,
  sharepoint: 1,
};

export async function upsertKnowledgeSource(
  input: KnowledgeSourceInput,
): Promise<UpsertResult> {
  const meta = parseFilenameMeta(input.title);
  const qualityArea = input.qualityArea ?? meta.qualityArea;
  const version = input.version ?? meta.version;
  const state = canonicalState(input.state ?? meta.state);
  const normalizedTitle = normalizeTitle(input.title);
  const tier = input.tier ?? inferTier({ qualityArea, title: input.title });
  const contentHash = hashContent(input.text);

  const existing = await prisma.knowledgeSource.findUnique({
    where: {
      sourceKind_externalId: {
        sourceKind: input.sourceKind,
        externalId: input.externalId,
      },
    },
    select: { id: true, contentHash: true, status: true, excludedBy: true },
  });

  // An adapter-excluded row whose origin has come back (republished course,
  // unarchived policy) is re-activated. Admin exclusions are never reverted.
  const reactivate = existing?.status === "excluded" && existing.excludedBy === "adapter";

  if (existing && existing.contentHash === contentHash) {
    if (!reactivate) return { sourceId: existing.id, outcome: "unchanged" };
    await prisma.knowledgeSource.update({
      where: { id: existing.id },
      data: { status: "active", excludedBy: null },
    });
    await applySupersession({ normalizedTitle, state, serviceId: input.serviceId ?? null });
    return { sourceId: existing.id, outcome: "updated" };
  }

  const data: Prisma.KnowledgeSourceUncheckedCreateInput = {
    title: input.title,
    normalizedTitle,
    sourceKind: input.sourceKind,
    category: input.category,
    tier,
    qualityArea,
    serviceId: input.serviceId ?? null,
    state,
    audienceRoles: input.audienceRoles ?? [],
    version,
    externalId: input.externalId,
    externalUrl: input.externalUrl ?? null,
    contentHash,
    ...(reactivate ? { status: "active" as const, excludedBy: null } : {}),
  };

  const row = existing
    ? await prisma.knowledgeSource.update({ where: { id: existing.id }, data })
    : await prisma.knowledgeSource.create({ data });

  const indexed = await indexSource(row.id, input.text);
  if (!indexed.ok) {
    return { sourceId: row.id, outcome: "error", error: indexed.error };
  }

  await applySupersession({
    normalizedTitle,
    state,
    serviceId: input.serviceId ?? null,
  });

  return { sourceId: row.id, outcome: existing ? "updated" : "created" };
}

export async function indexSource(
  sourceId: string,
  text: string,
): Promise<{ ok: true; chunks: number } | { ok: false; error: string }> {
  const chunks = chunkText(text);
  if (chunks.length === 0) {
    await prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: { indexError: "No text content extracted", indexedAt: null },
    });
    return { ok: false, error: "No text content extracted" };
  }

  const embedded = await embedTextsWithUsage(chunks.map((c) => c.content));
  const vectors = embedded?.vectors ?? null;

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.knowledgeChunk.deleteMany({ where: { sourceId } });
      await tx.knowledgeChunk.createMany({
        data: chunks.map((c) => ({
          sourceId,
          chunkIndex: c.chunkIndex,
          heading: c.heading,
          content: c.content,
          tokenCount: c.tokenCount,
        })),
      });
      await tx.$queryRawUnsafe(
        `UPDATE "KnowledgeChunk" SET "searchVector" = to_tsvector('english', content) WHERE "sourceId" = $1`,
        sourceId,
      );
      if (vectors) {
        const rows: { id: string; chunkIndex: number }[] =
          await tx.knowledgeChunk.findMany({
            where: { sourceId },
            select: { id: true, chunkIndex: true },
          });
        for (const r of rows) {
          const vec = vectors[r.chunkIndex];
          if (!vec) continue;
          // One round trip per chunk. Fine at ~20 chunks/doc; if it ever
          // matters, a single UPDATE … FROM unnest($1::text[], $2::vector[]).
          await tx.$queryRawUnsafe(
            `UPDATE "KnowledgeChunk" SET embedding = $1::vector WHERE id = $2`,
            toVectorLiteral(vec),
            r.id,
          );
        }
      }
      await tx.knowledgeSource.update({
        where: { id: sourceId },
        data: { indexedAt: new Date(), indexError: vectors ? null : "Embeddings unavailable — tsvector only" },
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Knowledge: index failed", { sourceId, err: message });
    await prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: { indexError: message },
    });
    return { ok: false, error: message };
  }

  if (vectors) {
    const usage = embedded!.usage;
    prisma.aiUsage
      .create({
        data: {
          userId: null,
          templateSlug: null,
          model: EMBEDDING_MODEL,
          inputTokens: usage.totalTokens,
          outputTokens: 0,
          durationMs: 0,
          section: "knowledge-index",
          metadata: { sourceId, chunks: chunks.length } as Prisma.InputJsonObject,
        },
      })
      .catch((err: unknown) => logger.warn("Knowledge: usage log failed", { err }));
  }

  return { ok: true, chunks: chunks.length };
}

/**
 * The ONLY way to set status=excluded. `by` records who, so adapters can
 * undo their own. An adapter exclude touches ACTIVE rows only — it must
 * never overwrite an admin's `excludedBy: "admin"` (that row would later
 * look adapter-owned and get silently re-activated).
 */
export async function excludeSources(
  where: Prisma.KnowledgeSourceWhereInput,
  by: "adapter" | "admin",
): Promise<number> {
  const r = await prisma.knowledgeSource.updateMany({
    where: { ...where, status: by === "adapter" ? "active" : { not: "superseded" } },
    data: { status: "excluded", excludedBy: by },
  });
  return r.count;
}

/**
 * Within one dedupe key, exactly one source is `active`:
 * (Keyed on the NEW title. A renamed source leaves its old group
 * unrevisited — a stale `superseded` row can remain the group's only
 * member. Follow-up: on title change, re-run for the old key too.)
 *   1. highest KIND_PRIORITY (policy_upload > manual > sharepoint > others)
 *   2. then highest version (null = 0)
 *   3. then most recently updated
 * Everything else → superseded with supersededById. `excluded` rows are
 * never touched. Returns the winner's id (or null if the key is empty).
 */
export async function applySupersession(key: {
  normalizedTitle: string;
  state: string | null;
  serviceId: string | null;
}): Promise<string | null> {
  const rows = await prisma.knowledgeSource.findMany({
    where: {
      normalizedTitle: key.normalizedTitle,
      state: key.state,
      serviceId: key.serviceId,
      status: { in: ["active", "superseded"] },
    },
    select: { id: true, version: true, sourceKind: true, status: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  if (rows.length === 0) return null;

  const sorted = [...rows].sort((a, b) => {
    const pk = (KIND_PRIORITY[b.sourceKind] ?? 0) - (KIND_PRIORITY[a.sourceKind] ?? 0);
    if (pk !== 0) return pk;
    return (b.version ?? 0) - (a.version ?? 0);
  });
  const winner = sorted[0];
  const losers = sorted.slice(1).map((r) => r.id);

  if (losers.length > 0) {
    await prisma.knowledgeSource.updateMany({
      where: { id: { in: losers } },
      data: { status: "superseded", supersededById: winner.id },
    });
  }
  if (winner.status !== "active") {
    await prisma.knowledgeSource.update({
      where: { id: winner.id },
      data: { status: "active", supersededById: null },
    });
  }
  return winner.id;
}
