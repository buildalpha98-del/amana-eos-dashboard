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

// Import after mocks.
import { GET, POST } from "@/app/api/services/[id]/responsible-person/route";
import { DELETE } from "@/app/api/services/[id]/responsible-person/[entryId]/route";

function ctx(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "rp-1",
    serviceId: "svc-1",
    date: new Date("2026-04-20"),
    sessionType: "asc",
    personName: "Sara Ahmed",
    personRole: "Director of Service",
    userId: null,
    startTime: "15:00",
    endTime: "18:30",
    notes: null,
    ...overrides,
  };
}

function resetCommon() {
  _clearUserActiveCache();
  vi.clearAllMocks();
  // server-auth's isUserActive selects `active`.
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
}

// ── GET ───────────────────────────────────────────────────────────────────

describe("GET /api/services/[id]/responsible-person", () => {
  beforeEach(resetCommon);

  const url = "/api/services/svc-1/responsible-person?from=2026-04-20&to=2026-04-24";

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await GET(createRequest("GET", url), ctx({ id: "svc-1" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when from/to missing", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const res = await GET(
      createRequest("GET", "/api/services/svc-1/responsible-person"),
      ctx({ id: "svc-1" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when from is malformed", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const res = await GET(
      createRequest(
        "GET",
        "/api/services/svc-1/responsible-person?from=20-04-2026&to=2026-04-24",
      ),
      ctx({ id: "svc-1" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns entries for the inclusive range (admin happy path)", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.responsiblePersonEntry.findMany.mockResolvedValue([makeEntry()]);

    const res = await GET(createRequest("GET", url), ctx({ id: "svc-1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].id).toBe("rp-1");

    const call = prismaMock.responsiblePersonEntry.findMany.mock.calls[0][0];
    expect(call.where.serviceId).toBe("svc-1");
    // Inclusive to → lt is to+1 day, so the span is 5 days for 20→24.
    const spanMs =
      (call.where.date.lt as Date).getTime() -
      (call.where.date.gte as Date).getTime();
    expect(spanMs).toBe(5 * 24 * 60 * 60 * 1000);
  });

  it("lets a staff member of the service view it", async () => {
    mockSession({ id: "s-1", name: "Edu", role: "staff", serviceId: "svc-1" });
    prismaMock.responsiblePersonEntry.findMany.mockResolvedValue([]);
    const res = await GET(createRequest("GET", url), ctx({ id: "svc-1" }));
    expect(res.status).toBe(200);
  });

  it("returns 403 for a member of a different service", async () => {
    mockSession({ id: "m-1", name: "Dir", role: "member", serviceId: "svc-other" });
    const res = await GET(createRequest("GET", url), ctx({ id: "svc-1" }));
    expect(res.status).toBe(403);
  });
});

// ── POST (upsert) ───────────────────────────────────────────────────────────

describe("POST /api/services/[id]/responsible-person", () => {
  beforeEach(resetCommon);

  const url = "/api/services/svc-1/responsible-person";
  const validBody = {
    date: "2026-04-20",
    sessionType: "asc",
    personName: "Sara Ahmed",
    personRole: "Director of Service",
    startTime: "15:00",
    endTime: "18:30",
  };

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await POST(
      createRequest("POST", url, { body: validBody }),
      ctx({ id: "svc-1" }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for a member of a different service", async () => {
    mockSession({ id: "m-1", name: "Dir", role: "member", serviceId: "svc-other" });
    const res = await POST(
      createRequest("POST", url, { body: validBody }),
      ctx({ id: "svc-1" }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 when personName is missing", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const res = await POST(
      createRequest("POST", url, {
        body: { date: "2026-04-20", sessionType: "asc" },
      }),
      ctx({ id: "svc-1" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when endTime <= startTime", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const res = await POST(
      createRequest("POST", url, {
        body: { ...validBody, startTime: "18:30", endTime: "15:00" },
      }),
      ctx({ id: "svc-1" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/endTime must be later/);
  });

  it("upserts on happy path (admin) keyed by service+date+session", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.responsiblePersonEntry.upsert.mockResolvedValue(makeEntry());

    const res = await POST(
      createRequest("POST", url, { body: validBody }),
      ctx({ id: "svc-1" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entry.personName).toBe("Sara Ahmed");

    const call = prismaMock.responsiblePersonEntry.upsert.mock.calls[0][0];
    expect(call.where.serviceId_date_sessionType.serviceId).toBe("svc-1");
    expect(call.where.serviceId_date_sessionType.sessionType).toBe("asc");
    expect(call.create.personName).toBe("Sara Ahmed");
    expect(call.create.createdById).toBe("admin-1");
    // Service lookup is skipped when explicit times are supplied.
    expect(prismaMock.service.findUnique).not.toHaveBeenCalled();
  });

  it("defaults the designated times from the session when omitted", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.service.findUnique.mockResolvedValue({ sessionTimes: null });
    prismaMock.responsiblePersonEntry.upsert.mockResolvedValue(makeEntry());

    const res = await POST(
      createRequest("POST", url, {
        body: { date: "2026-04-20", sessionType: "asc", personName: "Sara Ahmed" },
      }),
      ctx({ id: "svc-1" }),
    );
    expect(res.status).toBe(200);
    const call = prismaMock.responsiblePersonEntry.upsert.mock.calls[0][0];
    // Federal ASC window.
    expect(call.create.startTime).toBe("15:00");
    expect(call.create.endTime).toBe("18:30");
  });

  it("returns 404 when defaulting times but the service is missing", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.service.findUnique.mockResolvedValue(null);
    const res = await POST(
      createRequest("POST", url, {
        body: { date: "2026-04-20", sessionType: "asc", personName: "Sara Ahmed" },
      }),
      ctx({ id: "svc-1" }),
    );
    expect(res.status).toBe(404);
  });

  it("lets the service's own Director (member) upsert", async () => {
    mockSession({ id: "m-1", name: "Dir", role: "member", serviceId: "svc-1" });
    prismaMock.responsiblePersonEntry.upsert.mockResolvedValue(makeEntry());
    const res = await POST(
      createRequest("POST", url, { body: validBody }),
      ctx({ id: "svc-1" }),
    );
    expect(res.status).toBe(200);
  });
});

// ── DELETE ──────────────────────────────────────────────────────────────────

describe("DELETE /api/services/[id]/responsible-person/[entryId]", () => {
  beforeEach(resetCommon);

  const url = "/api/services/svc-1/responsible-person/rp-1";

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await DELETE(
      createRequest("DELETE", url),
      ctx({ id: "svc-1", entryId: "rp-1" }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for a member of a different service", async () => {
    mockSession({ id: "m-1", name: "Dir", role: "member", serviceId: "svc-other" });
    const res = await DELETE(
      createRequest("DELETE", url),
      ctx({ id: "svc-1", entryId: "rp-1" }),
    );
    expect(res.status).toBe(403);
    expect(prismaMock.responsiblePersonEntry.delete).not.toHaveBeenCalled();
  });

  it("returns 404 when the entry does not exist", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.responsiblePersonEntry.findUnique.mockResolvedValue(null);
    const res = await DELETE(
      createRequest("DELETE", url),
      ctx({ id: "svc-1", entryId: "rp-1" }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when the entry belongs to a different service", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.responsiblePersonEntry.findUnique.mockResolvedValue({
      id: "rp-1",
      serviceId: "svc-2",
    });
    const res = await DELETE(
      createRequest("DELETE", url),
      ctx({ id: "svc-1", entryId: "rp-1" }),
    );
    expect(res.status).toBe(404);
    expect(prismaMock.responsiblePersonEntry.delete).not.toHaveBeenCalled();
  });

  it("deletes on happy path (admin)", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.responsiblePersonEntry.findUnique.mockResolvedValue({
      id: "rp-1",
      serviceId: "svc-1",
    });
    prismaMock.responsiblePersonEntry.delete.mockResolvedValue(makeEntry());
    const res = await DELETE(
      createRequest("DELETE", url),
      ctx({ id: "svc-1", entryId: "rp-1" }),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.responsiblePersonEntry.delete).toHaveBeenCalledWith({
      where: { id: "rp-1" },
    });
  });
});
