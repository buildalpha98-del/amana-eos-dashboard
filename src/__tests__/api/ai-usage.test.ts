import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ limited: false, remaining: 59, resetIn: 60000 })) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }, generateRequestId: () => "t" }));
import { GET } from "@/app/api/ai/usage/route";

describe("GET /api/ai/usage", () => {
  beforeEach(() => { _clearUserActiveCache(); prismaMock.user.findUnique.mockResolvedValue({ active: true, role: "owner" }); });
  it("buckets null-user rows under System", async () => {
    mockSession({ id: "u", name: "O", role: "owner" });
    prismaMock.aiUsage.findMany.mockResolvedValue([
      { userId: null, user: null, templateSlug: null, model: "voyage-3", inputTokens: 10, outputTokens: 0, durationMs: 0, section: "knowledge-index", createdAt: new Date() },
      // legacy sentinel written by ai-task-agent.ts — must share the System bucket
      { userId: "system", user: { id: "system", name: "System Agent" }, templateSlug: "t", model: "claude", inputTokens: 1, outputTokens: 1, durationMs: 1, section: "agent", createdAt: new Date() },
      { userId: "u", user: { id: "u", name: "O" }, templateSlug: "x", model: "claude", inputTokens: 5, outputTokens: 5, durationMs: 1, section: "marketing", createdAt: new Date() },
    ]);
    const res = await GET(createRequest("GET", "/api/ai/usage?days=30"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.byUser.system).toMatchObject({ name: "System", calls: 2 });
    expect(json.byUser.u).toMatchObject({ name: "O", calls: 1 });
  });
});
