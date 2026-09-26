/**
 * Client mirror of the AI-knowledge console's API shapes.
 *
 * `KnowledgeEntrySummary` matches `ENTRY_SELECT` + `toEntry()` in
 * src/app/api/settings/ai-knowledge/_lib/entry.ts field-for-field (Dates
 * arrive as ISO strings). The enums mirror the Prisma `Knowledge*` enums.
 */
export type SourceKind =
  | "sharepoint"
  | "policy_upload"
  | "help_article"
  | "handbook"
  | "lms_module"
  | "centre_facts"
  | "regulator"
  | "manual";
export type Category = "policy" | "procedure" | "sop" | "guide" | "reference" | "centre";
export type Tier = "safety_critical" | "general";
export type Status = "active" | "superseded" | "excluded";

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
  indexError: string | null;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
}
export interface KnowledgeEntryDetail extends KnowledgeEntrySummary {
  body: string;
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

export const CATEGORIES: Category[] = ["policy", "procedure", "sop", "guide", "reference", "centre"];

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
    errors?: { path?: string; sourceId?: string; error: string }[];
    fetchErrors?: { id: string; error: string }[];
  };
  error: string | null;
}
