/**
 * Client mirror of the AI-knowledge console's API shapes.
 *
 * `KnowledgeEntrySummary` matches `ENTRY_SELECT` + `toEntry()` in
 * src/app/api/settings/ai-knowledge/_lib/entry.ts field-for-field (Dates
 * arrive as ISO strings). The enums mirror the Prisma `Knowledge*` enums.
 */
export const SOURCE_KINDS = [
  "sharepoint",
  "policy_upload",
  "help_article",
  "handbook",
  "lms_module",
  "centre_facts",
  "regulator",
  "manual",
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const CATEGORIES = ["policy", "procedure", "sop", "guide", "reference", "centre"] as const;
export type Category = (typeof CATEGORIES)[number];

export const TIERS = ["safety_critical", "general"] as const;
export type Tier = (typeof TIERS)[number];

export const STATUSES = ["active", "superseded", "excluded"] as const;
export type Status = (typeof STATUSES)[number];

const oneOf = <T extends string>(list: readonly T[], v: string): v is T =>
  (list as readonly string[]).includes(v);

/**
 * Type guards for `<select>` values. The options are lists we control, but
 * a guard keeps that a runtime fact rather than a cast that a future option
 * could silently outgrow.
 */
export const isSourceKind = (v: string): v is SourceKind => oneOf(SOURCE_KINDS, v);
export const isCategory = (v: string): v is Category => oneOf(CATEGORIES, v);
export const isTier = (v: string): v is Tier => oneOf(TIERS, v);
export const isStatus = (v: string): v is Status => oneOf(STATUSES, v);

export interface KnowledgeEntrySummary {
  id: string;
  title: string;
  sourceKind: SourceKind;
  category: Category;
  tier: Tier;
  tierOverride: Tier | null;
  qualityArea: number | null;
  serviceId: string | null;
  serviceName: string | null;
  state: string | null;
  version: number | null;
  status: Status;
  /** `String?` in the schema; the pipeline only ever writes these two values. */
  excludedBy: "adapter" | "admin" | null;
  externalUrl: string | null;
  indexedAt: string | null;
  /** A FAILED index (set) — a tsvector-only index is `embedded: false` with this null. */
  indexError: string | null;
  /** true when every chunk has a vector; false = keyword-only (degraded, not an error). */
  embedded: boolean;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
}
export interface KnowledgeEntryDetail extends KnowledgeEntrySummary {
  body: string;
}

/** The per-row PATCH body: tier override and exclude / restore. */
export interface KnowledgePatchBody {
  tierOverride?: Tier | null;
  status?: "active" | "excluded";
}

/** Only `manual` rows are editable/deletable in the console; everything else changes at its origin. */
export const isManual = (e: { sourceKind: SourceKind }) => e.sourceKind === "manual";
/** Uploaded files carry a Blob URL; pasted text does not. */
export const isFile = (e: { sourceKind: SourceKind; externalUrl: string | null }) =>
  isManual(e) && Boolean(e.externalUrl);

export const KIND_LABEL: Record<SourceKind, string> = {
  sharepoint: "SharePoint",
  policy_upload: "Policy PDF",
  help_article: "Help article",
  handbook: "Handbook",
  lms_module: "Training module",
  centre_facts: "Centre facts",
  regulator: "Regulator",
  manual: "Manual",
};

/** One `KnowledgeSyncRun` row as `GET /api/settings/ai-knowledge/sync` returns it. */
export interface SyncRunSummary {
  id: string;
  adapter: string;
  startedAt: string;
  finishedAt: string | null;
  counts: Record<string, number>;
  details: {
    conflicts?: { normalizedTitle: string; state: string | null; version: number | null; paths: string[] }[];
    unmapped?: { path: string; centreFolder: string }[];
    errors?: { path?: string; sourceId?: string; error?: string }[];
    fetchErrors?: { id: string; error: string }[];
    /** backfill only: pending policy PDFs not reached by this run's batch of 25. */
    policiesRemaining?: number;
  };
  error: string | null;
}

/** `GET /api/settings/ai-knowledge/sync` — latest run per adapter + whether Voyage is configured. */
export interface SyncRunsResponse {
  runs: SyncRunSummary[];
  /** false = `VOYAGE_API_KEY` unset: every index is keyword-only until it is set and a Sync runs. */
  embeddingsConfigured: boolean;
}
