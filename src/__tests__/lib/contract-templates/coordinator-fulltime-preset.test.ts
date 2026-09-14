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

  it("states ordinary hours as a fixed figure, not a minimum (clause 4.1)", () => {
    expect(fullTimeText).toContain("Your ordinary hours of work will be ");
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

  it("keeps the hours merge tag so the contract matches the record it was issued from", () => {
    const tags = JSON.stringify(COORDINATOR_FULLTIME_CONTENT_JSON);
    expect(tags).toContain("contract.hoursPerWeek");
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
