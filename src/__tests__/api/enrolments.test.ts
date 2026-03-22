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
vi.mock("@/lib/api-error", () => ({
  ApiError: class ApiError extends Error {
    statusCode: number;
    constructor(statusCode: number, message: string) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

vi.mock("@/lib/api-handler", () => ({
  handleApiError: vi.fn((_req: unknown, err: unknown, reqId: string) => {
    const { NextResponse } = require("next/server");
    const status = (err as any)?.statusCode || 500;
    const message = (err as any)?.message || "Internal error";
    return NextResponse.json({ error: message }, { status });
  }),
}));

import { GET } from "@/app/api/enrolments/route";
import {
  GET as getEnrolment,
  PATCH,
} from "@/app/api/enrolments/[id]/route";

describe("GET /api/enrolments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("GET", "/api/enrolments");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns enrolments list", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    const mockSubmissions = [
      {
        id: "es-1",
        status: "submitted",
        parentName: "Jane Doe",
        childName: "Billy Doe",
        createdAt: new Date(),
      },
      {
        id: "es-2",
        status: "processed",
        parentName: "John Smith",
        childName: "Sally Smith",
        createdAt: new Date(),
      },
    ];
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue(mockSubmissions);
    prismaMock.enrolmentSubmission.count.mockResolvedValue(2);

    const req = createRequest("GET", "/api/enrolments");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.submissions).toHaveLength(2);
    expect(body.total).toBe(2);
  });

  it("filters by status query param", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([]);
    prismaMock.enrolmentSubmission.count.mockResolvedValue(0);

    const req = createRequest("GET", "/api/enrolments?status=processed");
    await GET(req);

    const callArgs = prismaMock.enrolmentSubmission.findMany.mock.calls[0][0];
    expect(callArgs.where.status).toBe("processed");
  });
});

describe("PATCH /api/enrolments/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 404 for unknown enrolment", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });
    prismaMock.enrolmentSubmission.update.mockRejectedValue(
      Object.assign(new Error("Record not found"), { code: "P2025" })
    );

    const req = createRequest("PATCH", "/api/enrolments/unknown", {
      body: { status: "under_review" },
    });
    const context = { params: Promise.resolve({ id: "unknown" }) };
    const res = await PATCH(req, context);
    // Prisma P2025 will be caught by the error handler
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("updates enrolment status successfully", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    const updatedSubmission = {
      id: "es-1",
      status: "under_review",
      parentName: "Jane Doe",
      childName: "Billy Doe",
      createdAt: new Date(),
    };
    prismaMock.enrolmentSubmission.update.mockResolvedValue(updatedSubmission);

    const req = createRequest("PATCH", "/api/enrolments/es-1", {
      body: { status: "under_review" },
    });
    const context = { params: Promise.resolve({ id: "es-1" }) };
    const res = await PATCH(req, context);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("under_review");
  });
});
