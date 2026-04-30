import { describe, it, expect } from "vitest";
import { deepMergeSection } from "@/lib/centre-avatar/deep-merge";

describe("deepMergeSection", () => {
  it("returns next as-is when previous is undefined / not an object", () => {
    expect(deepMergeSection(undefined, { a: 1 })).toEqual({ a: 1 });
    expect(deepMergeSection(null, { a: 1 })).toEqual({ a: 1 });
    expect(deepMergeSection("scalar", { a: 1 })).toEqual({ a: 1 });
  });

  it("preserves previous keys not present in next (the no-data-loss property)", () => {
    const prev = { coordinator: { name: "Sara" }, schoolContacts: { principal: { name: "Mr X" } } };
    const next = { centreDetails: { officialName: "Centre A" } };
    const merged = deepMergeSection(prev, next);
    expect(merged).toEqual({
      coordinator: { name: "Sara" },
      schoolContacts: { principal: { name: "Mr X" } },
      centreDetails: { officialName: "Centre A" },
    });
  });

  it("recursively merges nested objects", () => {
    const prev = { coordinator: { name: "Sara", email: "sara@x.com" } };
    const next = { coordinator: { phone: "0400 000 000" } };
    const merged = deepMergeSection(prev, next);
    expect(merged).toEqual({
      coordinator: { name: "Sara", email: "sara@x.com", phone: "0400 000 000" },
    });
  });

  it("next value wins for shared scalar keys", () => {
    const prev = { coordinator: { name: "Sara" } };
    const next = { coordinator: { name: "Lina" } };
    expect(deepMergeSection(prev, next)).toEqual({ coordinator: { name: "Lina" } });
  });

  it("explicit null clears a field", () => {
    const prev = { coordinator: { name: "Sara", email: "sara@x.com" } };
    const next = { coordinator: { email: null } };
    expect(deepMergeSection(prev, next)).toEqual({
      coordinator: { name: "Sara", email: null },
    });
  });

  it("arrays fully replace (list semantics, not merge)", () => {
    const prev = { parentDrivers: ["homework", "quran"] };
    const next = { parentDrivers: ["working_parent"] };
    expect(deepMergeSection(prev, next)).toEqual({
      parentDrivers: ["working_parent"],
    });
  });

  it("does not mutate previous", () => {
    const prev = { coordinator: { name: "Sara" } };
    const prevSnapshot = JSON.parse(JSON.stringify(prev));
    deepMergeSection(prev, { coordinator: { email: "x@y.com" } });
    expect(prev).toEqual(prevSnapshot);
  });

  it("handles deeply nested merges (3+ levels)", () => {
    const prev = {
      schoolContacts: { principal: { name: "Mr X", email: "x@y.com" } },
    };
    const next = {
      schoolContacts: { principal: { phone: "123" }, marketingCoord: { name: "Lina" } },
    };
    expect(deepMergeSection(prev, next)).toEqual({
      schoolContacts: {
        principal: { name: "Mr X", email: "x@y.com", phone: "123" },
        marketingCoord: { name: "Lina" },
      },
    });
  });
});
