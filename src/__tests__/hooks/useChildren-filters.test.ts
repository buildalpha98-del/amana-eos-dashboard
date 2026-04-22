import { describe, it, expect } from "vitest";
import { deriveFilterOptions } from "@/hooks/useChildren";

describe("deriveFilterOptions", () => {
  it("returns sorted distinct rooms from Child.room only", () => {
    const opts = deriveFilterOptions([
      { room: "R2" },
      { room: null }, // OWNA-only data not considered; see Commit 2 contract
      { room: "R1" },
    ]);
    expect(opts.roomOptions).toEqual(["R1", "R2"]);
  });

  it("returns distinct ccsStatus values", () => {
    const opts = deriveFilterOptions([
      { ccsStatus: "eligible" },
      { ccsStatus: "pending" },
      { ccsStatus: "eligible" },
    ]);
    expect(opts.ccsStatusOptions).toEqual(["eligible", "pending"]);
  });

  it("flattens tags arrays to a distinct sorted list", () => {
    const opts = deriveFilterOptions([
      { tags: ["a", "b"] },
      { tags: ["b", "c"] },
    ]);
    expect(opts.tagOptions).toEqual(["a", "b", "c"]);
  });
});
