import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

// Mock service-scope (owner/admin get null scope = see all)
vi.mock("@/lib/service-scope", () => ({
  getServiceScope: vi.fn(() => null),
  getStateScope: vi.fn(() => null),
}));

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

// Import AFTER mocks are set up
import { GET, POST } from "@/app/api/timesheets/route";
import {
  GET as getTimesheet,
  PATCH,
} from "@/app/api/timesheets/[id]/route";
import { POST as submitTimesheet } from "@/app/api/timesheets/[id]/submit/route";
import { POST as approveTimesheet } from "@/app/api/timesheets/[id]/approve/route";

describe("GET /api/timesheets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();

    const req = createRequest("GET", "/api/timesheets");
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns timesheets list", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    const mockTimesheets = [
      {
        id: "ts-1",
        serviceId: "svc-1",
        weekEnding: new Date("2025-03-21"),
        status: "ts_draft",
        notes: null,
        deleted: false,
        service: { id: "svc-1", name: "Sunnyside", code: "SUN" },
        _count: { entries: 5 },
      },
      {
        id: "ts-2",
        serviceId: "svc-2",
        weekEnding: new Date("2025-03-14"),
        status: "submitted",
        notes: "Week 2",
        deleted: false,
        service: { id: "svc-2", name: "Riverside", code: "RIV" },
        _count: { entries: 3 },
      },
    ];

    prismaMock.timesheet.findMany.mockResolvedValue(mockTimesheets);

    const req = createRequest("GET", "/api/timesheets");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].id).toBe("ts-1");
    expect(body[1].service.name).toBe("Riverside");
  });
});

describe("POST /api/timesheets", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 400 (not 500) on malformed JSON body", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    // Use NextRequest directly — createRequest helper only sends JSON-stringified bodies.
    const req = new NextRequest("http://localhost:3000/api/timesheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 400 with missing required fields", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    const req = createRequest("POST", "/api/timesheets", {
      body: { notes: "some notes" },
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("creates timesheet with valid data", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    const createdTimesheet = {
      id: "ts-new",
      serviceId: "svc-1",
      weekEnding: new Date("2025-03-28"),
      status: "ts_draft",
      notes: null,
      deleted: false,
      service: { id: "svc-1", name: "Sunnyside", code: "SUN" },
      _count: { entries: 0 },
    };

    // No existing timesheet for this service+week
    prismaMock.timesheet.findUnique.mockResolvedValue(null);
    prismaMock.timesheet.create.mockResolvedValue(createdTimesheet);
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest("POST", "/api/timesheets", {
      body: {
        serviceId: "svc-1",
        weekEnding: "2025-03-28",
      },
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("ts-new");
    expect(body.service.name).toBe("Sunnyside");
    expect(prismaMock.activityLog.create).toHaveBeenCalledOnce();
  });
});

describe("PATCH /api/timesheets/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 404 for unknown timesheet", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    prismaMock.timesheet.findUnique.mockResolvedValue(null);

    const req = createRequest("PATCH", "/api/timesheets/nonexistent", {
      body: { notes: "updated" },
    });
    const context = { params: Promise.resolve({ id: "nonexistent" }) };
    const res = await PATCH(req, context as any);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Timesheet not found");
  });

  it("updates timesheet successfully", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    const existingTimesheet = {
      id: "ts-1",
      serviceId: "svc-1",
      weekEnding: new Date("2025-03-21"),
      status: "ts_draft",
      notes: null,
      deleted: false,
    };

    const updatedTimesheet = {
      ...existingTimesheet,
      notes: "Updated notes",
      service: { id: "svc-1", name: "Sunnyside", code: "SUN" },
      _count: { entries: 5 },
    };

    prismaMock.timesheet.findUnique.mockResolvedValue(existingTimesheet);
    prismaMock.timesheet.update.mockResolvedValue(updatedTimesheet);

    const req = createRequest("PATCH", "/api/timesheets/ts-1", {
      body: { notes: "Updated notes" },
    });
    const context = { params: Promise.resolve({ id: "ts-1" }) };
    const res = await PATCH(req, context as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notes).toBe("Updated notes");
  });
});

// ---------------------------------------------------------------------------
// POST /api/timesheets/[id]/submit — notifies coordinators
// ---------------------------------------------------------------------------

describe("POST /api/timesheets/[id]/submit", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("creates a TIMESHEET_SUBMITTED notification for each coordinator", async () => {
    mockSession({
      id: "user-1",
      name: "Daniel",
      role: "staff",
      serviceId: "svc-1",
    });

    prismaMock.timesheet.findUnique.mockResolvedValue({
      id: "ts-1",
      serviceId: "svc-1",
      weekEnding: new Date("2026-04-18"),
      status: "ts_draft",
      submittedById: null,
      deleted: false,
    });
    prismaMock.timesheet.update.mockResolvedValue({
      id: "ts-1",
      serviceId: "svc-1",
      weekEnding: new Date("2026-04-18"),
      status: "submitted",
      submittedAt: new Date(),
      submittedById: "user-1",
      service: { id: "svc-1", name: "Svc", code: "SVC1" },
      _count: { entries: 3 },
    });
    prismaMock.activityLog.create.mockResolvedValue({});
    prismaMock.user.findMany.mockResolvedValue([{ id: "coord-1" }]);
    prismaMock.userNotification.create.mockResolvedValue({});

    const req = createRequest("POST", "/api/timesheets/ts-1/submit");
    const res = await submitTimesheet(req, {
      params: Promise.resolve({ id: "ts-1" }),
    } as any);

    expect(res.status).toBe(200);
    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: "coordinator",
          serviceId: "svc-1",
          active: true,
        }),
      }),
    );
    expect(prismaMock.userNotification.create).toHaveBeenCalledTimes(1);
    const args = prismaMock.userNotification.create.mock.calls[0][0];
    expect(args.data.userId).toBe("coord-1");
    expect(args.data.type).toBe("timesheet_submitted");
    expect(args.data.title).toContain("Daniel");
    expect(args.data.link).toBe("/timesheets?id=ts-1");
  });
});

// ---------------------------------------------------------------------------
// POST /api/timesheets/[id]/approve — notifies the submitter
// ---------------------------------------------------------------------------

describe("POST /api/timesheets/[id]/approve", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("creates a TIMESHEET_APPROVED notification for the submitter", async () => {
    mockSession({ id: "approver-1", name: "Manager", role: "owner" });

    prismaMock.timesheet.findUnique.mockResolvedValue({
      id: "ts-1",
      serviceId: "svc-1",
      weekEnding: new Date("2026-04-18"),
      status: "submitted",
      submittedById: "staff-99",
      deleted: false,
    });
    prismaMock.timesheet.update.mockResolvedValue({
      id: "ts-1",
      serviceId: "svc-1",
      weekEnding: new Date("2026-04-18"),
      status: "approved",
      approvedAt: new Date(),
      approvedById: "approver-1",
      service: { id: "svc-1", name: "Svc", code: "SVC1" },
      _count: { entries: 3 },
    });
    prismaMock.activityLog.create.mockResolvedValue({});
    prismaMock.userNotification.create.mockResolvedValue({});

    const req = createRequest("POST", "/api/timesheets/ts-1/approve");
    const res = await approveTimesheet(req, {
      params: Promise.resolve({ id: "ts-1" }),
    } as any);

    expect(res.status).toBe(200);
    expect(prismaMock.userNotification.create).toHaveBeenCalledTimes(1);
    const args = prismaMock.userNotification.create.mock.calls[0][0];
    expect(args.data.userId).toBe("staff-99");
    expect(args.data.type).toBe("timesheet_approved");
    expect(args.data.title).toBe("Timesheet approved");
    expect(args.data.link).toBe("/timesheets?id=ts-1");
  });

  it("still approves when notification creation fails", async () => {
    mockSession({ id: "approver-1", name: "Manager", role: "owner" });

    prismaMock.timesheet.findUnique.mockResolvedValue({
      id: "ts-1",
      serviceId: "svc-1",
      weekEnding: new Date("2026-04-18"),
      status: "submitted",
      submittedById: "staff-99",
      deleted: false,
    });
    prismaMock.timesheet.update.mockResolvedValue({
      id: "ts-1",
      serviceId: "svc-1",
      weekEnding: new Date("2026-04-18"),
      status: "approved",
      approvedAt: new Date(),
      approvedById: "approver-1",
      service: { id: "svc-1", name: "Svc", code: "SVC1" },
      _count: { entries: 3 },
    });
    prismaMock.activityLog.create.mockResolvedValue({});
    prismaMock.userNotification.create.mockRejectedValue(new Error("DB exploded"));

    const req = createRequest("POST", "/api/timesheets/ts-1/approve");
    const res = await approveTimesheet(req, {
      params: Promise.resolve({ id: "ts-1" }),
    } as any);

    // Core approval must still succeed.
    expect(res.status).toBe(200);
  });
});
