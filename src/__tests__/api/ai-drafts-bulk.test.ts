import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "@/__tests__/helpers/prisma-mock";
import { mockSession, mockNoSession } from "@/__tests__/helpers/auth-mock";
import { createRequest } from "@/__tests__/helpers/request";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => ({ limited: false })) }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  generateRequestId: () => "test-req-id",
}));

import { POST } from "@/app/api/ai-drafts/bulk/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

describe("POST /api/ai-drafts/bulk", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "owner" });
  });

  it("401 unauthenticated", async () => {
    mockNoSession();
    const req = createRequest("POST", "/api/ai-drafts/bulk", { body: { action: "approve", ids: ["d1"] } });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("400 on invalid action", async () => {
    const req = createRequest("POST", "/api/ai-drafts/bulk", { body: { action: "delete", ids: ["d1"] } });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("400 on empty ids", async () => {
    const req = createRequest("POST", "/api/ai-drafts/bulk", { body: { action: "approve", ids: [] } });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("400 on ids > 20", async () => {
    const ids = Array.from({ length: 21 }, (_, i) => `d${i}`);
    const req = createRequest("POST", "/api/ai-drafts/bulk", { body: { action: "approve", ids } });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it.each([
    ["owner", 200],
    ["head_office", 200],
    ["admin", 200],
    ["member", 403],
    ["staff", 403],
  ])("role %s → %i", async (role, expected) => {
    mockSession({ id: "u1", name: "U", role: role as "owner" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role });
    prismaMock.aiTaskDraft.updateMany.mockResolvedValue({ count: 2 });

    const req = createRequest("POST", "/api/ai-drafts/bulk", { body: { action: "approve", ids: ["d1", "d2"] } });
    const res = await POST(req);
    expect(res.status).toBe(expected);
  });

  it("approves all ids atomically (updateMany)", async () => {
    prismaMock.aiTaskDraft.updateMany.mockResolvedValue({ count: 3 });

    const req = createRequest("POST", "/api/ai-drafts/bulk", { body: { action: "approve", ids: ["d1", "d2", "d3"] } });
    const res = await POST(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.updated).toBe(3);

    const call = prismaMock.aiTaskDraft.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ id: { in: ["d1", "d2", "d3"] } });
    expect(call.data.status).toBe("accepted");
  });

  it("dismisses all ids", async () => {
    prismaMock.aiTaskDraft.updateMany.mockResolvedValue({ count: 2 });

    const req = createRequest("POST", "/api/ai-drafts/bulk", { body: { action: "dismiss", ids: ["d1", "d2"] } });
    const res = await POST(req);
    const data = await res.json();
    expect(data.updated).toBe(2);
    expect(prismaMock.aiTaskDraft.updateMany.mock.calls[0][0].data.status).toBe("dismissed");
  });

  it("does not re-flip already-processed drafts (status filter)", async () => {
    // Simulate: all 3 drafts already accepted. updateMany filters on status=ready → count=0.
    prismaMock.aiTaskDraft.updateMany.mockResolvedValue({ count: 0 });

    const req = createRequest("POST", "/api/ai-drafts/bulk", { body: { action: "dismiss", ids: ["d1", "d2", "d3"] } });
    const res = await POST(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.updated).toBe(0);

    // Confirm the where-clause includes status=ready so the filter is enforced at the DB
    const call = prismaMock.aiTaskDraft.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ status: "ready" });
  });
});
