import { describe, it, expect } from "vitest";
import { computeRag, buildRagMetric } from "@/lib/rag-status";

describe("computeRag (standard — higher is better)", () => {
  it("returns green when current >= target", () => {
    expect(computeRag({ current: 10, target: 10, floor: 5 })).toBe("green");
    expect(computeRag({ current: 15, target: 10, floor: 5 })).toBe("green");
  });

  it("returns amber when floor <= current < target", () => {
    expect(computeRag({ current: 7, target: 10, floor: 5 })).toBe("amber");
    expect(computeRag({ current: 5, target: 10, floor: 5 })).toBe("amber");
  });

  it("returns red when current < floor", () => {
    expect(computeRag({ current: 4, target: 10, floor: 5 })).toBe("red");
    expect(computeRag({ current: 0, target: 10, floor: 5 })).toBe("red");
  });
});

describe("computeRag (inverse — lower is better)", () => {
  it("returns green when current <= target", () => {
    expect(computeRag({ current: 2, target: 2, floor: 5, inverse: true })).toBe("green");
    expect(computeRag({ current: 0, target: 2, floor: 5, inverse: true })).toBe("green");
  });

  it("returns amber when target < current <= floor", () => {
    expect(computeRag({ current: 3, target: 2, floor: 5, inverse: true })).toBe("amber");
    expect(computeRag({ current: 5, target: 2, floor: 5, inverse: true })).toBe("amber");
  });

  it("returns red when current > floor", () => {
    expect(computeRag({ current: 6, target: 2, floor: 5, inverse: true })).toBe("red");
  });
});

describe("buildRagMetric", () => {
  it("returns the full metric shape", () => {
    expect(buildRagMetric({ current: 12, target: 10, floor: 5 })).toEqual({
      current: 12,
      target: 10,
      floor: 5,
      status: "green",
    });
  });
});
