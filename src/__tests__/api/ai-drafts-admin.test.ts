import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "@/__tests__/helpers/prisma-mock";
import { mockSession, mockNoSession, type MockUserRole } from "@/__tests__/helpers/auth-mock";
import { createRequest } from "@/__tests__/helpers/request";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => ({ limited: false })) }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  generateRequestId: () => "test-req-id",
}));

import { GET } from "@/app/api/ai-drafts/admin/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

describe("GET /api/ai-drafts/admin", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "owner" });
  });

  it("returns 401 unauthenticated", async () => {
    mockNoSession();
    const req = createRequest("GET", "/api/ai-drafts/admin");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it.each([
    ["owner", 200],
    ["head_office", 200],
    ["admin", 200],
    ["coordinator", 403],
    ["member", 403],
    ["staff", 403],
    ["marketing", 403],
  ])("role %s → %i", async (role, expected) => {
    mockSession({ id: "u1", name: "U", role: role as MockUserRole });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role });
    prismaMock.aiTaskDraft.findMany.mockResolvedValue([]);
    prismaMock.aiTaskDraft.count.mockResolvedValue(0);

    const req = createRequest("GET", "/api/ai-drafts/admin");
    const res = await GET(req);
    expect(res.status).toBe(expected);
  });

  it("returns paginated drafts with default status=ready", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.aiTaskDraft.findMany.mockResolvedValue([
      { id: "d1", status: "ready", title: "T", taskType: "communication", createdAt: new Date() },
    ]);
    prismaMock.aiTaskDraft.count.mockResolvedValue(1);

    const req = createRequest("GET", "/api/ai-drafts/admin");
    const res = await GET(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.drafts).toHaveLength(1);
    expect(data.page).toBe(1);
    expect(data.total).toBe(1);

    const whereArg = prismaMock.aiTaskDraft.findMany.mock.calls[0][0].where;
    expect(whereArg).toMatchObject({ status: "ready" });
  });

  it("status=all returns all regardless", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.aiTaskDraft.findMany.mockResolvedValue([]);
    prismaMock.aiTaskDraft.count.mockResolvedValue(0);

    const req = createRequest("GET", "/api/ai-drafts/admin?status=all");
    await GET(req);
    const whereArg = prismaMock.aiTaskDraft.findMany.mock.calls[0][0].where;
    expect(whereArg.status).toBeUndefined();
  });

  it("taskType filter", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.aiTaskDraft.findMany.mockResolvedValue([]);
    prismaMock.aiTaskDraft.count.mockResolvedValue(0);

    const req = createRequest("GET", "/api/ai-drafts/admin?taskType=communication");
    await GET(req);
    const whereArg = prismaMock.aiTaskDraft.findMany.mock.calls[0][0].where;
    expect(whereArg.taskType).toBe("communication");
  });
});
