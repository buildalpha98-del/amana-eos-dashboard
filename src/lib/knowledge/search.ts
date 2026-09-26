/**
 * Hybrid retrieval over KnowledgeChunk ⋈ KnowledgeSource (spec §3.4).
 *
 * Two legs run in parallel — tsvector (exact terminology: "Reg 168",
 * "WWCC") and pgvector cosine (meaning: "kid threw up" → Illness
 * Management) — merged by reciprocal-rank fusion. Scope is a SQL WHERE
 * built from KnowledgeScope; the model never sees these parameters.
 *
 * Scope SQL (NULL-safe: `= ANY(NULL)` matches nothing, so each filter is
 * guarded by an IS NULL branch; array params are cast `::text[]` because
 * Postgres cannot infer the type of a null array parameter):
 *   s.status = 'active'
 *   AND ($2::text[] IS NULL OR s."serviceId" IS NULL OR s."serviceId" = ANY($2::text[]))
 *   AND ($3::text IS NULL OR s.state IS NULL OR s.state = $3)
 *   AND (cardinality(s."audienceRoles") = 0 OR $4 = ANY(s."audienceRoles"))
 *
 * fusedScore orders results; cosineDistance / tsRank are the relevance
 * signals — slice 2's answer-mode thresholds use those, never the RRF.
 */
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { embedTexts, toVectorLiteral } from "@/lib/embeddings";
import type { KnowledgeHit, KnowledgeScope } from "./types";

const RRF_K = 60;
const VECTOR_CANDIDATES = 20;

type Row = Omit<KnowledgeHit, "fusedScore">;

const SELECT = `
  SELECT
    c.id            AS "chunkId",
    c."sourceId"    AS "sourceId",
    c."chunkIndex"  AS "chunkIndex",
    c.content       AS "content",
    c.heading       AS "heading",
    s.title         AS "title",
    s.category      AS "category",
    COALESCE(s."tierOverride", s.tier) AS "tier",
    s."externalUrl" AS "externalUrl"`;

const SCOPE_WHERE = `
    s.status = 'active'
    AND ($2::text[] IS NULL OR s."serviceId" IS NULL OR s."serviceId" = ANY($2::text[]))
    AND ($3::text IS NULL OR s.state IS NULL OR s.state = $3)
    AND (cardinality(s."audienceRoles") = 0 OR $4 = ANY(s."audienceRoles"))`;

function tsQuery(fn: "plainto_tsquery" | "websearch_to_tsquery"): string {
  return `${SELECT},
    ts_rank(c."searchVector", ${fn}('english', $1)) AS "tsRank",
    NULL::float8 AS "cosineDistance"
  FROM "KnowledgeChunk" c
  JOIN "KnowledgeSource" s ON s.id = c."sourceId"
  WHERE c."searchVector" @@ ${fn}('english', $1)
    AND ${SCOPE_WHERE}
  ORDER BY "tsRank" DESC
  LIMIT ${VECTOR_CANDIDATES}`;
}

const VECTOR_QUERY = `${SELECT},
    NULL::float8 AS "tsRank",
    (c.embedding <=> $1::vector) AS "cosineDistance"
  FROM "KnowledgeChunk" c
  JOIN "KnowledgeSource" s ON s.id = c."sourceId"
  WHERE c.embedding IS NOT NULL
    AND ${SCOPE_WHERE}
  ORDER BY c.embedding <=> $1::vector
  LIMIT ${VECTOR_CANDIDATES}`;

export async function searchKnowledge(
  query: string,
  scope: KnowledgeScope,
  limit = 8,
): Promise<KnowledgeHit[]> {
  // A blank query matches nothing in either leg (an empty tsquery matches
  // every row and an all-zero embedding is meaningless) — short-circuit
  // rather than pay for a DB round trip and an embeddings call to learn that.
  if (!query.trim()) return [];

  const params: unknown[] = [scope.serviceIds, scope.state, scope.role];

  const textLeg = (async (): Promise<Row[]> => {
    const strict = await prisma.$queryRawUnsafe<Row[]>(
      tsQuery("plainto_tsquery"), query, ...params,
    );
    if (strict.length > 0) return strict;
    // plainto_tsquery ANDs every term together — one off-vocabulary word
    // (typo, jargon) blanks the whole leg. websearch_to_tsquery tolerates
    // that (OR-ish phrase handling), so retry before giving up on text.
    return prisma.$queryRawUnsafe<Row[]>(
      tsQuery("websearch_to_tsquery"), query, ...params,
    );
  })();

  const vectorLeg = (async (): Promise<Row[]> => {
    let vec: number[][] | null = null;
    try {
      vec = await embedTexts([query], { inputType: "query" });
    } catch (err) {
      logger.warn("Knowledge: query embedding threw", { err });
    }
    if (!vec || !vec[0]) return [];
    try {
      return await prisma.$queryRawUnsafe<Row[]>(VECTOR_QUERY, toVectorLiteral(vec[0]), ...params);
    } catch (err) {
      // pgvector-side failure (missing extension/index, a transient DB
      // error on this leg) degrades to tsvector-only rather than rejecting
      // the whole Promise.all and losing the text leg's results too.
      logger.warn("Knowledge: vector search failed — tsvector only", { err });
      return [];
    }
  })();

  const [textRows, vectorRows] = await Promise.all([textLeg, vectorLeg]);

  const fused = new Map<string, KnowledgeHit>();
  const add = (rows: Row[], key: "tsRank" | "cosineDistance") => {
    rows.forEach((r, i) => {
      const prev = fused.get(r.chunkId);
      const inc = 1 / (RRF_K + i + 1);
      if (prev) {
        prev.fusedScore += inc;
        if (prev[key] == null) prev[key] = r[key];
      } else {
        fused.set(r.chunkId, { ...r, fusedScore: inc });
      }
    });
  };
  add(textRows, "tsRank");
  add(vectorRows, "cosineDistance");

  return [...fused.values()]
    .sort((a, b) => b.fusedScore - a.fusedScore)
    .slice(0, limit);
}

/** Tool-result text: one block per document, chunks in order, OpenUrl for citations. */
export function formatHitsForPrompt(hits: KnowledgeHit[]): string {
  const byDoc = new Map<string, KnowledgeHit[]>();
  for (const h of hits) {
    const list = byDoc.get(h.sourceId) ?? [];
    list.push(h);
    byDoc.set(h.sourceId, list);
  }
  const parts: string[] = [];
  for (const [, list] of byDoc) {
    const first = list[0];
    const head = [`### ${first.title} (${first.category}, ${first.tier})`];
    if (first.externalUrl) head.push(`OpenUrl: ${first.externalUrl}`);
    const body = [...list]
      .sort((a, b) => a.chunkIndex - b.chunkIndex)
      .map((c) => (c.heading ? `**${c.heading}**\n${c.content}` : c.content))
      .join("\n\n");
    parts.push(`${head.join("\n")}\n\n${body}`);
  }
  return parts.join("\n\n---\n\n");
}
