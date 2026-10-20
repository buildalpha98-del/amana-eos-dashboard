import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { logger } from "@/lib/logger";
import { enqueueTriage } from "@/lib/knox/enqueue";

const input = {
  subjectType: "incident" as const,
  subjectId: "inc-1",
  serviceId: "svc-1",
  reason: "created" as const,
};

type FindArgs = { where?: { status?: string } };

describe("enqueueTriage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.triageJob.findFirst.mockImplementation(async () => null);
    prismaMock.triageJob.create.mockImplementation(async () => ({ id: "job-1" }));
  });

  it("creates a pending job and returns its id", async () => {
    const id = await enqueueTriage(prismaMock as never, input);

    expect(id).toBe("job-1");
    expect(prismaMock.triageJob.create).toHaveBeenCalledTimes(1);
    const arg = prismaMock.triageJob.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(arg.data).toMatchObject({
      subjectType: "incident",
      subjectId: "inc-1",
      serviceId: "svc-1",
      reason: "created",
    });
    // status omitted so the schema default (pending) applies
    expect(arg.data).not.toHaveProperty("status");
  });

  it("returns the existing pending job id without creating", async () => {
    prismaMock.triageJob.findFirst.mockImplementation(async (args: FindArgs) =>
      args?.where?.status === "pending"
        ? { id: "job-0", status: "pending" }
        : null,
    );

    const id = await enqueueTriage(prismaMock as never, input);

    expect(id).toBe("job-0");
    expect(prismaMock.triageJob.create).not.toHaveBeenCalled();
  });

  it("a running job does not block a new pending one", async () => {
    // Only a non-pending (running) job exists; the lookup must filter on pending.
    prismaMock.triageJob.findFirst.mockImplementation(async (args: FindArgs) =>
      args?.where?.status === "running"
        ? { id: "job-run", status: "running" }
        : null,
    );

    const id = await enqueueTriage(prismaMock as never, input);

    expect(prismaMock.triageJob.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        subjectType: "incident",
        subjectId: "inc-1",
        status: "pending",
      }),
      select: { id: true },
    });
    expect(prismaMock.triageJob.create).toHaveBeenCalledTimes(1);
    expect(id).toBe("job-1");
  });

  it("swallows database errors and returns null", async () => {
    prismaMock.triageJob.create.mockImplementation(async () => {
      throw new Error("db down");
    });

    const id = await enqueueTriage(prismaMock as never, input);

    expect(id).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });
});
