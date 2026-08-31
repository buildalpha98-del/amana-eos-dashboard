import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

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
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 }),
  ),
}));

import { POST } from "@/app/api/creative-requests/[id]/satisfaction/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

const deliveredRequest = {
  id: "cr1",
  status: "delivered",
  requestedById: "member-1",
};

function mockActiveUsers() {
  prismaMock.user.findUnique.mockImplementation(
    async (args: { where?: { id?: string } } | undefined) => {
      const id = args?.where?.id;
      if (id === "mkt-1") return { id, role: "marketing", active: true } as never;
      if (id === "member-1") return { id, role: "member", active: true } as never;
      if (id === "member-2") return { id, role: "member", active: true } as never;
      return null;
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  mockActiveUsers();
});

describe("POST /api/creative-requests/[id]/satisfaction", () => {
  it("returns 401 with no session", async () => {
    mockNoSession();
    const res = await POST(
      createRequest("POST", "/api/creative-requests/cr1/satisfaction", {
        body: { positive: true },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for an unknown request", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(null);
    const res = await POST(
      createRequest("POST", "/api/creative-requests/nope/satisfaction", {
        body: { positive: true },
      }),
      ctx("nope"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 (not 403) for a non-participant member — no existence leak", async () => {
    mockSession({ id: "member-2", name: "Other", role: "member" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(
      deliveredRequest as never,
    );
    const res = await POST(
      createRequest("POST", "/api/creative-requests/cr1/satisfaction", {
        body: { positive: true },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(404);
    expect(prismaMock.creativeRequestSatisfaction.create).not.toHaveBeenCalled();
  });

  it("returns 403 for a fulfiller who is not the requester", async () => {
    mockSession({ id: "mkt-1", name: "Tracie", role: "marketing" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(
      deliveredRequest as never,
    );
    const res = await POST(
      createRequest("POST", "/api/creative-requests/cr1/satisfaction", {
        body: { positive: false },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/only the requester/i);
    expect(prismaMock.creativeRequestSatisfaction.create).not.toHaveBeenCalled();
  });

  it("returns 409 when the request is not delivered yet", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue({
      ...deliveredRequest,
      status: "in_progress",
    } as never);
    const res = await POST(
      createRequest("POST", "/api/creative-requests/cr1/satisfaction", {
        body: { positive: true },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(409);
    expect(prismaMock.creativeRequestSatisfaction.create).not.toHaveBeenCalled();
  });

  it("creates the rating for the requester on a delivered request (201)", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(
      deliveredRequest as never,
    );
    prismaMock.creativeRequestSatisfaction.create.mockResolvedValue({
      id: "sat1",
      requestId: "cr1",
      positive: true,
      comment: "Loved it",
      ratedById: "member-1",
      createdAt: new Date(),
    } as never);

    const res = await POST(
      createRequest("POST", "/api/creative-requests/cr1/satisfaction", {
        body: { positive: true, comment: "Loved it" },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(201);
    const createArgs =
      prismaMock.creativeRequestSatisfaction.create.mock.calls[0][0];
    expect(createArgs.data.requestId).toBe("cr1");
    expect(createArgs.data.positive).toBe(true);
    expect(createArgs.data.comment).toBe("Loved it");
    expect(createArgs.data.ratedById).toBe("member-1");
    const body = await res.json();
    expect(body.satisfaction.positive).toBe(true);
  });

  it("returns 409 'already rated' when the unique constraint trips (P2002)", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    prismaMock.creativeRequest.findUnique.mockResolvedValue(
      deliveredRequest as never,
    );
    prismaMock.creativeRequestSatisfaction.create.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
    );
    const res = await POST(
      createRequest("POST", "/api/creative-requests/cr1/satisfaction", {
        body: { positive: false },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already rated/i);
  });

  it("returns 400 when the comment exceeds 2000 characters", async () => {
    mockSession({ id: "member-1", name: "Mirna", role: "member" });
    const res = await POST(
      createRequest("POST", "/api/creative-requests/cr1/satisfaction", {
        body: { positive: true, comment: "x".repeat(2001) },
      }),
      ctx("cr1"),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.creativeRequestSatisfaction.create).not.toHaveBeenCalled();
  });
});
