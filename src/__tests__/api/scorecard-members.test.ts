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

import {
  GET as listGET,
  POST as listPOST,
} from "@/app/api/scorecards/[id]/members/route";
import { DELETE as removeDELETE } from "@/app/api/scorecards/[id]/members/[userId]/route";

function ctx(id: string, userId?: string) {
  return {
    params: Promise.resolve(userId ? { id, userId } : { id }),
  };
}

beforeEach(() => {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockImplementation(async (args: unknown) => {
    const a = args as { where?: { id?: string }; select?: Record<string, unknown> };
    // withApiAuth active-user check
    if (a?.select && "active" in a.select && !("id" in a.select)) {
      return { active: true };
    }
    // Default target user lookup
    return {
      id: a?.where?.id ?? "unknown",
      active: true,
      name: "Test User",
      email: "test@example.com",
      avatar: null,
    };
  });
  prismaMock.activityLog.create.mockResolvedValue({} as never);
});

describe("GET /api/scorecards/[id]/members", () => {
  it("returns 401 unauth", async () => {
    mockNoSession();
    const res = await listGET(
      createRequest("GET", "/api/scorecards/sc-1/members"),
      ctx("sc-1") as never,
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller is neither owner nor member", async () => {
    mockSession({ id: "u-stranger", name: "Stranger", role: "admin" });
    prismaMock.scorecard.findUnique.mockResolvedValue({
      id: "sc-1",
      ownerId: "u-other",
      members: [],
    } as never);
    const res = await listGET(
      createRequest("GET", "/api/scorecards/sc-1/members"),
      ctx("sc-1") as never,
    );
    expect(res.status).toBe(403);
  });

  it("members can list members", async () => {
    mockSession({ id: "u-mem", name: "Mem", role: "staff" });
    prismaMock.scorecard.findUnique.mockResolvedValue({
      id: "sc-1",
      ownerId: "u-other",
      members: [{ userId: "u-mem" }],
    } as never);
    prismaMock.scorecardMember.findMany.mockResolvedValue([]);
    const res = await listGET(
      createRequest("GET", "/api/scorecards/sc-1/members"),
      ctx("sc-1") as never,
    );
    expect(res.status).toBe(200);
  });
});

describe("POST /api/scorecards/[id]/members (invite)", () => {
  it("returns 403 when caller is not manage-able (just a member)", async () => {
    mockSession({ id: "u-mem", name: "Mem", role: "staff" });
    prismaMock.scorecard.findUnique.mockResolvedValue({
      id: "sc-1",
      ownerId: "u-other",
      members: [{ userId: "u-mem" }],
    } as never);
    const res = await listPOST(
      createRequest("POST", "/api/scorecards/sc-1/members", {
        body: { userId: "u-new" },
      }),
      ctx("sc-1") as never,
    );
    expect(res.status).toBe(403);
  });

  it("rejects inviting the scorecard owner (already a participant)", async () => {
    mockSession({ id: "u-owner", name: "Owner", role: "admin" });
    prismaMock.scorecard.findUnique.mockResolvedValue({
      id: "sc-1",
      ownerId: "u-owner",
      members: [],
    } as never);
    const res = await listPOST(
      createRequest("POST", "/api/scorecards/sc-1/members", {
        body: { userId: "u-owner" },
      }),
      ctx("sc-1") as never,
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 (idempotent) when inviting an already-member", async () => {
    mockSession({ id: "u-owner", name: "Owner", role: "admin" });
    prismaMock.scorecard.findUnique.mockResolvedValue({
      id: "sc-1",
      ownerId: "u-owner",
      members: [{ userId: "u-existing" }],
    } as never);
    prismaMock.scorecardMember.findUnique.mockResolvedValue({
      id: "sm-1",
      addedAt: new Date(),
    } as never);
    const res = await listPOST(
      createRequest("POST", "/api/scorecards/sc-1/members", {
        body: { userId: "u-existing" },
      }),
      ctx("sc-1") as never,
    );
    expect(res.status).toBe(200);
    expect(prismaMock.scorecardMember.create).not.toHaveBeenCalled();
  });

  it("happy path: scorecard owner invites a new user", async () => {
    mockSession({ id: "u-owner", name: "Owner", role: "admin" });
    prismaMock.scorecard.findUnique.mockResolvedValue({
      id: "sc-1",
      ownerId: "u-owner",
      members: [],
    } as never);
    prismaMock.scorecardMember.findUnique.mockResolvedValue(null);
    prismaMock.scorecardMember.create.mockResolvedValue({
      id: "sm-new",
      addedAt: new Date(),
    } as never);
    const res = await listPOST(
      createRequest("POST", "/api/scorecards/sc-1/members", {
        body: { userId: "u-new" },
      }),
      ctx("sc-1") as never,
    );
    expect(res.status).toBe(201);
    expect(prismaMock.scorecardMember.create).toHaveBeenCalledWith({
      data: { scorecardId: "sc-1", userId: "u-new" },
      select: { id: true, addedAt: true },
    });
  });
});

describe("DELETE /api/scorecards/[id]/members/[userId]", () => {
  it("member can remove themselves (self-removal)", async () => {
    mockSession({ id: "u-mem", name: "Mem", role: "staff" });
    prismaMock.scorecard.findUnique.mockResolvedValue({
      id: "sc-1",
      ownerId: "u-other",
    } as never);
    prismaMock.scorecardMember.delete.mockResolvedValue({} as never);
    const res = await removeDELETE(
      createRequest("DELETE", "/api/scorecards/sc-1/members/u-mem"),
      ctx("sc-1", "u-mem") as never,
    );
    expect(res.status).toBe(200);
  });

  it("non-owner CANNOT remove another member", async () => {
    mockSession({ id: "u-mem", name: "Mem", role: "staff" });
    prismaMock.scorecard.findUnique.mockResolvedValue({
      id: "sc-1",
      ownerId: "u-other",
    } as never);
    const res = await removeDELETE(
      createRequest("DELETE", "/api/scorecards/sc-1/members/u-other-mem"),
      ctx("sc-1", "u-other-mem") as never,
    );
    expect(res.status).toBe(403);
  });

  it("cannot remove the scorecard owner via the member endpoint", async () => {
    mockSession({ id: "u-owner", name: "Owner", role: "admin" });
    prismaMock.scorecard.findUnique.mockResolvedValue({
      id: "sc-1",
      ownerId: "u-owner",
    } as never);
    const res = await removeDELETE(
      createRequest("DELETE", "/api/scorecards/sc-1/members/u-owner"),
      ctx("sc-1", "u-owner") as never,
    );
    expect(res.status).toBe(400);
  });
});
