/**
 * Canonical OSHC Coordinator — Full-Time Permanent contract template.
 *
 * This is the SAME contract as "OSHC Coordinator — Part-Time Permanent"
 * (src/lib/contract-templates/coordinator-permanent-preset.ts), differing
 * only where part-time versus full-time genuinely changes the terms. It is
 * therefore DERIVED from that preset rather than copied: a clause fixed in
 * one is fixed in both, which is the whole point of "same contract, other
 * basis". A copy would drift the first time someone edited one of them.
 *
 * The three differences, and why each is a difference:
 *
 *   1.2  "part time basis" → "full time basis" — the engagement itself.
 *   1.3  "...on a part-time permanent basis going forward" → "full-time".
 *   4.1  Part-time states a MINIMUM hours guarantee (the Children's
 *        Services Award 2010 requires part-time employees to have agreed
 *        regular hours, so the floor is the protection). Full-time
 *        ordinary hours are a fixed figure, not a floor, so "a minimum
 *        of" is dropped.
 *
 * Everything else — probation, NES notice table, NES leave, remuneration,
 * IP, privacy, deductions, general clauses, signature blocks — is shared
 * verbatim.
 *
 * `{{contract.hoursPerWeek}}` is deliberately KEPT in 4.1 rather than
 * hardcoded to the award's 38. The rendered contract then always states
 * the hours actually recorded on the EmploymentContract row, so the
 * document can never contradict the record it was issued from. Issuing a
 * full-time contract at anything other than 38 is a data-entry question
 * for the admin, not something the template should paper over.
 */

import { COORDINATOR_PERMANENT_CONTENT_JSON } from "./coordinator-permanent-preset";

export const COORDINATOR_FULLTIME_TEMPLATE_NAME =
  "OSHC Coordinator — Full-Time Permanent";

export const COORDINATOR_FULLTIME_TEMPLATE_DESCRIPTION =
  "Full-time permanent OSHC Coordinator (Director of Service) — the same " +
  "contract as the part-time permanent template, with the employment " +
  "basis and ordinary-hours clause changed to full time. Governed by the " +
  "Children's Services Award 2010 (MA000120). 6-month probation, NES " +
  "notice table, NES leave, fortnightly pay, standard Amana clauses.";

// manualFields is a legacy DB column; the current issue flow derives
// input fields from `custom.*` merge tags found in the content instead.
export const COORDINATOR_FULLTIME_MANUAL_FIELDS: Array<{
  key: string;
  label: string;
  type: "text" | "longtext" | "date" | "number";
  required: boolean;
  default?: string;
}> = [];

// ─── Derivation ─────────────────────────────────────────────────────────────

type Node = Record<string, unknown>;

/**
 * Collect every text string in a node subtree, so a clause can be matched
 * on its wording rather than its index. Index-matching would silently
 * target the wrong clause the moment a paragraph is inserted above it.
 */
function textOf(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { text?: unknown; content?: unknown };
  if (typeof n.text === "string") return n.text;
  if (Array.isArray(n.content)) return n.content.map(textOf).join("");
  return "";
}

/**
 * Rewrite the text of the single node whose combined text contains
 * `needle`.
 *
 * Throws unless EXACTLY one node matches. That is deliberate and the
 * reason this derivation is safe to rely on: if the part-time preset is
 * reworded so a clause no longer matches — or is duplicated so two do —
 * this fails loudly at import, and the seed endpoint refuses to run.
 * The alternative failure mode is a contract that calls itself full-time
 * and then guarantees part-time minimum hours, which nobody would catch
 * until it had been signed.
 */
function rewriteClause(
  nodes: readonly unknown[],
  needle: string,
  rewrite: (text: string) => string,
  label: string,
): Node[] {
  const matches = nodes.filter((n) => textOf(n).includes(needle));
  if (matches.length !== 1) {
    throw new Error(
      `coordinator-fulltime-preset: expected exactly 1 node containing ${JSON.stringify(needle)} for ${label}, found ${matches.length}. ` +
        "The part-time preset has changed — update the full-time derivation to match before issuing any contract from it.",
    );
  }

  return nodes.map((node) => {
    if (!matches.includes(node)) return node as Node;
    return rewriteTextNodes(node, rewrite) as Node;
  });
}

/** Apply `rewrite` to every text node in a subtree, preserving marks. */
function rewriteTextNodes(node: unknown, rewrite: (t: string) => string): unknown {
  if (!node || typeof node !== "object") return node;
  const n = node as { text?: unknown; content?: unknown };
  if (typeof n.text === "string") {
    return { ...(node as object), text: rewrite(n.text) };
  }
  if (Array.isArray(n.content)) {
    return {
      ...(node as object),
      content: n.content.map((c) => rewriteTextNodes(c, rewrite)),
    };
  }
  return node;
}

let content: Node[] = [...COORDINATOR_PERMANENT_CONTENT_JSON.content] as Node[];

// 1.2 — the engagement basis.
content = rewriteClause(
  content,
  "You are employed on a part time basis in the position of",
  (text) => text.replace("on a part time basis", "on a full time basis"),
  "clause 1.2 (employment basis)",
);

// 1.3 — the supersession clause restates the basis at the end.
content = rewriteClause(
  content,
  "on a part-time permanent basis going forward",
  (text) =>
    text.replace(
      "on a part-time permanent basis going forward",
      "on a full-time permanent basis going forward",
    ),
  "clause 1.3 (prior agreements)",
);

// 4.1 — full-time ordinary hours are a fixed figure, not a floor.
content = rewriteClause(
  content,
  "Your ordinary hours of work will be a minimum of",
  (text) =>
    text.replace(
      "Your ordinary hours of work will be a minimum of ",
      "Your ordinary hours of work will be ",
    ),
  "clause 4.1 (ordinary hours)",
);

export const COORDINATOR_FULLTIME_CONTENT_JSON = {
  type: "doc",
  content,
} as const;
