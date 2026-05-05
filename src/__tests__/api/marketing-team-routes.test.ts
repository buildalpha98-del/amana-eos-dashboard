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

import { GET as LIST_GET, POST as LIST_POST } from "@/app/api/marketing/content-team/route";
import { PATCH as MEMBER_PATCH, DELETE as MEMBER_DELETE } from "@/app/api/marketing/content-team/[id]/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  delete process.env.MARKETING_RESET_START_DATE;
});

describe("GET /api/marketing/content-team", () => {
  it("401 unauth", async () => {
    mockNoSession();
    const res = await LIST_GET(createRequest("GET", "/api/marketing/content-team"));
    expect(res.status).toBe(401);
  });

  it("403 staff role", async () => {
    mockSession({ id: "u", name: "Staff", role: "staff" });
    const res = await LIST_GET(createRequest("GET", "/api/marketing/content-team"));
    expect(res.status).toBe(403);
  });

  it("returns members with milestones", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.contentTeamMember.findMany.mockResolvedValue([
      {
        id: "m-1",
        name: "Lina",
        role: "video_editor",
        status: "active",
        phone: null,
        email: "lina@x.com",
        notes: null,
        startedAt: new Date("2026-01-01"),
        pausedAt: null,
        pauseReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const res = await LIST_GET(createRequest("GET", "/api/marketing/content-team"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.members).toHaveLength(1);
    expect(data.members[0].name).toBe("Lina");
    expect(data.members[0].role).toBe("video_editor");
    expect(data.milestones.day60).toBeDefined();
    expect(data.milestones.day90).toBeDefined();
    expect(data.milestones.day120).toBeDefined();
    expect(typeof data.resetStartDate).toBe("string");
  });
});

describe("POST /api/marketing/content-team", () => {
  it("400 missing name", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    const res = await LIST_POST(
      createRequest("POST", "/api/marketing/content-team", { body: { role: "video_editor" } }),
    );
    expect(res.status).toBe(400);
  });

  it("400 invalid role", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    const res = await LIST_POST(
      createRequest("POST", "/api/marketing/content-team", { body: { name: "Lina", role: "invalid" } }),
    );
    expect(res.status).toBe(400);
  });

  it("201 happy path", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.contentTeamMember.create.mockResolvedValue({
      id: "m-1",
      name: "Lina",
      role: "video_editor",
      status: "prospect",
      phone: null,
      email: null,
      notes: null,
      startedAt: null,
      pausedAt: null,
      pauseReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const res = await LIST_POST(
      createRequest("POST", "/api/marketing/content-team", { body: { name: "Lina", role: "video_editor" } }),
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe("Lina");
    expect(data.status).toBe("prospect");
  });
});

describe("PATCH /api/marketing/content-team/[id]", () => {
  it("401 unauth", async () => {
    mockNoSession();
    const res = await MEMBER_PATCH(
      createRequest("PATCH", "/api/marketing/content-team/m-1", { body: {} }),
      { params: Promise.resolve({ id: "m-1" }) },
    );
    expect(res.status).toBe(401);
  });

  it("404 missing member", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.contentTeamMember.findUnique.mockResolvedValue(null);
    const res = await MEMBER_PATCH(
      createRequest("PATCH", "/api/marketing/content-team/missing", { body: { status: "active" } }),
      { params: Promise.resolve({ id: "missing" }) },
    );
    expect(res.status).toBe(404);
  });

  it("happy path: change status to active", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.contentTeamMember.findUnique.mockResolvedValue({
      id: "m-1",
      name: "Lina",
      role: "video_editor",
      status: "onboarding",
    });
    prismaMock.contentTeamMember.update.mockResolvedValue({
      id: "m-1",
      name: "Lina",
      role: "video_editor",
      status: "active",
      phone: null,
      email: null,
      notes: null,
      startedAt: null,
      pausedAt: null,
      pauseReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const res = await MEMBER_PATCH(
      createRequest("PATCH", "/api/marketing/content-team/m-1", { body: { status: "active" } }),
      { params: Promise.resolve({ id: "m-1" }) },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("active");
  });
});

describe("DELETE /api/marketing/content-team/[id]", () => {
  it("401 unauth", async () => {
    mockNoSession();
    const res = await MEMBER_DELETE(
      createRequest("DELETE", "/api/marketing/content-team/m-1"),
      { params: Promise.resolve({ id: "m-1" }) },
    );
    expect(res.status).toBe(401);
  });

  it("404 missing member", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.contentTeamMember.findUnique.mockResolvedValue(null);
    const res = await MEMBER_DELETE(
      createRequest("DELETE", "/api/marketing/content-team/missing"),
      { params: Promise.resolve({ id: "missing" }) },
    );
    expect(res.status).toBe(404);
  });

  it("happy path: deletes member", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.contentTeamMember.findUnique.mockResolvedValue({ id: "m-1", name: "Lina" });
    prismaMock.contentTeamMember.delete.mockResolvedValue({ id: "m-1" });
    const res = await MEMBER_DELETE(
      createRequest("DELETE", "/api/marketing/content-team/m-1"),
      { params: Promise.resolve({ id: "m-1" }) },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.deleted).toBe(true);
  });
});
