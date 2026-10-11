import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";

const mocks = vi.hoisted(() => ({
  generateDraft: vi.fn(), saveDraft: vi.fn(), complete: vi.fn(), fail: vi.fn(),
}));
vi.mock("@/lib/ai-task-agent", () => ({ generateDraft: mocks.generateDraft, saveDraft: mocks.saveDraft }));
vi.mock("@/lib/cron-guard", () => ({ acquireCronLock: vi.fn(async () => ({ acquired: true, complete: mocks.complete, fail: mocks.fail })) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }, generateRequestId: () => "test" }));
import { GET } from "@/app/api/cron/ai-task-agent/route";

const call = () => GET(createRequest("GET", "/api/cron/ai-task-agent", { headers: { authorization: "Bearer test-secret" } }), { params: Promise.resolve({}) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "test-secret");
  vi.stubEnv("ANTHROPIC_API_KEY", "dummy-no-network");
  prismaMock.todo.findMany.mockResolvedValue([{ id: "todo-1", title: "Draft a checklist" }]);
  for (const model of ["marketingTask", "coworkTodo", "supportTicket", "issue"]) prismaMock[model].findMany.mockResolvedValue([]);
  prismaMock.user.findFirst.mockResolvedValue({ id: "active-admin" });
  mocks.generateDraft.mockResolvedValue({ content: "Synthetic draft", tokensUsed: 100 });
  mocks.saveDraft.mockResolvedValue("draft-1");
});
afterEach(() => vi.unstubAllEnvs());

describe("task agent cron usage account resolution", () => {
  it("resolves one active owner/admin for all five task sources", async () => {
    prismaMock.marketingTask.findMany.mockResolvedValue([{ id: "marketing-1", title: "Draft an email" }]);
    prismaMock.coworkTodo.findMany.mockResolvedValue([{ id: "cowork-1", title: "Research ideas" }]);
    prismaMock.supportTicket.findMany.mockResolvedValue([{ id: "ticket-1", subject: "Draft a reply" }]);
    prismaMock.issue.findMany.mockResolvedValue([{ id: "issue-1", title: "Prepare a plan" }]);
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ generated: 5, failed: 0 });
    expect(prismaMock.user.findFirst).toHaveBeenCalledExactlyOnceWith({
      where: { role: { in: ["owner", "admin"] }, active: true }, select: { id: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    expect(mocks.saveDraft.mock.calls.map(([ctx, , , userId]) => [ctx.sourceType, userId])).toEqual([
      ["todo", "active-admin"], ["marketingTask", "active-admin"], ["coworkTodo", "active-admin"], ["ticket", "active-admin"], ["issue", "active-admin"],
    ]);
  });

  it("continues drafting without a placeholder user when no eligible account exists", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    expect((await call()).status).toBe(200);
    expect(mocks.saveDraft).toHaveBeenCalledWith(expect.anything(), "Synthetic draft", 100, null);
    expect(mocks.fail).not.toHaveBeenCalled();
  });

  it("does not abandon drafts when account lookup fails", async () => {
    prismaMock.user.findFirst.mockRejectedValue(new Error("telemetry lookup unavailable"));
    expect((await call()).status).toBe(200);
    expect(mocks.saveDraft).toHaveBeenCalledWith(expect.anything(), "Synthetic draft", 100, null);
    expect(mocks.fail).not.toHaveBeenCalled();
  });

  it("does not resolve an accounting account for an empty batch", async () => {
    prismaMock.todo.findMany.mockResolvedValue([]);
    expect((await call()).status).toBe(200);
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
    expect(mocks.generateDraft).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests before any account lookup or generation", async () => {
    const response = await GET(createRequest("GET", "/api/cron/ai-task-agent"), { params: Promise.resolve({}) });
    expect(response.status).toBe(401);
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
    expect(mocks.generateDraft).not.toHaveBeenCalled();
  });
});
