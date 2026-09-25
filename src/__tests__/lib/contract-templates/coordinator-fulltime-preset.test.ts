/**
 * The full-time coordinator contract is DERIVED from the part-time one.
 *
 * That buys lockstep maintenance but costs a risk: a reworded part-time
 * clause could stop matching, and the derivation would quietly emit a
 * contract that calls itself full-time while guaranteeing part-time
 * minimum hours. These tests exist to make that impossible to ship — they
 * assert both what changed AND that nothing part-time survives anywhere in
 * the document.
 */
import { describe, it, expect } from "vitest";
import {
  COORDINATOR_FULLTIME_CONTENT_JSON,
  COORDINATOR_FULLTIME_TEMPLATE_NAME,
} from "@/lib/contract-templates/coordinator-fulltime-preset";
import {
  COORDINATOR_PERMANENT_CONTENT_JSON,
  COORDINATOR_PERMANENT_TEMPLATE_NAME,
} from "@/lib/contract-templates/coordinator-permanent-preset";

function flatten(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { text?: unknown; content?: unknown };
  if (typeof n.text === "string") return n.text;
  if (Array.isArray(n.content)) return n.content.map(flatten).join("");
  return "";
}

const fullTimeText = COORDINATOR_FULLTIME_CONTENT_JSON.content
  .map(flatten)
  .join("\n");
const partTimeText = COORDINATOR_PERMANENT_CONTENT_JSON.content
  .map(flatten)
  .join("\n");

describe("OSHC Coordinator — Full-Time Permanent preset", () => {
  it("is a distinct template from the part-time one", () => {
    expect(COORDINATOR_FULLTIME_TEMPLATE_NAME).not.toBe(
      COORDINATOR_PERMANENT_TEMPLATE_NAME,
    );
    expect(COORDINATOR_FULLTIME_TEMPLATE_NAME).toMatch(/full-time/i);
  });

  it("engages the employee on a full time basis (clause 1.2)", () => {
    expect(fullTimeText).toContain("You are employed on a full time basis");
  });

  it("supersedes prior agreements on a full-time basis (clause 1.3)", () => {
    expect(fullTimeText).toContain("on a full-time permanent basis going forward");
  });

  it("states 38 ordinary hours per week as a literal (clause 4.1)", () => {
    // 38 ordinary hours IS the Children's Services Award definition of
    // full time, so the figure belongs to the template rather than to the
    // row the contract is issued from.
    expect(fullTimeText).toContain(
      "Your ordinary hours of work will be 38 hours per week.",
    );
    expect(fullTimeText).not.toContain("ordinary hours of work will be a minimum of");
  });

  it("keeps the ONE legitimate mention of part-time and no other", () => {
    // Clause 1.3 lists the kinds of PRIOR agreement this contract
    // supersedes — "(whether casual, part-time, permanent, or fixed-term)"
    // — which is correct in a full-time contract and must survive. Every
    // other part-time mention would be describing THIS engagement, and
    // must not.
    const PRIOR_AGREEMENT_LIST =
      "(whether casual, part-time, permanent, or fixed-term)";
    expect(fullTimeText).toContain(PRIOR_AGREEMENT_LIST);

    const withoutTheList = fullTimeText.split(PRIOR_AGREEMENT_LIST).join("");
    // The blunt guarantee: if a future edit to the part-time preset breaks
    // a derivation rule, this catches the leftover even when the targeted
    // assertions above happen to still pass.
    expect(withoutTheList).not.toMatch(/part[- ]time/i);
  });

  it("drops the hours merge tag entirely — 4.1 must not be data-driven", () => {
    // The tag is a NODE, not text, so a rewrite would have left it in place
    // rendering "…will be 38 hours per week." followed by a stray figure.
    // Assert on the serialised doc, which is the only thing that proves the
    // node is gone rather than merely unreferenced by the visible text.
    const doc = JSON.stringify(COORDINATOR_FULLTIME_CONTENT_JSON);
    expect(doc).not.toContain("contract.hoursPerWeek");

    // The part-time original still has it — this is a full-time-only change.
    expect(JSON.stringify(COORDINATOR_PERMANENT_CONTENT_JSON)).toContain(
      "contract.hoursPerWeek",
    );
  });

  it("renders 38 without needing any contract data", () => {
    // The point of the literal: no EmploymentContract row is consulted, so
    // the clause reads the same however the row is filled in.
    const clause = COORDINATOR_FULLTIME_CONTENT_JSON.content
      .map(flatten)
      .find((line) => line.startsWith("4.1 "));
    expect(clause).toBe(
      "4.1 Your ordinary hours of work will be 38 hours per week.",
    );
  });

  it("changes ONLY the three clauses it claims to change", () => {
    const fullLines = fullTimeText.split("\n");
    const partLines = partTimeText.split("\n");
    expect(fullLines).toHaveLength(partLines.length);

    const differing = fullLines
      .map((line, i) => (line === partLines[i] ? null : i))
      .filter((i): i is number => i !== null);

    // 1.2, 1.3 and 4.1 — no more. A fourth difference means the derivation
    // is doing something its header doesn't describe.
    expect(differing).toHaveLength(3);
  });

  it("carries the shared clauses through verbatim", () => {
    // Spot-check that this really is the same contract: probation, the NES
    // notice section and the signature block must survive the derivation.
    for (const shared of [
      "month probationary period",
      "public holiday",
      "Signed by the Employee:",
    ]) {
      expect(fullTimeText).toContain(shared);
      expect(partTimeText).toContain(shared);
    }
  });

  it("preserves the merge tags the issue flow depends on", () => {
    const full = JSON.stringify(COORDINATOR_FULLTIME_CONTENT_JSON);
    const part = JSON.stringify(COORDINATOR_PERMANENT_CONTENT_JSON);
    for (const key of [
      "staff.fullName",
      "contract.startDate",
      "contract.position",
      // NB: contract.hoursPerWeek is deliberately absent from the
      // full-time template — see the 4.1 tests above.
      "contract.payRate",
      "signature.admin",
      "signature.staff",
      "custom.probationMonths",
    ]) {
      expect(part).toContain(key);
      expect(full).toContain(key);
    }
  });
});
