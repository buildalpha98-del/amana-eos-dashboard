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
 *
 * A company SOP (`category: "sop"`) is NEVER safety-critical, whatever its
 * title says: the Jayden SOP set is over a year old and must not be quoted
 * verbatim as the authority on anything the state policies / procedures
 * cover — "OPS-08 Medical Administration" reads as `general`, so the
 * safety-critical answer comes from "QA2 Managing Medical Conditions
 * Procedure" instead. `tierOverride` still lets an admin promote one.
 */
const SAFETY_TITLE = /child\s*protection|safeguard|medication|medical\s*condition|incident|injur|emergency|evacuat|lockdown|bushfire|safe\s*arrival|safe\s*collection|collection\s+of\s+children|missing\s*child|anaphylaxis|allerg|asthma|epilep|diabet|first\s*aid|infectious|illness|water\s*safety|sun\s*safe|excursion|safe\s*transport|transport(ing)?\s+(of\s+)?children/i;

export function inferTier(input: {
  qualityArea: number | null;
  title: string;
  category?: KnowledgeCategory | null;
}): KnowledgeTier {
  if (input.category === "sop") return "general";
  if (input.qualityArea === 2) return "safety_critical";
  return SAFETY_TITLE.test(input.title) ? "safety_critical" : "general";
}

/** sha256 of the trimmed text — the "did it change" check. */
export function hashContent(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex");
}

/**
 * Words that follow a `password`/`pwd` LABEL in ordinary policy prose, never
 * in front of a real value — "Password: must be at least 8 characters",
 * "Password: minimum eight characters". A genuine secret never opens with
 * one of these, so excluding them (rather than relying only on the
 * value-shape check below) is what keeps short stopwords like "at"/"a" out
 * even though they'd otherwise be too short to need it.
 */
const PASSWORD_PROSE_CONTINUATION =
  "(?:must|should|shall|is|are|will|minimum|maximum|at|to|the|a|an)\\b";

/**
 * `password`/`pwd`/`passwd` followed by a value that looks like a secret,
 * not prose: excludes the continuation words above; the value-shape check
 * (a digit or symbol INSIDE the value, ignoring trailing sentence
 * punctuation) lives in `passwordValueLooksSecret` below, so "reset your
 * password before your first shift" and "Password: required." don't trip it
 * just for being long enough. Global so every labelled occurrence in a
 * document is checked, not only the first.
 */
const CREDENTIAL_PASSWORD_RE = new RegExp(
  `\\b(?:password|pwd|passwd)\\s*[:=]\\s*(?!${PASSWORD_PROSE_CONTINUATION})(\\S{4,})`,
  "gi",
);

/**
 * The value-shape check for password-style labels, applied in code rather
 * than as a lookahead: sentence punctuation glued to the end of a plain word
 * ("Password: required." / "Password: mandatory!") is not a symbol IN the
 * value, so it is stripped before asking "does this contain a digit or
 * symbol?". A real secret that happens to end a sentence ("Password:
 * hunter22.") still passes because the digit sits inside the value.
 */
function passwordValueLooksSecret(raw: string): boolean {
  const value = raw.replace(/[.,!?;:]+$/, "");
  return value.length >= 4 && /[^A-Za-z]/.test(value);
}

/**
 * `api_key`/`secret`/`access_token`/`token` followed by a value 12+ chars
 * long that has BOTH a letter and a digit-or-symbol (`0-9`/`_`/`-`/`.`) —
 * an all-digit value like "Token: 12345678" is a reference number, not a
 * credential, and an all-letter value under this length is too easily a
 * plain word. Real keys/tokens (provider-style keys, JWT segments, etc.) always
 * mix character classes.
 */
const CREDENTIAL_TOKEN_RE =
  /\b(?:api[_ -]?key|secret|access[_ -]?token|token)\s*[:=]\s*(?=\S*[A-Za-z])(?=\S*[0-9_.-])\S{12,}/i;

/** `Bearer <16+ char token>` — unchanged; a bearer token is never prose. */
const CREDENTIAL_BEARER_RE = /\bBearer\s+[A-Za-z0-9._-]{16,}/;

/**
 * Content-level credential guard for the knowledge store (2026-09-27). A
 * SharePoint export or a pasted/uploaded document can embed a live
 * `Password: hunter22`-style secret inside a walkthrough step — the
 * SharePoint importer's PII floor (`classifyPath`) only looks at the
 * path/filename, so body text like this had no guard at all before an
 * export agent caught one by judgement.
 *
 * Deliberately narrow: only a labelled `word [:=] value` shape matches, and
 * the value itself must look secret-shaped (a digit/symbol for
 * password-style labels; a length + mixed-character-class value for
 * key/token-style labels) — so "password policy" / "reset your password
 * before your first shift" / "token of appreciation" / "Password: must be
 * at least 8 characters" / "Token: 12345678" (a reference number) never
 * trip it. The label alone, or the label followed by prose, is common; the
 * label followed by a secret-shaped value is what a real credential dump
 * looks like.
 *
 * Never log the text this matched against — the whole point is that it may
 * be a live secret. Callers should only report that content was rejected /
 * skipped, never the matched substring.
 */
export function looksLikeCredential(text: string): boolean {
  for (const m of text.matchAll(CREDENTIAL_PASSWORD_RE)) {
    if (passwordValueLooksSecret(m[1])) return true;
  }
  return CREDENTIAL_TOKEN_RE.test(text) || CREDENTIAL_BEARER_RE.test(text);
}
