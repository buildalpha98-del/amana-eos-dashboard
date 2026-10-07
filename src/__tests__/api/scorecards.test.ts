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

import { GET as listGET, POST as listPOST } from "@/app/api/scorecards/route";
import {
  GET as itemGET,
  PATCH as itemPATCH,
  DELETE as itemDELETE,
} from "@/app/api/scorecards/[id]/route";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.activityLog.create.mockResolvedValue({} as never);
});

describe("GET /api/scorecards", () => {
  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const res = await listGET(createRequest("GET", "/api/scorecards"));
    expect(res.status).toBe(401);
  });

  it("dashboard owner gets the unscoped list (no filter)", async () => {
    mockSession({ id: "u-owner", name: "Jayden", role: "owner" });
    prismaMock.scorecard.findMany.mockResolvedValue([]);
    await listGET(createRequest("GET", "/api/scorecards"));
    const call = prismaMock.scorecard.findMany.mock.calls[0][0];
    expect(call.where).toEqual({});
  });

  it("non-owner viewer gets OR-filtered list (owned + member-of)", async () => {
    mockSession({ id: "u-admin", name: "Daniel", role: "admin" });
    prismaMock.scorecard.findMany.mockResolvedValue([]);
    await listGET(createRequest("GET", "/api/scorecards"));
    const call = prismaMock.scorecard.findMany.mock.calls[0][0];
    expect(call.where).toEqual({
      OR: [
        { ownerId: "u-admin" },
        { members: { some: { userId: "u-admin" } } },
      ],
    });
  });
});

describe("GET /api/scorecards — state scorecards (2026-10-07)", () => {
  it("a State Manager's list includes their state's scorecards", async () => {
    mockSession({ id: "u-mirna", name: "Mirna", role: "head_office", state: "NSW" });
    prismaMock.scorecard.findMany.mockResolvedValue([]);
    await listGET(createRequest("GET", "/api/scorecards"));
    const call = prismaMock.scorecard.findMany.mock.calls[0][0];
    expect(call.where.OR).toContainEqual({ state: { equals: "NSW", mode: "insensitive" } });
  });

  it("a State Manager with no state set gets no state branch", async () => {
    mockSession({ id: "u-x", name: "X", role: "head_office" });
    prismaMock.scorecard.findMany.mockResolvedValue([]);
    await listGET(createRequest("GET", "/api/scorecards"));
    const call = prismaMock.scorecard.findMany.mock.calls[0][0];
    expect(call.where.OR).toHaveLength(2);
  });

  it("a Director of Service never gets a state branch", async () => {
    mockSession({ id: "u-coord", name: "Coord", role: "member", state: "NSW" });
    prismaMock.scorecard.findMany.mockResolvedValue([]);
    await listGET(createRequest("GET", "/api/scorecards"));
    const call = prismaMock.scorecard.findMany.mock.calls[0][0];
    expect(call.where.OR).toHaveLength(2);
  });
});

describe("POST /api/scorecards", () => {
  it("creates scorecard with caller as owner", async () => {
    mockSession({ id: "u-admin", name: "Admin", role: "admin" });
    prismaMock.scorecard.create.mockResolvedValue({
      id: "sc-1",
      title: "Marketing Scorecard",
      ownerId: "u-admin",
    } as never);
    const res = await listPOST(
      createRequest("POST", "/api/scorecards", {
        body: { title: "  Marketing Scorecard  " },
      }),
    );
    expect(res.status).toBe(201);
    const createCall = prismaMock.scorecard.create.mock.calls[0][0];
    expect(createCall.data).toMatchObject({
      title: "Marketing Scorecard", // trimmed
      ownerId: "u-admin",
    });
  });

  it("returns 400 on empty title", async () => {
    mockSession({ id: "u-admin", name: "Admin", role: "admin" });
    const res = await listPOST(
      createRequest("POST", "/api/scorecards", { body: { title: "" } }),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/scorecards/[id]", () => {
  it("returns 403 when viewer is neither owner nor member", async () => {
    mockSession({ id: "u-stranger", name: "Stranger", role: "admin" });
    prismaMock.scorecard.findUnique.mockResolvedValueOnce({
      id: "sc-1",
      ownerId: "u-other",
      members: [],
    } as never);
    const res = await itemGET(
      createRequest("GET", "/api/scorecards/sc-1"),
      ctx("sc-1") as never,
    );
    expect(res.status).toBe(403);
  });

  it("members can view", async () => {
    mockSession({ id: "u-member", name: "Member", role: "staff" });
    // First call: load core for permission check.
    prismaMock.scorecard.findUnique.mockResolvedValueOnce({
      id: "sc-1",
      ownerId: "u-other",
      members: [{ userId: "u-member" }],
    } as never);
    // Second call: load full payload after permission passes.
    prismaMock.scorecard.findUnique.mockResolvedValueOnce({
      id: "sc-1",
      title: "x",
    } as never);
    const res = await itemGET(
      createRequest("GET", "/api/scorecards/sc-1"),
      ctx("sc-1") as never,
    );
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/scorecards/[id]", () => {
  it("scorecard owner can rename", async () => {
    mockSession({ id: "u-owner", name: "Owner", role: "admin" });
    prismaMock.scorecard.findUnique.mockResolvedValue({
      id: "sc-1",
      ownerId: "u-owner",
      title: "Old",
      members: [],
    } as never);
    prismaMock.scorecard.update.mockResolvedValue({
      id: "sc-1",
      title: "New",
    } as never);
    const res = await itemPATCH(
      createRequest("PATCH", "/api/scorecards/sc-1", {
        body: { title: "New" },
      }),
      ctx("sc-1") as never,
    );
    expect(res.status).toBe(200);
  });

  it("member CANNOT rename", async () => {
    mockSession({ id: "u-member", name: "Member", role: "staff" });
    prismaMock.scorecard.findUnique.mockResolvedValue({
      id: "sc-1",
      ownerId: "u-other",
      title: "Old",
      members: [{ userId: "u-member" }],
    } as never);
    const res = await itemPATCH(
      createRequest("PATCH", "/api/scorecards/sc-1", {
        body: { title: "Member's attempt" },
      }),
      ctx("sc-1") as never,
    );
    expect(res.status).toBe(403);
  });

  it("dashboard owner can rename anyone's scorecard", async () => {
    mockSession({ id: "u-jayden", name: "Jayden", role: "owner" });
    prismaMock.scorecard.findUnique.mockResolvedValue({
      id: "sc-1",
      ownerId: "u-other",
      title: "Old",
      members: [],
    } as never);
    prismaMock.scorecard.update.mockResolvedValue({
      id: "sc-1",
      title: "Renamed by Jayden",
    } as never);
    const res = await itemPATCH(
      createRequest("PATCH", "/api/scorecards/sc-1", {
        body: { title: "Renamed by Jayden" },
      }),
      ctx("sc-1") as never,
    );
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/scorecards/[id] — state", () => {
  beforeEach(() => {
    prismaMock.scorecard.findUnique.mockResolvedValue({
      id: "sc-1",
      ownerId: "u-owner",
      title: "NSW Scorecard",
      state: null,
      members: [],
    } as never);
    prismaMock.scorecard.update.mockResolvedValue({ id: "sc-1", title: "NSW Scorecard", state: "NSW" } as never);
  });

  it("the owner can set the state", async () => {
    mockSession({ id: "u-owner", name: "Owner", role: "admin" });
    const res = await itemPATCH(
      createRequest("PATCH", "/api/scorecards/sc-1", { body: { state: "NSW" } }),
      ctx("sc-1") as never,
    );
    expect(res.status).toBe(200);
    expect(prismaMock.scorecard.update.mock.calls[0][0].data).toEqual({ state: "NSW" });
  });

  it("rejects a state that isn't Australian", async () => {
    mockSession({ id: "u-owner", name: "Owner", role: "admin" });
    const res = await itemPATCH(
      createRequest("PATCH", "/api/scorecards/sc-1", { body: { state: "XYZ" } }),
      ctx("sc-1") as never,
    );
    expect(res.status).toBe(400);
  });

  it("the state's State Manager can view but not change it", async () => {
    mockSession({ id: "u-mirna", name: "Mirna", role: "head_office", state: "NSW" });
    prismaMock.scorecard.findUnique.mockResolvedValue({
      id: "sc-1",
      ownerId: "u-owner",
      title: "NSW Scorecard",
      state: "NSW",
      members: [],
    } as never);
    const res = await itemPATCH(
      createRequest("PATCH", "/api/scorecards/sc-1", { body: { state: null } }),
      ctx("sc-1") as never,
    );
    expect(res.status).toBe(403);
    const view = await itemGET(createRequest("GET", "/api/scorecards/sc-1"), ctx("sc-1") as never);
    expect(view.status).toBe(200);
  });
});

describe("DELETE /api/scorecards/[id]", () => {
  it("returns 403 when caller is just a member", async () => {
    mockSession({ id: "u-member", name: "Member", role: "staff" });
    prismaMock.scorecard.findUnique.mockResolvedValue({
      id: "sc-1",
      ownerId: "u-other",
      title: "x",
      members: [{ userId: "u-member" }],
    } as never);
    const res = await itemDELETE(
      createRequest("DELETE", "/api/scorecards/sc-1"),
      ctx("sc-1") as never,
    );
    expect(res.status).toBe(403);
  });

  it("scorecard owner can delete", async () => {
    mockSession({ id: "u-owner", name: "Owner", role: "admin" });
    prismaMock.scorecard.findUnique.mockResolvedValue({
      id: "sc-1",
      ownerId: "u-owner",
      title: "x",
      members: [],
    } as never);
    prismaMock.scorecard.delete.mockResolvedValue({} as never);
    const res = await itemDELETE(
      createRequest("DELETE", "/api/scorecards/sc-1"),
      ctx("sc-1") as never,
    );
    expect(res.status).toBe(200);
    expect(prismaMock.scorecard.delete).toHaveBeenCalledWith({
      where: { id: "sc-1" },
    });
  });
});
