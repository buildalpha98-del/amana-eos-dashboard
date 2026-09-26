import { createHash } from "node:crypto";
import type { KnowledgeCategory, KnowledgeTier } from "@prisma/client";
import { AUSTRALIAN_STATES } from "@/lib/service-scope";

/**
 * Dedupe key for a document title. Strips the tokens that vary between
 * copies of the SAME document — version ("V11"), state ("NSW"), the
 * ubiquitous "OSHC" suffix and the file extension — so
 * "QA2 Rest Time Procedure OSHC V2.docx" and "... V3.docx" collide.
 * State is stripped here because it is a SEPARATE column in the key
 * (normalizedTitle, state, serviceId) — see spec §5.
 */
export function normalizeTitle(raw: string): string {
  return raw
    .replace(/\.(docx?|pdf|pptx?|xlsx?|md|txt|html?)$/i, "")
    .replace(/\bV\s?\d+(?:\.\d+)?\b/gi, " ")
    // Standalone state tokens anywhere in the title. Also eats a bare
    // "SA"/"WA"/"NT"/"ACT" that isn't a state ("…National ACT…") — accepted:
    // the key only needs to be STABLE across copies of the same document.
    .replace(/\b(NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\b/g, " ")
    .replace(/\bOSHC\b/gi, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export interface FilenameMeta {
  qualityArea: number | null;
  version: number | null;
  state: string | null;
  category: KnowledgeCategory;
}

/** Category from the filename; adapters may override (e.g. the SOP tree). */
export function parseFilenameMeta(filename: string): FilenameMeta {
  const qa = filename.match(/\bQA\s?([1-7])\b/i);
  const v = filename.match(/\bV\s?(\d+)(?:\.\d+)?\b/i);
  const st = filename.match(/\b(NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\b/);
  const lower = filename.toLowerCase();
  let category: KnowledgeCategory = "guide";
  // "policy" wins over "procedure" when a filename contains both (policies are the parent document); "guide" is the fallback.
  if (/\bpolic(y|ies)\b/.test(lower)) category = "policy";
  else if (/\bprocedures?\b/.test(lower)) category = "procedure";
  return {
    qualityArea: qa ? Number(qa[1]) : null,
    version: v ? Number(v[1]) : null,
    state: st ? st[1] : null,
    category,
  };
}

/** "New South Wales" | "nsw" → "NSW"; unknown/blank → null. */
export function canonicalState(raw: string | null | undefined): string | null {
  const t = raw?.trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  const hit = AUSTRALIAN_STATES.find(
    (s) => s.value.toLowerCase() === lower || s.label.toLowerCase() === lower,
  );
  return hit ? hit.value : null;
}

/**
 * Spec §3.5 heuristic. QA2 (Children's Health & Safety) is always
 * safety-critical; otherwise the title decides. Admin `tierOverride`
 * beats this at query time.
 */
const SAFETY_TITLE = /child\s*protection|safeguard|medication|medical\s*condition|incident|injur|emergency|evacuat|lockdown|bushfire|safe\s*arrival|safe\s*collection|collection\s+of\s+children|missing\s*child|anaphylaxis|allerg|asthma|epilep|diabet|first\s*aid|infectious|illness|water\s*safety|sun\s*safe|excursion|safe\s*transport|transport(ing)?\s+(of\s+)?children/i;

export function inferTier(input: {
  qualityArea: number | null;
  title: string;
}): KnowledgeTier {
  if (input.qualityArea === 2) return "safety_critical";
  return SAFETY_TITLE.test(input.title) ? "safety_critical" : "general";
}

/** sha256 of the trimmed text — the "did it change" check. */
export function hashContent(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex");
}
