import { describe, it, expect } from "vitest";
import {
  createReflectionSchema,
  updateReflectionSchema,
  REFLECTION_TYPES,
  MTOP_OUTCOMES,
} from "@/lib/schemas/staff-reflection";

const base = { title: "Daily reflection", content: "The children built a cubby." };

describe("createReflectionSchema", () => {
  it("accepts the daily type", () => {
    const r = createReflectionSchema.safeParse({ ...base, type: "daily" });
    expect(r.success).toBe(true);
  });

  it("still accepts all legacy types", () => {
    for (const type of ["weekly", "monthly", "critical", "team"]) {
      expect(createReflectionSchema.safeParse({ ...base, type }).success).toBe(true);
    }
  });

  it("exports daily in REFLECTION_TYPES and the five MTOP outcomes", () => {
    expect(REFLECTION_TYPES).toContain("daily");
    expect(MTOP_OUTCOMES).toEqual([
      "Identity",
      "Community",
      "Wellbeing",
      "Learners",
      "Communicators",
    ]);
  });

  it("accepts valid mtopOutcomes and rejects unknown ones", () => {
    expect(
      createReflectionSchema.safeParse({
        ...base,
        type: "daily",
        mtopOutcomes: ["Identity", "Wellbeing"],
      }).success,
    ).toBe(true);
    expect(
      createReflectionSchema.safeParse({
        ...base,
        type: "daily",
        mtopOutcomes: ["Bogus"],
      }).success,
    ).toBe(false);
  });

  it("accepts childIds as cuids and rejects non-cuids", () => {
    expect(
      createReflectionSchema.safeParse({
        ...base,
        type: "daily",
        childIds: ["cjld2cjxh0000qzrmn831i7rn"],
      }).success,
    ).toBe(true);
    expect(
      createReflectionSchema.safeParse({
        ...base,
        type: "daily",
        childIds: ["not-a-cuid!"],
      }).success,
    ).toBe(false);
  });

  it("accepts shareWithParents boolean and rejects non-boolean", () => {
    expect(
      createReflectionSchema.safeParse({ ...base, type: "daily", shareWithParents: true })
        .success,
    ).toBe(true);
    expect(
      createReflectionSchema.safeParse({ ...base, type: "daily", shareWithParents: "yes" })
        .success,
    ).toBe(false);
  });

  it("treats all new fields as optional (legacy payloads unchanged)", () => {
    const r = createReflectionSchema.safeParse({
      ...base,
      type: "weekly",
      qualityAreas: [1, 3],
      mood: "positive",
    });
    expect(r.success).toBe(true);
  });
});

describe("updateReflectionSchema", () => {
  it("does not accept childIds or shareWithParents (no retroactive re-fan-out)", () => {
    const r = updateReflectionSchema.safeParse({
      childIds: ["cjld2cjxh0000qzrmn831i7rn"],
      shareWithParents: true,
    });
    // .strip() default: unknown keys are dropped, so parse succeeds but keys are gone
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).not.toHaveProperty("childIds");
      expect(r.data).not.toHaveProperty("shareWithParents");
    }
  });

  it("allows partial updates including mtopOutcomes", () => {
    const r = updateReflectionSchema.safeParse({ mtopOutcomes: ["Learners"] });
    expect(r.success).toBe(true);
  });
});
