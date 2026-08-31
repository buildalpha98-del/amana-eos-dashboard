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
    ["marketing", 201],
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
    ["staff", 403],
    // 2026-08-31: marketing can PATCH now — they've been able to CREATE
    // meetings since 2026-06-03 but couldn't save progress on them.
    ["marketing", 200],
  ])("role %s → %i", async (role, expected) => {
    mockSession({ id: "u1", name: "U", role: role as MockUserRole });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role });
    prismaMock.meeting.findUnique.mockResolvedValue({
      id: "m-1", status: "in_progress", completedAt: null,
      outcomes: null, rating: null, serviceIds: [],
      startedAt: new Date(), createdAt: new Date(),
    });
    prismaMock.todo.count.mockResolvedValue(0);
    prismaMock.issue.findMany.mockResolvedValue([]);
    prismaMock.rock.findMany.mockResolvedValue([]);
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
    prismaMock.meeting.findUnique.mockResolvedValue({
      id: "m-1", status: "in_progress", completedAt: null,
      outcomes: null, rating: null, serviceIds: [],
      startedAt: new Date(), createdAt: new Date(),
    });
    prismaMock.todo.count.mockResolvedValue(0);
    prismaMock.issue.findMany.mockResolvedValue([]);
    prismaMock.rock.findMany.mockResolvedValue([]);
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
    prismaMock.user.findMany.mockResolvedValue([{ id: "u2" }]);
    prismaMock.userNotification.createMany.mockResolvedValue({ count: 1 });
    prismaMock.meeting.findUnique.mockResolvedValue({
      id: "m-1", status: "in_progress", completedAt: null,
      outcomes: null, rating: null, serviceIds: [],
      startedAt: new Date(), createdAt: new Date(),
    });
    prismaMock.todo.count.mockResolvedValue(0);
    prismaMock.issue.findMany.mockResolvedValue([]);
    prismaMock.rock.findMany.mockResolvedValue([]);
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

    // 2026-08-31: ONE cascade_published notification batch per publish,
    // to every active user except the completer.
    const notif = prismaMock.userNotification.createMany.mock.calls[0][0] as {
      data: Array<{ userId: string; type: string }>;
    };
    expect(notif.data.map((n) => n.userId)).toEqual(["u2"]);
    expect(notif.data[0].type).toBe("cascade_published");
  });

  it("computes average rating from attendee ratings on completion", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.meeting.findUnique.mockResolvedValue({
      id: "m-1", status: "in_progress", completedAt: null,
      outcomes: null, rating: null, serviceIds: [],
      startedAt: new Date(), createdAt: new Date(),
    });
    prismaMock.todo.count.mockResolvedValue(0);
    prismaMock.issue.findMany.mockResolvedValue([]);
    prismaMock.rock.findMany.mockResolvedValue([]);
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

describe("POST /api/meetings — scheduling (2026-08-31)", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "owner" });
    prismaMock.activityLog.create.mockResolvedValue({});
  });

  it("scheduledFor creates a scheduled meeting with date = scheduledFor and no startedAt", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    const future = new Date(Date.now() + 3 * 86400000).toISOString();
    prismaMock.meeting.create.mockResolvedValue({
      id: "m-9", title: "Next L10", status: "scheduled", attendees: [],
    });

    const req = createRequest("POST", "/api/meetings", {
      body: { title: "Next L10", date: new Date().toISOString(), scheduledFor: future },
    });
    const res = await CREATE(req);
    expect(res.status).toBe(201);

    const arg = prismaMock.meeting.create.mock.calls[0][0] as {
      data: { status: string; startedAt: Date | null; date: Date };
    };
    expect(arg.data.status).toBe("scheduled");
    expect(arg.data.startedAt).toBeNull();
    expect(arg.data.date.toISOString()).toBe(future);
  });

  it("rejects a past scheduledFor", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    const req = createRequest("POST", "/api/meetings", {
      body: {
        title: "Old",
        date: new Date().toISOString(),
        scheduledFor: new Date(Date.now() - 2 * 86400000).toISOString(),
      },
    });
    const res = await CREATE(req);
    expect(res.status).toBe(400);
  });

  it("without scheduledFor keeps the start-now behaviour", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.meeting.create.mockResolvedValue({
      id: "m-10", title: "Now", status: "in_progress", attendees: [],
    });

    const req = createRequest("POST", "/api/meetings", {
      body: { title: "Now", date: new Date().toISOString() },
    });
    const res = await CREATE(req);
    expect(res.status).toBe(201);

    const arg = prismaMock.meeting.create.mock.calls[0][0] as {
      data: { status: string; startedAt: Date | null };
    };
    expect(arg.data.status).toBe("in_progress");
    expect(arg.data.startedAt).toBeInstanceOf(Date);
  });
});

describe("PATCH /api/meetings/[id] — action: start (2026-08-31)", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "admin" });
    prismaMock.activityLog.create.mockResolvedValue({});
  });

  it("starts a scheduled meeting via a status-guarded updateMany", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin" });
    prismaMock.meeting.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.meeting.findUnique.mockResolvedValue({
      id: "m-1", title: "L10", status: "in_progress", attendees: [], cascades: [],
    });

    const req = createRequest("PATCH", "/api/meetings/m-1", {
      body: { action: "start" },
    });
    const res = await PATCH(req, params);
    expect(res.status).toBe(200);

    expect(prismaMock.meeting.updateMany).toHaveBeenCalledWith({
      where: { id: "m-1", status: "scheduled" },
      data: { status: "in_progress", startedAt: expect.any(Date) },
    });
  });

  it("409s when the meeting is already started", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin" });
    prismaMock.meeting.updateMany.mockResolvedValue({ count: 0 });

    const req = createRequest("PATCH", "/api/meetings/m-1", {
      body: { action: "start" },
    });
    const res = await PATCH(req, params);
    expect(res.status).toBe(409);
  });

  it("allows marketing to start (they can create meetings)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u5", active: true, role: "marketing" });
    mockSession({ id: "u5", name: "Marketer", role: "marketing" });
    prismaMock.meeting.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.meeting.findUnique.mockResolvedValue({
      id: "m-1", title: "Marketing L10", status: "in_progress", attendees: [], cascades: [],
    });

    const req = createRequest("PATCH", "/api/meetings/m-1", {
      body: { action: "start" },
    });
    const res = await PATCH(req, params);
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/meetings/[id] — outcome snapshot (2026-08-31)", () => {
  const baseMeeting = {
    id: "m-1",
    status: "in_progress",
    completedAt: null,
    outcomes: null,
    rating: null,
    startedAt: new Date("2026-08-31T09:00:00Z"),
    createdAt: new Date("2026-08-31T08:55:00Z"),
    serviceIds: [] as string[],
  };

  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "owner" });
    prismaMock.activityLog.create.mockResolvedValue({});
    prismaMock.meetingAttendee.findMany.mockImplementation(
      (args: { where?: { rating?: unknown } }) =>
        Promise.resolve(
          args?.where && "rating" in (args.where ?? {})
            ? [{ userId: "u1", rating: 8 }, { userId: "u2", rating: 6 }]
            : [{ userId: "u1" }, { userId: "u2" }],
        ),
    );
    // Input-based routing: completed-in-window vs still-open counts.
    prismaMock.todo.count.mockImplementation(
      (args: { where?: { status?: unknown } }) =>
        Promise.resolve(args?.where?.status === "complete" ? 3 : 1),
    );
    prismaMock.issue.findMany.mockResolvedValue([{ id: "i-1" }, { id: "i-2" }]);
    prismaMock.rock.findMany.mockResolvedValue([
      { status: "on_track" },
      { status: "off_track" },
      { status: "complete" },
    ]);
    prismaMock.meeting.update.mockResolvedValue({
      id: "m-1", status: "completed", attendees: [], cascades: [],
    });
  });

  it("writes the snapshot once on completion", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.meeting.findUnique.mockResolvedValue({ ...baseMeeting });

    const req = createRequest("PATCH", "/api/meetings/m-1", {
      body: { status: "completed" },
    });
    const res = await PATCH(req, params);
    expect(res.status).toBe(200);

    const updateArg = prismaMock.meeting.update.mock.calls[0][0] as {
      data: { outcomes?: Record<string, unknown> };
    };
    const outcomes = updateArg.data.outcomes!;
    expect(outcomes).toBeDefined();
    expect(outcomes.todosCompleted).toBe(3);
    expect(outcomes.todosTotal).toBe(4);
    expect(outcomes.completionPct).toBe(75);
    expect(outcomes.issuesSolvedIds).toEqual(["i-1", "i-2"]);
    expect(outcomes.rocksOnTrack).toBe(2);
    expect(outcomes.rocksTotal).toBe(3);
    expect(outcomes.avgRating).toBe(7);
    expect(typeof outcomes.capturedAt).toBe("string");
  });

  it("does not overwrite an existing snapshot on re-completion", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.meeting.findUnique.mockResolvedValue({
      ...baseMeeting,
      status: "in_progress", // re-opened then re-completed
      outcomes: { todosCompleted: 99, capturedAt: "2026-08-24T00:00:00Z" },
    });

    const req = createRequest("PATCH", "/api/meetings/m-1", {
      body: { status: "completed" },
    });
    const res = await PATCH(req, params);
    expect(res.status).toBe(200);

    const updateArg = prismaMock.meeting.update.mock.calls[0][0] as {
      data: { outcomes?: unknown };
    };
    expect(updateArg.data.outcomes).toBeUndefined();
  });
});
