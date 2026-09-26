/**
 * The ONLY writer of KnowledgeSource / KnowledgeChunk.
 *
 *   upsertKnowledgeSource(input)
 *     → find by (sourceKind, externalId)
 *     → row current? (hash unchanged AND the last index SUCCEEDED AND it is
 *       embedded — or there is no embeddings key to embed with) → "unchanged"
 *       (no re-chunk, no re-embed) — unless the title changed, which lands
 *       title/normalizedTitle + the title-derived fields and re-runs
 *       supersession for the old AND new key
 *     → create/update the source row with derived fields + the canonical
 *       `text`, `indexedAt: null`, `embedded: false` — the hash alone never
 *       marks a row current; only a successful indexSource does
 *     → indexSource(): chunk → embed → replace chunks in a transaction,
 *       set searchVector via to_tsvector (explicit UPDATE, no trigger)
 *       and embedding via $1::vector. Both UPDATEs go through
 *       $queryRawUnsafe (as document-indexer did) — the test prisma mock
 *       supports $queryRawUnsafe but not $executeRawUnsafe. Success stamps
 *       `indexedAt` + `embedded` and clears `indexError`; tsvector-only (no
 *       key / Voyage outage) is DEGRADED (`embedded=false`), not an error.
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
  isEmbeddingsConfigured,
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
    select: {
      id: true, contentHash: true, status: true, excludedBy: true, indexError: true,
      indexedAt: true, embedded: true, text: true,
      title: true, normalizedTitle: true, state: true, serviceId: true,
    },
  });

  // An adapter-excluded row whose origin has come back (republished course,
  // unarchived policy) is re-activated. Admin exclusions are never reverted.
  const reactivate = existing?.status === "excluded" && existing.excludedBy === "adapter";

  // A rename can move the row to a different dedupe group. The OLD group
  // must be revisited too, or its `superseded` rows are left with no winner.
  const newKey: SupersessionKey = { normalizedTitle, state, serviceId: input.serviceId ?? null };
  const oldKey: SupersessionKey | null = existing
    ? { normalizedTitle: existing.normalizedTitle, state: existing.state, serviceId: existing.serviceId }
    : null;
  const keyChanged = oldKey !== null && !sameKey(oldKey, newKey);

  // "Current" = the stored text is this text AND the row does not need an
  // index pass (see sourceNeedsIndex). A matching hash with `indexedAt:
  // null` means the pre-index write landed but the index never finished
  // (crash, timeout) — re-running would otherwise report "unchanged"
  // forever and leave the chunks stale/absent.
  const current =
    existing !== null &&
    existing.contentHash === contentHash &&
    // Legacy rows from before `text` was persisted: re-index so the column is populated.
    existing.text !== "" &&
    !sourceNeedsIndex(existing);
  if (existing && current) {
    // hashContent() covers the TEXT only — a rename with identical text
    // must still land title/normalizedTitle (+ the title-derived fields)
    // without paying for a re-chunk/re-embed.
    const renamed = input.title !== existing.title;
    if (!reactivate && !renamed) return { sourceId: existing.id, outcome: "unchanged" };
    await prisma.knowledgeSource.update({
      where: { id: existing.id },
      data: {
        ...(renamed ? { title: input.title, normalizedTitle, qualityArea, version, state, tier } : {}),
        ...(reactivate ? { status: "active" as const, excludedBy: null } : {}),
      },
    });
    if (keyChanged && oldKey) await applySupersession(oldKey);
    await applySupersession(newKey);
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
    // The canonical text lands BEFORE indexing with `indexedAt: null`, so a
    // crash between here and indexSource leaves a row that the next sync
    // re-indexes rather than one whose hash says "done".
    text: input.text,
    contentHash,
    indexedAt: null,
    embedded: false,
    ...(reactivate ? { status: "active" as const, excludedBy: null } : {}),
  };

  const row = existing
    ? await prisma.knowledgeSource.update({ where: { id: existing.id }, data })
    : await prisma.knowledgeSource.create({ data });

  // The row has left its old group the moment the update lands — pick that
  // group's new winner now, whether or not the re-index below succeeds.
  if (keyChanged && oldKey) await applySupersession(oldKey);

  const indexed = await indexSource(row.id, input.text);
  if (!indexed.ok) {
    return { sourceId: row.id, outcome: "error", error: indexed.error };
  }

  await applySupersession(newKey);

  return { sourceId: row.id, outcome: existing ? "updated" : "created" };
}

/**
 * Does this row need an index pass regardless of its content? True when
 * the last index never finished or failed (`indexedAt` null / `indexError`
 * set) or when it is keyword-only AND an embeddings key now exists. A
 * keyword-only row with NO key is as good as it can get and must not be
 * re-chunked on every sync. Shared by the upsert fast-path and the backfill
 * adapter's policy batching so the two can never disagree.
 */
export function sourceNeedsIndex(row: {
  indexedAt: Date | null;
  indexError: string | null;
  embedded: boolean;
}): boolean {
  if (row.indexedAt == null || row.indexError != null) return true;
  return !row.embedded && isEmbeddingsConfigured();
}

interface SupersessionKey {
  normalizedTitle: string;
  state: string | null;
  serviceId: string | null;
}

function sameKey(a: SupersessionKey, b: SupersessionKey): boolean {
  return a.normalizedTitle === b.normalizedTitle && a.state === b.state && a.serviceId === b.serviceId;
}

export async function indexSource(
  sourceId: string,
  text: string,
): Promise<{ ok: true; chunks: number } | { ok: false; error: string }> {
  const chunks = chunkText(text);
  if (chunks.length === 0) {
    await prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: { indexError: "No text content extracted", indexedAt: null, embedded: false },
    });
    return { ok: false, error: "No text content extracted" };
  }

  const embedResult = await embedTextsWithUsage(chunks.map((c) => c.content));
  const vectors = embedResult?.vectors ?? null;
  // Every chunk got a vector. null = no key / Voyage down → tsvector-only,
  // which is a degraded index, not a failed one: the row is searchable by
  // keyword now and the next sync retries the embedding once a key exists.
  const fullyEmbedded = vectors !== null && vectors.length === chunks.length;

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
        data: { indexedAt: new Date(), embedded: fullyEmbedded, indexError: null },
      });
      // Large SOP docs can be 100–200 chunks, one round trip per chunk for
      // the embedding UPDATE — well past Prisma's 5s interactive-transaction
      // default. maxWait is how long we'll queue for a connection; timeout
      // is how long the transaction itself may run once it has one.
    }, { timeout: 30_000, maxWait: 5_000 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Knowledge: index failed", { sourceId, err: message });
    await prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: { indexError: message, indexedAt: null, embedded: false },
    });
    return { ok: false, error: message };
  }

  if (embedResult) {
    prisma.aiUsage
      .create({
        data: {
          userId: null,
          templateSlug: null,
          model: EMBEDDING_MODEL,
          inputTokens: embedResult.usage.totalTokens,
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
 *
 * Re-runs supersession for every dedupe group the exclusion touched, so a
 * group never loses its active winner. An excluded row that was `active`
 * had superseded its siblings; without this pass the best of them stays
 * `superseded` and the group answers nothing — an unmapped SharePoint
 * centre copy (serviceId null, so the org-wide key) that won on updatedAt
 * and was then excluded left the org-wide document dark; the same shape
 * hits a policy_upload archived over its SharePoint copy and an LMS
 * module or help article unpublished over an imported twin. The keys are
 * read BEFORE the flip: after it the rows are `excluded`, which the
 * scoped where no longer matches.
 */
export async function excludeSources(
  where: Prisma.KnowledgeSourceWhereInput,
  by: "adapter" | "admin",
): Promise<number> {
  const scoped: Prisma.KnowledgeSourceWhereInput = {
    ...where,
    status: by === "adapter" ? "active" : { not: "superseded" },
  };
  const touched = await prisma.knowledgeSource.findMany({
    where: scoped,
    select: { normalizedTitle: true, state: true, serviceId: true },
  });
  const r = await prisma.knowledgeSource.updateMany({
    where: scoped,
    data: { status: "excluded", excludedBy: by },
  });
  const keys = new Map<string, SupersessionKey>();
  for (const row of touched) {
    keys.set(JSON.stringify([row.normalizedTitle, row.state, row.serviceId]), row);
  }
  for (const key of keys.values()) await applySupersession(key);
  return r.count;
}

/**
 * Within one dedupe key, exactly one source is `active`:
 *   1. highest KIND_PRIORITY (policy_upload > manual > sharepoint > others)
 *   2. then highest version (null = 0)
 *   3. then most recently updated
 * Everything else → superseded with supersededById. `excluded` rows are
 * never touched. Returns the winner's id (or null if the key is empty).
 *
 * Safe to re-run after a member leaves the group (deleted, excluded, or
 * renamed into another key): a group left with only `superseded` rows
 * promotes its best one back to `active`. upsertKnowledgeSource re-runs it
 * for BOTH the old and new key on a rename; the admin status/delete routes
 * re-run it for the row's key.
 */
export async function applySupersession(key: SupersessionKey): Promise<string | null> {
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
    const vk = (b.version ?? 0) - (a.version ?? 0);
    if (vk !== 0) return vk;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
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
