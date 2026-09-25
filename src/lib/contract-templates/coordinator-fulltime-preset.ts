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
 * Clause 4.1 states 38 hours as a LITERAL, not via
 * `{{contract.hoursPerWeek}}` (Jayden's call, 2026-09-14). 38 ordinary
 * hours per week IS the Children's Services Award 2010 definition of
 * full time, so the figure belongs to the template rather than to the
 * row it is issued from — a full-time contract that rendered some other
 * number would be describing something that is not full-time employment.
 *
 * The trade-off, stated plainly because it is real: if an
 * EmploymentContract row carries hoursPerWeek other than 38, the issued
 * document will still read 38 and will not match that field. The field
 * remains the payroll figure; the clause is the contractual definition.
 * If that divergence ever needs catching, the place to catch it is a
 * validation at issue time, not a merge tag here.
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
 * Ordinary hours for a full-time employee under the Children's Services
 * Award 2010 (MA000120). Named rather than inlined so the one place the
 * figure lives is obvious if the award ever moves.
 */
const FULL_TIME_ORDINARY_HOURS = 38;

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

/**
 * Swap the single node whose combined text contains `needle` for
 * `replacement`.
 *
 * Distinct from `rewriteClause` because a clause can contain non-text
 * nodes: 4.1 holds a `mergeTag` node between two text runs, and no amount
 * of string rewriting removes it. Same exactly-one-match contract, same
 * loud failure.
 */
function replaceClause(
  nodes: readonly unknown[],
  needle: string,
  replacement: Node,
  label: string,
): Node[] {
  const matches = nodes.filter((n) => textOf(n).includes(needle));
  if (matches.length !== 1) {
    throw new Error(
      `coordinator-fulltime-preset: expected exactly 1 node containing ${JSON.stringify(needle)} for ${label}, found ${matches.length}. ` +
        "The part-time preset has changed — update the full-time derivation to match before issuing any contract from it.",
    );
  }
  return nodes.map((node) =>
    matches.includes(node) ? replacement : (node as Node),
  );
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

// 4.1 — full time is 38 ordinary hours per week under the Children's
// Services Award 2010. The whole paragraph is replaced rather than
// rewritten: part-time's version holds a `contract.hoursPerWeek` merge-tag
// NODE between two text runs, and the literal has to take its place.
content = replaceClause(
  content,
  "Your ordinary hours of work will be a minimum of",
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: `4.1 Your ordinary hours of work will be ${FULL_TIME_ORDINARY_HOURS} hours per week.`,
      },
    ],
  },
  "clause 4.1 (ordinary hours)",
);

export const COORDINATOR_FULLTIME_CONTENT_JSON = {
  type: "doc",
  content,
} as const;
