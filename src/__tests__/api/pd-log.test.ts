import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 }),
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

import { POST, GET } from "@/app/api/users/[id]/pd-log/route";
import {
  PATCH,
  DELETE,
} from "@/app/api/users/[id]/pd-log/[recordId]/route";

const ctx = (params: Record<string, string>) => ({
  params: Promise.resolve(params),
});

const fakeRecord = {
  id: "pd-1",
  userId: "u-target",
  title: "ECA Inclusion Webinar",
  type: "online",
  hours: 2.5 as unknown,
  completedAt: new Date("2026-04-01"),
  provider: "ECA",
  attachmentUrl: null,
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("POST /api/users/[id]/pd-log", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({
      active: true,
      id: "u-target",
    } as unknown as { active: boolean });
    prismaMock.professionalDevelopmentRecord.create.mockResolvedValue(
      fakeRecord as never,
    );
    prismaMock.activityLog.create.mockResolvedValue({} as never);
  });

  it("admin creating PD record → 201", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin", serviceId: null });
    const req = createRequest("POST", "/api/users/u-target/pd-log", {
      body: {
        title: "ECA Inclusion Webinar",
        type: "online",
        hours: 2.5,
        completedAt: "2026-04-01T00:00:00.000Z",
        provider: "ECA",
      },
    });
    const res = await POST(req, ctx({ id: "u-target" }));
    expect(res.status).toBe(201);
    expect(prismaMock.professionalDevelopmentRecord.create).toHaveBeenCalled();
  });

  it("staff creating PD record → 403", async () => {
    mockSession({ id: "u1", name: "Staff", role: "staff", serviceId: "svc-1" });
    const req = createRequest("POST", "/api/users/u-target/pd-log", {
      body: {
        title: "X",
        type: "online",
        hours: 1,
        completedAt: "2026-04-01T00:00:00.000Z",
      },
    });
    const res = await POST(req, ctx({ id: "u-target" }));
    expect(res.status).toBe(403);
  });

  it("rejects invalid type enum (400)", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin", serviceId: null });
    const req = createRequest("POST", "/api/users/u-target/pd-log", {
      body: {
        title: "X",
        type: "lunch_chat",
        hours: 1,
        completedAt: "2026-04-01T00:00:00.000Z",
      },
    });
    const res = await POST(req, ctx({ id: "u-target" }));
    expect(res.status).toBe(400);
  });

  it("rejects zero/negative hours (400)", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin", serviceId: null });
    const req = createRequest("POST", "/api/users/u-target/pd-log", {
      body: {
        title: "X",
        type: "online",
        hours: 0,
        completedAt: "2026-04-01T00:00:00.000Z",
      },
    });
    const res = await POST(req, ctx({ id: "u-target" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when target user does not exist", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin", serviceId: null });
    // Auth wrapper looks up the session user (u1) for active check, then the
    // route looks up the target user (u-missing). Different IDs need different
    // results to isolate the 404 path from the 401 path.
    prismaMock.user.findUnique.mockImplementation(({ where }) =>
      where.id === "u-missing"
        ? Promise.resolve(null)
        : Promise.resolve({ active: true }),
    );
    const req = createRequest("POST", "/api/users/u-missing/pd-log", {
      body: {
        title: "X",
        type: "online",
        hours: 1,
        completedAt: "2026-04-01T00:00:00.000Z",
      },
    });
    const res = await POST(req, ctx({ id: "u-missing" }));
    expect(res.status).toBe(404);
  });
});

describe("GET /api/users/[id]/pd-log", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.professionalDevelopmentRecord.findMany.mockResolvedValue([
      fakeRecord,
    ] as never);
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const req = createRequest("GET", "/api/users/u-target/pd-log");
    const res = await GET(req, ctx({ id: "u-target" }));
    expect(res.status).toBe(401);
  });

  it("admin viewing any user → 200", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin", serviceId: null });
    const req = createRequest("GET", "/api/users/u-target/pd-log");
    const res = await GET(req, ctx({ id: "u-target" }));
    expect(res.status).toBe(200);
  });

  it("user viewing own → 200", async () => {
    mockSession({ id: "u-target", name: "Self", role: "staff", serviceId: "svc-1" });
    const req = createRequest("GET", "/api/users/u-target/pd-log");
    const res = await GET(req, ctx({ id: "u-target" }));
    expect(res.status).toBe(200);
  });

  it("staff viewing other user → 403", async () => {
    mockSession({ id: "u-other", name: "Other", role: "staff", serviceId: "svc-1" });
    const req = createRequest("GET", "/api/users/u-target/pd-log");
    const res = await GET(req, ctx({ id: "u-target" }));
    expect(res.status).toBe(403);
  });
});

describe("PATCH/DELETE /api/users/[id]/pd-log/[recordId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.professionalDevelopmentRecord.findUnique.mockResolvedValue(
      fakeRecord as never,
    );
    prismaMock.professionalDevelopmentRecord.update.mockResolvedValue(
      fakeRecord as never,
    );
    prismaMock.professionalDevelopmentRecord.delete.mockResolvedValue(
      fakeRecord as never,
    );
    prismaMock.activityLog.create.mockResolvedValue({} as never);
  });

  it("admin PATCH → 200", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin", serviceId: null });
    const req = createRequest("PATCH", "/api/users/u-target/pd-log/pd-1", {
      body: { hours: 3.0 },
    });
    const res = await PATCH(req, ctx({ id: "u-target", recordId: "pd-1" }));
    expect(res.status).toBe(200);
  });

  it("staff PATCH → 403", async () => {
    mockSession({ id: "u1", name: "Staff", role: "staff", serviceId: "svc-1" });
    const req = createRequest("PATCH", "/api/users/u-target/pd-log/pd-1", {
      body: { hours: 3.0 },
    });
    const res = await PATCH(req, ctx({ id: "u-target", recordId: "pd-1" }));
    expect(res.status).toBe(403);
  });

  it("PATCH on record belonging to different user → 404", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin", serviceId: null });
    prismaMock.professionalDevelopmentRecord.findUnique.mockResolvedValue({
      ...fakeRecord,
      userId: "u-different",
    } as never);
    const req = createRequest("PATCH", "/api/users/u-target/pd-log/pd-1", {
      body: { hours: 3.0 },
    });
    const res = await PATCH(req, ctx({ id: "u-target", recordId: "pd-1" }));
    expect(res.status).toBe(404);
  });

  it("admin DELETE → 200", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin", serviceId: null });
    const req = createRequest("DELETE", "/api/users/u-target/pd-log/pd-1");
    const res = await DELETE(req, ctx({ id: "u-target", recordId: "pd-1" }));
    expect(res.status).toBe(200);
    expect(prismaMock.professionalDevelopmentRecord.delete).toHaveBeenCalled();
  });

  it("DELETE on missing record → 404", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin", serviceId: null });
    prismaMock.professionalDevelopmentRecord.findUnique.mockResolvedValue(null);
    const req = createRequest("DELETE", "/api/users/u-target/pd-log/pd-1");
    const res = await DELETE(req, ctx({ id: "u-target", recordId: "pd-1" }));
    expect(res.status).toBe(404);
  });
});
