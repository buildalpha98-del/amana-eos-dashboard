import { describe, it, expect } from "vitest";
import type { Prisma } from "@prisma/client";

/**
 * Pure type-level smoke — asserts Prisma client knows about the new
 * Child.ccsStatus / room / tags fields. If this file compiles, the
 * migration applied to the client. If it doesn't, regenerate.
 */
describe("Child schema — ccsStatus / room / tags", () => {
  it("types ccsStatus as string | null", () => {
    const payload: Prisma.ChildUpdateInput = { ccsStatus: "eligible" };
    expect(payload.ccsStatus).toBe("eligible");
  });

  it("types room as string | null", () => {
    const payload: Prisma.ChildUpdateInput = { room: "R1" };
    expect(payload.room).toBe("R1");
  });

  it("types tags as string[]", () => {
    const payload: Prisma.ChildUpdateInput = { tags: { set: ["siblings", "vip"] } };
    expect(payload.tags).toBeDefined();
  });

  it("supports hasSome on tags in a where clause", () => {
    const where: Prisma.ChildWhereInput = { tags: { hasSome: ["siblings"] } };
    expect(where.tags).toBeDefined();
  });
});
