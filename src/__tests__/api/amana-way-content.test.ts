import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60_000 }),
  ),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
  generateRequestId: () => "test-req-id",
}));

import { GET, PATCH } from "@/app/api/amana-way/content/route";

beforeEach(() => {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue({ active: true, id: "u-1" });
});

describe("GET /api/amana-way/content", () => {
  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const res = await GET(createRequest("GET", "/api/amana-way/content"));
    expect(res.status).toBe(401);
  });

  it("returns empty data when no record exists", async () => {
    mockSession({ id: "u-1", name: "Staff", role: "staff" });
    prismaMock.amanaWayContent.findUnique.mockResolvedValue(null);
    const res = await GET(createRequest("GET", "/api/amana-way/content"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({});
    expect(body.updatedAt).toBeNull();
  });

  it("returns persisted overrides for any authed user", async () => {
    mockSession({ id: "u-1", name: "Staff", role: "staff" });
    prismaMock.amanaWayContent.findUnique.mockResolvedValue({
      id: "singleton",
      data: { "home.welcome.p1": "Updated welcome" },
      updatedAt: new Date("2026-05-15T10:00:00Z"),
      updatedById: "admin-1",
    });
    const res = await GET(createRequest("GET", "/api/amana-way/content"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data["home.welcome.p1"]).toBe("Updated welcome");
  });
});

describe("PATCH /api/amana-way/content", () => {
  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const res = await PATCH(
      createRequest("PATCH", "/api/amana-way/content", {
        body: { data: {} },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when staff tries to edit content", async () => {
    mockSession({ id: "u-1", name: "Staff", role: "staff" });
    const res = await PATCH(
      createRequest("PATCH", "/api/amana-way/content", {
        body: { data: { "home.welcome.p1": "Sneaky" } },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 when member tries to edit content", async () => {
    mockSession({ id: "u-1", name: "DoS", role: "member" });
    const res = await PATCH(
      createRequest("PATCH", "/api/amana-way/content", {
        body: { data: { "home.welcome.p1": "Sneaky" } },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("admin can write overrides — upserts row, logs activity", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.amanaWayContent.upsert.mockResolvedValue({
      id: "singleton",
      data: { "home.welcome.p1": "New text" },
      updatedAt: new Date(),
      updatedById: "admin-1",
    });
    const res = await PATCH(
      createRequest("PATCH", "/api/amana-way/content", {
        body: { data: { "home.welcome.p1": "New text" } },
      }),
    );
    expect(res.status).toBe(200);
    const upsertCall = prismaMock.amanaWayContent.upsert.mock.calls[0][0];
    expect(upsertCall.where).toEqual({ id: "singleton" });
    expect(upsertCall.update.data).toEqual({ "home.welcome.p1": "New text" });
    expect(upsertCall.update.updatedById).toBe("admin-1");
    // Activity log written
    expect(prismaMock.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "update_amana_way_content",
          entityId: "singleton",
        }),
      }),
    );
  });

  it("owner can write overrides", async () => {
    mockSession({ id: "owner-1", name: "Owner", role: "owner" });
    prismaMock.amanaWayContent.upsert.mockResolvedValue({
      id: "singleton",
      data: {},
      updatedAt: new Date(),
      updatedById: "owner-1",
    });
    const res = await PATCH(
      createRequest("PATCH", "/api/amana-way/content", {
        body: { data: { "foundation.vision.body": "Refreshed vision" } },
      }),
    );
    expect(res.status).toBe(200);
  });

  it("rejects malformed body shape (data must be Record<string, string>)", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const res = await PATCH(
      createRequest("PATCH", "/api/amana-way/content", {
        body: { data: { key: 123 } },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects payload over the 200 KB cap", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const big = "x".repeat(250_000);
    const res = await PATCH(
      createRequest("PATCH", "/api/amana-way/content", {
        body: { data: { huge: big } },
      }),
    );
    expect(res.status).toBe(400);
  });
});
