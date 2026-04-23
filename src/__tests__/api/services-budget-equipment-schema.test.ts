import { describe, it, expect, vi } from "vitest";

// withApiAuth pulls in server-side deps when the route module is imported,
// so stub the ones that would otherwise complain in a unit test.
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })
  ),
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
  generateRequestId: () => "test-req-id",
}));
vi.mock("@/lib/budget-helpers", () => ({
  recalcFinancialsForWeek: vi.fn(() => Promise.resolve()),
}));

import { equipmentItemSchema } from "@/app/api/services/[id]/budget/equipment/route";

const basePayload = {
  name: "Paper towels",
  amount: 12.5,
  date: "2026-04-22",
};

describe("equipmentItemSchema — Other category requires notes", () => {
  it("accepts a non-Other category with no notes", () => {
    const result = equipmentItemSchema.safeParse({
      ...basePayload,
      category: "cleaning",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an Other category with meaningful notes", () => {
    const result = equipmentItemSchema.safeParse({
      ...basePayload,
      category: "other",
      notes: "Gift card for parent event",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an Other category with no notes", () => {
    const result = equipmentItemSchema.safeParse({
      ...basePayload,
      category: "other",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const { fieldErrors } = result.error.flatten();
      expect(fieldErrors.notes?.[0]).toMatch(/Other category/);
    }
  });

  it("rejects an Other category with whitespace-only notes", () => {
    const result = equipmentItemSchema.safeParse({
      ...basePayload,
      category: "other",
      notes: "   ",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const { fieldErrors } = result.error.flatten();
      expect(fieldErrors.notes?.[0]).toMatch(/Other category/);
    }
  });

  it("still rejects a missing name regardless of category", () => {
    const result = equipmentItemSchema.safeParse({
      ...basePayload,
      name: "",
      category: "cleaning",
    });
    expect(result.success).toBe(false);
  });
});
