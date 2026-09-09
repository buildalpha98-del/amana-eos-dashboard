import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";
import { createRequest } from "../../helpers/request";

vi.mock("@/lib/logger", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
});

const acquireCronLock = vi.fn();
vi.mock("@/lib/cron-guard", () => ({
  acquireCronLock: (name: string, period: string) =>
    acquireCronLock(name, period),
}));

import { GET } from "@/app/api/cron/recurring-todos/route";

const ORIGINAL_ENV = { ...process.env };

function templateRow(recurrence: string, nextRunAt: Date) {
  return {
    id: `tpl-${recurrence}`,
    title: `Recurring ${recurrence}`,
    description: null,
    assigneeId: "u1",
    serviceId: null,
    createdById: "u1",
    isActive: true,
    recurrence,
    nextRunAt,
  };
}

describe("/api/cron/recurring-todos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    acquireCronLock.mockResolvedValue({ acquired: true });
    prismaMock.todo.create.mockResolvedValue({});
    prismaMock.todoTemplate.update.mockResolvedValue({});
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  const authedRequest = () =>
    createRequest("GET", "/api/cron/recurring-todos", {
      headers: { authorization: "Bearer test-cron-secret" },
    });

  it("401s without the cron secret", async () => {
    const req = createRequest("GET", "/api/cron/recurring-todos");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("skips when the lock is not acquired", async () => {
    acquireCronLock.mockResolvedValue({ acquired: false, reason: "already ran" });
    const res = await GET(authedRequest());
    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(prismaMock.todo.create).not.toHaveBeenCalled();
  });

  it.each([
    ["daily", 1],
    ["weekly", 7],
    ["fortnightly", 14],
  ])("%s template gets dueDate nextRunAt + %s days", async (rule, days) => {
    const nextRunAt = new Date("2026-08-31T00:00:00Z");
    prismaMock.todoTemplate.findMany.mockResolvedValue([
      templateRow(rule, nextRunAt),
    ]);

    const res = await GET(authedRequest());
    expect(res.status).toBe(200);

    const created = prismaMock.todo.create.mock.calls[0][0] as {
      data: { dueDate: Date };
    };
    const expected = new Date(nextRunAt);
    expected.setDate(expected.getDate() + days);
    expect(created.data.dueDate.toISOString()).toBe(expected.toISOString());
  });

  it("monthly template gets dueDate nextRunAt + 1 month", async () => {
    const nextRunAt = new Date("2026-08-31T00:00:00Z");
    prismaMock.todoTemplate.findMany.mockResolvedValue([
      templateRow("monthly", nextRunAt),
    ]);

    await GET(authedRequest());

    const created = prismaMock.todo.create.mock.calls[0][0] as {
      data: { dueDate: Date };
    };
    const expected = new Date(nextRunAt);
    expected.setMonth(expected.getMonth() + 1);
    expect(created.data.dueDate.toISOString()).toBe(expected.toISOString());
  });

  it("advances nextRunAt by the same period as the due date", async () => {
    const nextRunAt = new Date("2026-08-31T00:00:00Z");
    prismaMock.todoTemplate.findMany.mockResolvedValue([
      templateRow("daily", nextRunAt),
    ]);

    await GET(authedRequest());

    const update = prismaMock.todoTemplate.update.mock.calls[0][0] as {
      data: { nextRunAt: Date };
    };
    const expected = new Date(nextRunAt);
    expected.setDate(expected.getDate() + 1);
    expect(update.data.nextRunAt.toISOString()).toBe(expected.toISOString());
  });
});
