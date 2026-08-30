import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import {
  recomputeRockProgress,
  recomputeRocksProgress,
} from "@/lib/todos/recompute-rock-progress";

describe("recomputeRockProgress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("computes percentComplete from non-deleted linked todos", async () => {
    prismaMock.todo.findMany.mockResolvedValue([
      { status: "complete" },
      { status: "complete" },
      { status: "pending" },
    ]);
    prismaMock.rock.update.mockResolvedValue({});

    await recomputeRockProgress(prismaMock as never, "rock-1");

    expect(prismaMock.todo.findMany).toHaveBeenCalledWith({
      where: { rockId: "rock-1", deleted: false },
      select: { status: true },
    });
    expect(prismaMock.rock.update).toHaveBeenCalledWith({
      where: { id: "rock-1" },
      data: { percentComplete: 67 },
    });
  });

  it("sets 0 when the rock has no linked todos", async () => {
    prismaMock.todo.findMany.mockResolvedValue([]);
    prismaMock.rock.update.mockResolvedValue({});

    await recomputeRockProgress(prismaMock as never, "rock-2");

    expect(prismaMock.rock.update).toHaveBeenCalledWith({
      where: { id: "rock-2" },
      data: { percentComplete: 0 },
    });
  });
});

describe("recomputeRocksProgress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recomputes each distinct rock once, skipping nulls", async () => {
    prismaMock.todo.findMany.mockResolvedValue([{ status: "complete" }]);
    prismaMock.rock.update.mockResolvedValue({});

    await recomputeRocksProgress(prismaMock as never, [
      "rock-a",
      null,
      "rock-b",
      "rock-a",
      null,
    ]);

    expect(prismaMock.rock.update).toHaveBeenCalledTimes(2);
    const updatedIds = prismaMock.rock.update.mock.calls.map(
      (c) => (c[0] as { where: { id: string } }).where.id,
    );
    expect(updatedIds.sort()).toEqual(["rock-a", "rock-b"]);
  });

  it("does nothing for an all-null list", async () => {
    await recomputeRocksProgress(prismaMock as never, [null, null]);
    expect(prismaMock.rock.update).not.toHaveBeenCalled();
  });
});
