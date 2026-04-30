import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "@/__tests__/helpers/prisma-mock";
import { mockSession, mockNoSession, type MockUserRole } from "@/__tests__/helpers/auth-mock";
import { createRequest } from "@/__tests__/helpers/request";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  generateRequestId: () => "test-req-id",
}));

vi.mock("@/lib/audit-log", () => ({
  logAuditEvent: vi.fn(),
}));

import { GET, PATCH } from "@/app/api/internal-feedback/[id]/route";
import { _clearUserActiveCache } from "@/lib/server-auth";
import { logAuditEvent } from "@/lib/audit-log";

const params = { params: Promise.resolve({ id: "fb-1" }) };

describe("PATCH /api/internal-feedback/[id]", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "owner" });
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const req = createRequest("PATCH", "/api/internal-feedback/fb-1", { body: { status: "resolved" } });
    const res = await PATCH(req, params);
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
    mockSession({ id: "u1", name: "User", role: role as MockUserRole });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role });
    prismaMock.internalFeedback.findUnique.mockResolvedValue({ id: "fb-1", status: "new", adminNotes: null });
    prismaMock.internalFeedback.update.mockResolvedValue({
      id: "fb-1", status: "resolved", adminNotes: null, resolvedAt: new Date(),
      author: { id: "u2", name: "R", email: "r@a.com", role: "staff" },
    });

    const req = createRequest("PATCH", "/api/internal-feedback/fb-1", { body: { status: "resolved" } });
    const res = await PATCH(req, params);
    expect(res.status).toBe(expected);
  });

  it("returns 400 on invalid status value", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    const req = createRequest("PATCH", "/api/internal-feedback/fb-1", { body: { status: "banana" } });
    const res = await PATCH(req, params);
    expect(res.status).toBe(400);
  });

  it("returns 400 on adminNotes over 5000 chars", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    const req = createRequest("PATCH", "/api/internal-feedback/fb-1", { body: { adminNotes: "a".repeat(5001) } });
    const res = await PATCH(req, params);
    expect(res.status).toBe(400);
  });

  it("returns 404 when feedback does not exist", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.internalFeedback.findUnique.mockResolvedValue(null);

    const req = createRequest("PATCH", "/api/internal-feedback/missing", { body: { status: "resolved" } });
    const res = await PATCH(req, { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("sets resolvedAt when status → resolved", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.internalFeedback.findUnique.mockResolvedValue({ id: "fb-1", status: "new", adminNotes: null });
    prismaMock.internalFeedback.update.mockResolvedValue({
      id: "fb-1", status: "resolved", adminNotes: null, resolvedAt: new Date(),
      author: { id: "u2", name: "R", email: "r@a.com", role: "staff" },
    });

    const req = createRequest("PATCH", "/api/internal-feedback/fb-1", { body: { status: "resolved" } });
    await PATCH(req, params);

    const call = prismaMock.internalFeedback.update.mock.calls[0][0];
    expect(call.data.status).toBe("resolved");
    expect(call.data.resolvedAt).toBeInstanceOf(Date);
  });

  it("clears resolvedAt when status → in_progress after resolved", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.internalFeedback.findUnique.mockResolvedValue({ id: "fb-1", status: "resolved", adminNotes: null });
    prismaMock.internalFeedback.update.mockResolvedValue({
      id: "fb-1", status: "in_progress", adminNotes: null, resolvedAt: null,
      author: { id: "u2", name: "R", email: "r@a.com", role: "staff" },
    });

    const req = createRequest("PATCH", "/api/internal-feedback/fb-1", { body: { status: "in_progress" } });
    await PATCH(req, params);
    const call = prismaMock.internalFeedback.update.mock.calls[0][0];
    expect(call.data.resolvedAt).toBeNull();
  });

  it("logs audit event on status change", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.internalFeedback.findUnique.mockResolvedValue({ id: "fb-1", status: "new", adminNotes: null });
    prismaMock.internalFeedback.update.mockResolvedValue({
      id: "fb-1", status: "resolved", adminNotes: null, resolvedAt: new Date(),
      author: { id: "u2", name: "R", email: "r@a.com", role: "staff" },
    });

    const req = createRequest("PATCH", "/api/internal-feedback/fb-1", { body: { status: "resolved" } });
    await PATCH(req, params);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "feedback.status_changed",
        targetId: "fb-1",
        targetType: "InternalFeedback",
        metadata: expect.objectContaining({ from: "new", to: "resolved" }),
      }),
      expect.anything(),
    );
  });

  it("does NOT log audit when only adminNotes change (no status transition)", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.internalFeedback.findUnique.mockResolvedValue({ id: "fb-1", status: "new", adminNotes: null });
    prismaMock.internalFeedback.update.mockResolvedValue({
      id: "fb-1", status: "new", adminNotes: "investigating", resolvedAt: null,
      author: { id: "u2", name: "R", email: "r@a.com", role: "staff" },
    });

    const req = createRequest("PATCH", "/api/internal-feedback/fb-1", { body: { adminNotes: "investigating" } });
    await PATCH(req, params);
    expect(logAuditEvent).not.toHaveBeenCalled();
  });
});

describe("GET /api/internal-feedback/[id]", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "owner" });
  });

  it("returns feedback by id", async () => {
    prismaMock.internalFeedback.findUnique.mockResolvedValue({
      id: "fb-1", status: "new", message: "hello", category: "bug",
      author: { id: "u2", name: "R", email: "r@a.com", role: "staff" },
    });

    const req = createRequest("GET", "/api/internal-feedback/fb-1");
    const res = await GET(req, params);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.feedback.id).toBe("fb-1");
  });

  it("returns 404 on unknown id", async () => {
    prismaMock.internalFeedback.findUnique.mockResolvedValue(null);
    const req = createRequest("GET", "/api/internal-feedback/nope");
    const res = await GET(req, { params: Promise.resolve({ id: "nope" }) });
    expect(res.status).toBe(404);
  });
});
