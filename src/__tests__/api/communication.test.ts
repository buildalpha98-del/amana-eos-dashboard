import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

// Mock rate-limit
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })
  ),
}));

// Mock logger
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

// Mock api-error / api-handler (used by server-auth catch)
vi.mock("@/lib/api-error", () => {
  class ApiError extends Error {
    statusCode: number;
    constructor(statusCode: number, message: string) {
      super(message);
      this.statusCode = statusCode;
    }
    static badRequest(message = "Bad request") {
      return new ApiError(400, message);
    }
  }
  return {
    ApiError,
    parseJsonBody: async (req: Request) => {
      try {
        return await req.json();
      } catch {
        throw ApiError.badRequest("Invalid or missing JSON body");
      }
    },
  };
});

vi.mock("@/lib/api-handler", () => ({
  handleApiError: vi.fn((_req: unknown, err: unknown, reqId: string) => {
    const { NextResponse } = require("next/server");
    const status = (err as any)?.statusCode || 500;
    const message = (err as any)?.message || "Internal error";
    return NextResponse.json({ error: message }, { status });
  }),
}));

// Mock service-scope (used by announcements GET)
vi.mock("@/lib/service-scope", () => ({
  getServiceScope: vi.fn(() => null),
  getStateScope: vi.fn(() => null),
}));

import { GET, POST } from "@/app/api/communication/announcements/route";
import {
  GET as getAnnouncement,
  PATCH,
  DELETE,
} from "@/app/api/communication/announcements/[id]/route";

describe("GET /api/communication/announcements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("GET", "/api/communication/announcements");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns announcements list", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    const mockAnnouncements = [
      {
        id: "a-1",
        title: "Welcome",
        body: "Hello everyone",
        audience: "all",
        priority: "normal",
        pinned: false,
        deleted: false,
        publishedAt: new Date(),
        author: { id: "user-1", name: "Test", avatar: null },
        service: null,
        _count: { readReceipts: 0 },
      },
    ];
    prismaMock.announcement.findMany.mockResolvedValue(mockAnnouncements);

    const req = createRequest("GET", "/api/communication/announcements");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("Welcome");
  });
});

describe("POST /api/communication/announcements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 400 with missing title", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    const req = createRequest("POST", "/api/communication/announcements", {
      body: { body: "Some content" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeTruthy();
  });

  it("creates announcement with valid data", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    const createdAnnouncement = {
      id: "a-new",
      title: "Important Update",
      body: "Please read this",
      audience: "all",
      priority: "normal",
      pinned: false,
      deleted: false,
      publishedAt: null,
      authorId: "user-1",
      author: { id: "user-1", name: "Test", avatar: null },
      service: null,
      _count: { readReceipts: 0 },
    };
    prismaMock.announcement.create.mockResolvedValue(createdAnnouncement);
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest("POST", "/api/communication/announcements", {
      body: { title: "Important Update", body: "Please read this" },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.title).toBe("Important Update");
  });

  it("returns 403 for non-privileged role", async () => {
    mockSession({ id: "user-2", name: "Staff User", role: "staff" });

    const req = createRequest("POST", "/api/communication/announcements", {
      body: { title: "Test", body: "Content" },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/communication/announcements/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("updates announcement successfully", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    prismaMock.announcement.findUnique.mockResolvedValue({
      id: "a-1",
      title: "Old Title",
      deleted: false,
    });

    const updatedAnnouncement = {
      id: "a-1",
      title: "New Title",
      body: "Hello everyone",
      audience: "all",
      priority: "normal",
      pinned: false,
      deleted: false,
      publishedAt: new Date(),
      author: { id: "user-1", name: "Test", avatar: null },
      service: null,
      _count: { readReceipts: 0 },
    };
    prismaMock.announcement.update.mockResolvedValue(updatedAnnouncement);
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest(
      "PATCH",
      "/api/communication/announcements/a-1",
      { body: { title: "New Title" } }
    );
    const context = { params: Promise.resolve({ id: "a-1" }) };
    const res = await PATCH(req, context);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.title).toBe("New Title");
  });

  it("returns 404 for non-existent announcement", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });
    prismaMock.announcement.findUnique.mockResolvedValue(null);

    const req = createRequest(
      "PATCH",
      "/api/communication/announcements/unknown",
      { body: { title: "Updated" } }
    );
    const context = { params: Promise.resolve({ id: "unknown" }) };
    const res = await PATCH(req, context);
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/communication/announcements/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("deletes announcement", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    prismaMock.announcement.findUnique.mockResolvedValue({
      id: "a-1",
      title: "To Delete",
      deleted: false,
    });
    prismaMock.announcement.update.mockResolvedValue({
      id: "a-1",
      deleted: true,
    });
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest(
      "DELETE",
      "/api/communication/announcements/a-1"
    );
    const context = { params: Promise.resolve({ id: "a-1" }) };
    const res = await DELETE(req, context);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("returns 404 for non-existent announcement", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });
    prismaMock.announcement.findUnique.mockResolvedValue(null);

    const req = createRequest(
      "DELETE",
      "/api/communication/announcements/unknown"
    );
    const context = { params: Promise.resolve({ id: "unknown" }) };
    const res = await DELETE(req, context);
    expect(res.status).toBe(404);
  });

  it("returns 403 for non-privileged role", async () => {
    mockSession({ id: "user-2", name: "Member", role: "member" });

    const req = createRequest(
      "DELETE",
      "/api/communication/announcements/a-1"
    );
    const context = { params: Promise.resolve({ id: "a-1" }) };
    const res = await DELETE(req, context);
    expect(res.status).toBe(403);
  });
});
