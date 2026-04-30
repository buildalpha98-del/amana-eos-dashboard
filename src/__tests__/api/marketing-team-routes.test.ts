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
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "test-req-id",
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

import { GET as TEAM_GET } from "@/app/api/marketing/team/route";
import { PATCH as TEAM_PATCH } from "@/app/api/marketing/team/[userId]/route";
import { POST as TEAM_ADD } from "@/app/api/marketing/team/add/route";
import { GET as CANDIDATES_GET } from "@/app/api/marketing/team/candidates/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  delete process.env.MARKETING_RESET_START_DATE;
});

describe("GET /api/marketing/team", () => {
  it("401 unauth", async () => {
    mockNoSession();
    const res = await TEAM_GET(createRequest("GET", "/api/marketing/team"));
    expect(res.status).toBe(401);
  });

  it("403 staff role", async () => {
    mockSession({ id: "u", name: "Staff", role: "staff" });
    const res = await TEAM_GET(createRequest("GET", "/api/marketing/team"));
    expect(res.status).toBe(403);
  });

  it("returns members with output counts and milestones", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: "u-editor",
        name: "Lina",
        email: "lina@x.com",
        active: true,
        contentTeamRole: "video_editor",
        contentTeamStatus: "active",
        contentTeamStartedAt: new Date("2026-01-01"),
        contentTeamPausedAt: null,
        contentTeamPauseReason: null,
      },
    ]);
    prismaMock.marketingPost.groupBy.mockImplementation(({ where }: any) => {
      // Distinguish "this week" vs "last 4 weeks" by date filter
      const days = where.createdAt.gte ? Math.round((Date.now() - where.createdAt.gte.getTime()) / 86400000) : 0;
      if (days <= 8) return Promise.resolve([{ assigneeId: "u-editor", _count: { _all: 2 } }]);
      return Promise.resolve([{ assigneeId: "u-editor", _count: { _all: 12 } }]);
    });
    prismaMock.marketingTask.groupBy.mockResolvedValue([
      { assigneeId: "u-editor", _count: { _all: 3 } },
    ]);
    const res = await TEAM_GET(createRequest("GET", "/api/marketing/team"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.members).toHaveLength(1);
    expect(data.members[0].outputThisWeek).toBe(2);
    expect(data.members[0].outputLast4Weeks).toBe(12);
    expect(data.members[0].avgWeeklyOutput).toBe(3);
    expect(data.members[0].activeTaskCount).toBe(3);
    expect(data.hiringMilestones.day60).toBeDefined();
    expect(data.hiringMilestones.day90).toBeDefined();
    expect(data.hiringMilestones.day120).toBeDefined();
    expect(typeof data.resetStartDate).toBe("string");
  });
});

describe("PATCH /api/marketing/team/[userId]", () => {
  it("401 unauth", async () => {
    mockNoSession();
    const res = await TEAM_PATCH(
      createRequest("PATCH", "/api/marketing/team/u-1", { body: {} }),
      { params: Promise.resolve({ userId: "u-1" }) },
    );
    expect(res.status).toBe(401);
  });

  it("404 missing user", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.user.findUnique.mockImplementation(({ where, select }: any) => {
      if (select?.contentTeamRole) return Promise.resolve(null); // target lookup
      return Promise.resolve({ active: true }); // session active check
    });
    const res = await TEAM_PATCH(
      createRequest("PATCH", "/api/marketing/team/missing", { body: { contentTeamStatus: "active" } }),
      { params: Promise.resolve({ userId: "missing" }) },
    );
    expect(res.status).toBe(404);
  });

  it("400 when status set but role missing", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.user.findUnique.mockImplementation(({ select }: any) => {
      if (select?.contentTeamRole) return Promise.resolve({ id: "u-1", contentTeamRole: null });
      return Promise.resolve({ active: true });
    });
    const res = await TEAM_PATCH(
      createRequest("PATCH", "/api/marketing/team/u-1", { body: { contentTeamStatus: "active" } }),
      { params: Promise.resolve({ userId: "u-1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("happy path: change status from onboarding to active", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.user.findUnique.mockImplementation(({ select }: any) => {
      if (select?.contentTeamRole) return Promise.resolve({ id: "u-1", contentTeamRole: "video_editor" });
      return Promise.resolve({ active: true });
    });
    prismaMock.user.update.mockResolvedValue({
      id: "u-1",
      contentTeamRole: "video_editor",
      contentTeamStatus: "active",
      contentTeamStartedAt: null,
      contentTeamPausedAt: null,
      contentTeamPauseReason: null,
    });
    const res = await TEAM_PATCH(
      createRequest("PATCH", "/api/marketing/team/u-1", { body: { contentTeamStatus: "active" } }),
      { params: Promise.resolve({ userId: "u-1" }) },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.contentTeamStatus).toBe("active");
  });
});

describe("POST /api/marketing/team/add", () => {
  it("400 invalid body", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    const res = await TEAM_ADD(
      createRequest("POST", "/api/marketing/team/add", { body: { role: "video_editor" } as any }),
    );
    expect(res.status).toBe(400);
  });

  it("404 unknown user", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.user.findUnique.mockImplementation(({ select }: any) => {
      if (select?.contentTeamRole) return Promise.resolve(null);
      return Promise.resolve({ active: true });
    });
    const res = await TEAM_ADD(
      createRequest("POST", "/api/marketing/team/add", { body: { userId: "missing", role: "video_editor" } }),
    );
    expect(res.status).toBe(404);
  });

  it("409 already on team", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.user.findUnique.mockImplementation(({ select }: any) => {
      if (select?.contentTeamRole) return Promise.resolve({ id: "u-1", contentTeamRole: "video_editor", contentTeamStatus: "active" });
      return Promise.resolve({ active: true });
    });
    const res = await TEAM_ADD(
      createRequest("POST", "/api/marketing/team/add", { body: { userId: "u-1", role: "video_editor" } }),
    );
    expect(res.status).toBe(409);
  });

  it("201 happy path", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.user.findUnique.mockImplementation(({ select }: any) => {
      if (select?.contentTeamRole) return Promise.resolve({ id: "u-1", contentTeamRole: null, contentTeamStatus: null });
      return Promise.resolve({ active: true });
    });
    prismaMock.user.update.mockResolvedValue({
      id: "u-1",
      name: "Lina",
      contentTeamRole: "video_editor",
      contentTeamStatus: "onboarding",
      contentTeamStartedAt: new Date("2026-04-28"),
    });
    const res = await TEAM_ADD(
      createRequest("POST", "/api/marketing/team/add", { body: { userId: "u-1", role: "video_editor", startedAt: "2026-04-28" } }),
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.contentTeamStatus).toBe("onboarding");
  });

  it("readds a previously departed user", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.user.findUnique.mockImplementation(({ select }: any) => {
      if (select?.contentTeamRole) return Promise.resolve({ id: "u-1", contentTeamRole: "video_editor", contentTeamStatus: "departed" });
      return Promise.resolve({ active: true });
    });
    prismaMock.user.update.mockResolvedValue({
      id: "u-1",
      name: "Lina",
      contentTeamRole: "video_editor",
      contentTeamStatus: "onboarding",
      contentTeamStartedAt: new Date(),
    });
    const res = await TEAM_ADD(
      createRequest("POST", "/api/marketing/team/add", { body: { userId: "u-1", role: "video_editor" } }),
    );
    expect(res.status).toBe(201);
  });
});

describe("GET /api/marketing/team/candidates", () => {
  it("returns active users not currently on the team", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.user.findMany.mockResolvedValue([
      { id: "u-1", name: "Sara", email: "s@x.com", role: "staff" },
      { id: "u-2", name: "Lina", email: "l@x.com", role: "marketing" },
    ]);
    const res = await CANDIDATES_GET(createRequest("GET", "/api/marketing/team/candidates"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.candidates).toHaveLength(2);
  });
});
