import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "@/__tests__/helpers/prisma-mock";
import { mockSession, mockNoSession, type MockUserRole } from "@/__tests__/helpers/auth-mock";
import { createRequest } from "@/__tests__/helpers/request";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  generateRequestId: () => "test-req-id",
}));

import { GET as LIST, POST as CREATE } from "@/app/api/meetings/route";
import { GET as GET_ONE, PATCH } from "@/app/api/meetings/[id]/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const params = { params: Promise.resolve({ id: "m-1" }) };

describe("GET /api/meetings (list)", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "owner" });
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const req = createRequest("GET", "/api/meetings");
    const res = await LIST(req);
    expect(res.status).toBe(401);
  });

  it("returns a list for an authenticated user", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.meeting.findMany.mockResolvedValue([
      { id: "m-1", title: "L10", date: new Date(), status: "scheduled", attendees: [] },
    ]);

    const req = createRequest("GET", "/api/meetings");
    const res = await LIST(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe("m-1");
  });

  it("applies status filter from query string", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.meeting.findMany.mockResolvedValue([]);

    const req = createRequest("GET", "/api/meetings?status=completed");
    await LIST(req);

    const call = prismaMock.meeting.findMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ status: "completed" });
  });

  it("honours limit query param", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.meeting.findMany.mockResolvedValue([]);

    const req = createRequest("GET", "/api/meetings?limit=5");
    await LIST(req);

    const call = prismaMock.meeting.findMany.mock.calls[0][0];
    expect(call.take).toBe(5);
  });
});

describe("POST /api/meetings (create) — role enforcement", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "owner" });
    prismaMock.meeting.create.mockResolvedValue({ id: "m-1", title: "L10", date: new Date(), status: "in_progress", attendees: [] });
    prismaMock.meetingAttendee.createMany.mockResolvedValue({ count: 0 });
    prismaMock.activityLog.create.mockResolvedValue({ id: "al-1" });
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const req = createRequest("POST", "/api/meetings", { body: { title: "L10", date: "2026-04-22" } });
    const res = await CREATE(req);
    expect(res.status).toBe(401);
  });

  it.each([
    ["owner", 201],
    ["head_office", 201],
    ["admin", 201],
    ["member", 403],
    ["member", 403],
    ["staff", 403],
    ["marketing", 403],
  ])("role %s → %i", async (role, expected) => {
    mockSession({ id: "u1", name: "U", role: role as MockUserRole });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role });

    const req = createRequest("POST", "/api/meetings", { body: { title: "L10", date: "2026-04-22" } });
    const res = await CREATE(req);
    expect(res.status).toBe(expected);
  });

  it("returns 400 when title missing", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    const req = createRequest("POST", "/api/meetings", { body: { date: "2026-04-22" } });
    const res = await CREATE(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when date missing", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    const req = createRequest("POST", "/api/meetings", { body: { title: "L10" } });
    const res = await CREATE(req);
    expect(res.status).toBe(400);
  });

  it("creates and returns 201 on happy path", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    const req = createRequest("POST", "/api/meetings", {
      body: { title: "L10", date: "2026-04-22", serviceIds: ["svc-1"] },
    });
    const res = await CREATE(req);
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.id).toBe("m-1");

    const call = prismaMock.meeting.create.mock.calls[0][0];
    expect(call.data.title).toBe("L10");
    expect(call.data.serviceIds).toEqual(["svc-1"]);
    expect(call.data.status).toBe("in_progress");
  });

  it("creates attendee rows when attendeeIds provided", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    const req = createRequest("POST", "/api/meetings", {
      body: { title: "L10", date: "2026-04-22", attendeeIds: ["u2", "u3"] },
    });
    await CREATE(req);

    expect(prismaMock.meetingAttendee.createMany).toHaveBeenCalled();
    const call = prismaMock.meetingAttendee.createMany.mock.calls[0][0];
    expect(call.data).toHaveLength(2);
    expect(call.data[0]).toMatchObject({ meetingId: "m-1", userId: "u2", status: "present" });
  });
});

describe("GET /api/meetings/[id]", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "owner" });
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const req = createRequest("GET", "/api/meetings/m-1");
    const res = await GET_ONE(req, params);
    expect(res.status).toBe(401);
  });

  it("returns meeting by id", async () => {
    prismaMock.meeting.findUnique.mockResolvedValue({
      id: "m-1",
      title: "L10",
      status: "scheduled",
      attendees: [],
      cascades: [],
    });

    const req = createRequest("GET", "/api/meetings/m-1");
    const res = await GET_ONE(req, params);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.id).toBe("m-1");
  });

  it("returns 404 when meeting not found", async () => {
    prismaMock.meeting.findUnique.mockResolvedValue(null);

    const req = createRequest("GET", "/api/meetings/missing");
    const res = await GET_ONE(req, { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/meetings/[id]", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "owner" });
    prismaMock.activityLog.create.mockResolvedValue({ id: "al-1" });
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const req = createRequest("PATCH", "/api/meetings/m-1", { body: { title: "New title" } });
    const res = await PATCH(req, params);
    expect(res.status).toBe(401);
  });

  it.each([
    ["owner", 200],
    ["head_office", 200],
    ["admin", 200],
    ["member", 403],
    ["member", 403],
    ["staff", 403],
    ["marketing", 403],
  ])("role %s → %i", async (role, expected) => {
    mockSession({ id: "u1", name: "U", role: role as MockUserRole });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role });
    prismaMock.meeting.findUnique.mockResolvedValue({ id: "m-1", status: "in_progress", completedAt: null });
    prismaMock.meeting.update.mockResolvedValue({
      id: "m-1",
      title: "Updated",
      status: "in_progress",
      attendees: [],
      cascades: [],
    });

    const req = createRequest("PATCH", "/api/meetings/m-1", { body: { title: "Updated" } });
    const res = await PATCH(req, params);
    expect(res.status).toBe(expected);
  });

  it("returns 400 on invalid status value", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    const req = createRequest("PATCH", "/api/meetings/m-1", { body: { status: "banana" } });
    const res = await PATCH(req, params);
    expect(res.status).toBe(400);
  });

  it("returns 400 on out-of-range rating", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    const req = createRequest("PATCH", "/api/meetings/m-1", { body: { rating: 11 } });
    const res = await PATCH(req, params);
    expect(res.status).toBe(400);
  });

  it("returns 404 when meeting not found", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.meeting.findUnique.mockResolvedValue(null);

    const req = createRequest("PATCH", "/api/meetings/missing", { body: { title: "X" } });
    const res = await PATCH(req, { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("sets completedAt when status becomes completed", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.meeting.findUnique.mockResolvedValue({ id: "m-1", status: "in_progress", completedAt: null });
    prismaMock.meetingAttendee.findMany.mockResolvedValue([]);
    prismaMock.meeting.update.mockResolvedValue({
      id: "m-1",
      status: "completed",
      attendees: [],
      cascades: [],
    });

    const req = createRequest("PATCH", "/api/meetings/m-1", { body: { status: "completed" } });
    const res = await PATCH(req, params);
    expect(res.status).toBe(200);

    const call = prismaMock.meeting.update.mock.calls[0][0];
    expect(call.data.completedAt).toBeInstanceOf(Date);
    expect(call.data.status).toBe("completed");
  });

  it("writes cascade messages when completing with cascadeMessages text", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.meeting.findUnique.mockResolvedValue({ id: "m-1", status: "in_progress", completedAt: null });
    prismaMock.meetingAttendee.findMany.mockResolvedValue([]);
    prismaMock.meeting.update.mockResolvedValue({
      id: "m-1",
      status: "completed",
      attendees: [],
      cascades: [],
    });
    prismaMock.cascadeMessage.createMany.mockResolvedValue({ count: 2 });

    const req = createRequest("PATCH", "/api/meetings/m-1", {
      body: {
        status: "completed",
        cascadeMessages: "- Next week we ship\n* Also fix bug",
      },
    });
    await PATCH(req, params);

    expect(prismaMock.cascadeMessage.createMany).toHaveBeenCalled();
    const call = prismaMock.cascadeMessage.createMany.mock.calls[0][0];
    expect(call.data).toHaveLength(2);
    expect(call.data[0].message).toBe("Next week we ship");
    expect(call.data[1].message).toBe("Also fix bug");
  });

  it("computes average rating from attendee ratings on completion", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.meeting.findUnique.mockResolvedValue({ id: "m-1", status: "in_progress", completedAt: null });
    prismaMock.meetingAttendee.findMany.mockResolvedValue([
      { rating: 8 },
      { rating: 9 },
    ]);
    prismaMock.meeting.update.mockResolvedValue({
      id: "m-1",
      status: "completed",
      attendees: [],
      cascades: [],
    });

    const req = createRequest("PATCH", "/api/meetings/m-1", { body: { status: "completed" } });
    await PATCH(req, params);

    const call = prismaMock.meeting.update.mock.calls[0][0];
    expect(call.data.rating).toBe(8.5);
  });
});
