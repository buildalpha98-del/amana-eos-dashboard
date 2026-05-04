import { describe, it, expect } from "vitest";
import { MergeTagNode } from "@/components/contracts/templates/MergeTagNode";

describe("MergeTagNode", () => {
  it("has the right node config", () => {
    expect(MergeTagNode.name).toBe("mergeTag");
    expect(MergeTagNode.config.group).toBe("inline");
    expect(MergeTagNode.config.inline).toBe(true);
    expect(MergeTagNode.config.atom).toBe(true);
  });

  it("is selectable", () => {
    expect(MergeTagNode.config.selectable).toBe(true);
  });

  it("has a key attribute defined", () => {
    // addAttributes is a function on the config; call it to get the attribute map
    const attrs = MergeTagNode.config.addAttributes?.();
    expect(attrs).toBeDefined();
    expect(attrs?.key).toBeDefined();
    expect(attrs?.key.default).toBe("");
  });

  it("parses span[data-merge-tag] elements", () => {
    const rules = MergeTagNode.config.parseHTML?.();
    expect(Array.isArray(rules)).toBe(true);
    expect(rules?.[0].tag).toBe("span[data-merge-tag]");
  });
});
