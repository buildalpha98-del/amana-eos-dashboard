/**
 * "Is there a curriculum to be gated on?"
 *
 * The lock now asks this before shutting anyone out. The failure mode that
 * matters is the error path: reporting "nothing published" on a database
 * hiccup would unlock every gated new starter across the org at once.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  generateRequestId: () => "test-req",
}));

import {
  hasPublishedEssentials,
  _clearEssentialsCache,
} from "@/lib/induction-essentials";

beforeEach(() => {
  vi.clearAllMocks();
  _clearEssentialsCache();
});

describe("hasPublishedEssentials", () => {
  it("is false when the essential track is empty or all drafts", async () => {
    prismaMock.lMSCourse.count.mockResolvedValue(0 as never);
    expect(await hasPublishedEssentials()).toBe(false);

    // Counts PUBLISHED, non-deleted, essential-track courses only.
    const where = prismaMock.lMSCourse.count.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({
      track: "essential",
      status: "published",
      deleted: false,
    });
  });

  it("is true once one is published", async () => {
    prismaMock.lMSCourse.count.mockResolvedValue(1 as never);
    expect(await hasPublishedEssentials()).toBe(true);
  });

  it("assumes the gate applies when the database is unreachable", async () => {
    // The conservative direction: a blink must not unlock everyone.
    prismaMock.lMSCourse.count.mockRejectedValue(new Error("db down") as never);
    expect(await hasPublishedEssentials()).toBe(true);
  });

  it("caches so a token refresh isn't a query every time", async () => {
    prismaMock.lMSCourse.count.mockResolvedValue(1 as never);
    await hasPublishedEssentials();
    await hasPublishedEssentials();
    await hasPublishedEssentials();
    expect(prismaMock.lMSCourse.count).toHaveBeenCalledTimes(1);
  });
});
