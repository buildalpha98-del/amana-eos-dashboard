import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { resolveActivationFromUtm } from "@/lib/activation-attribution";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveActivationFromUtm", () => {
  it("returns null for null/undefined/empty", async () => {
    expect(await resolveActivationFromUtm(null)).toBeNull();
    expect(await resolveActivationFromUtm(undefined)).toBeNull();
    expect(await resolveActivationFromUtm("")).toBeNull();
    expect(await resolveActivationFromUtm("   ")).toBeNull();
  });

  it("returns null when shortCode has no match", async () => {
    prismaMock.campaignActivationAssignment.findUnique.mockResolvedValue(null);
    expect(await resolveActivationFromUtm("nope")).toBeNull();
  });

  it("returns activation id when shortCode matches", async () => {
    prismaMock.campaignActivationAssignment.findUnique.mockResolvedValue({ id: "a-1" });
    expect(await resolveActivationFromUtm("abc1234")).toBe("a-1");
  });

  it("trims whitespace", async () => {
    prismaMock.campaignActivationAssignment.findUnique.mockResolvedValue({ id: "a-1" });
    expect(await resolveActivationFromUtm("  abc1234  ")).toBe("a-1");
    const findArgs = prismaMock.campaignActivationAssignment.findUnique.mock.calls[0][0];
    expect(findArgs.where.qrShortCode).toBe("abc1234");
  });
});
