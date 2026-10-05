import type {
  KnowledgeCategory,
  KnowledgeSourceKind,
  KnowledgeTier,
} from "@prisma/client";

/** What every adapter hands to upsertKnowledgeSource(). */
export interface KnowledgeSourceInput {
  sourceKind: KnowledgeSourceKind;
  externalId: string;
  title: string;
  category: KnowledgeCategory;
  /** Full text to chunk. Markdown headings (#/##/###) become chunk boundaries. */
  text: string;
  externalUrl?: string | null;
  serviceId?: string | null;
  /** Free-form; canonicalised to an abbreviation by the pipeline. */
  state?: string | null;
  qualityArea?: number | null;
  version?: number | null;
  audienceRoles?: string[];
  /** Explicit tier from the adapter; otherwise inferTier() decides. */
  tier?: KnowledgeTier;
}

export type UpsertOutcome = "created" | "updated" | "unchanged" | "error";

export interface UpsertResult {
  sourceId: string;
  outcome: UpsertOutcome;
  error?: string;
}

export interface KnowledgeScope {
  role: string;
  /** null = unscoped (owner/admin/EOS); [] = no centre */
  serviceIds: string[] | null;
  /** canonical abbreviation or null = no state filter */
  state: string | null;
}

export interface KnowledgeHit {
  chunkId: string;
  sourceId: string;
  chunkIndex: number;
  content: string;
  heading: string | null;
  title: string;
  category: KnowledgeCategory;
  tier: KnowledgeTier;
  externalUrl: string | null;
  /** RRF score — ordering only, never a relevance threshold */
  fusedScore: number;
  /** cosine distance from the vector leg (0 = identical); null if not retrieved by it */
  cosineDistance: number | null;
  /** ts_rank from the tsvector leg; null if not retrieved by it */
  tsRank: number | null;
}
