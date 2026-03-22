import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

// Mock service-scope
vi.mock("@/lib/service-scope", () => ({
  getServiceScope: vi.fn(() => null),
  getStateScope: vi.fn(() => null),
}));

// Mock centre-scope
vi.mock("@/lib/centre-scope", () => ({
  getCentreScope: vi.fn(() => ({ serviceIds: null })),
  applyCentreFilter: vi.fn(),
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
import { GET, POST } from "@/app/api/incidents/route";

describe("GET /api/incidents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();

    const req = createRequest("GET", "/api/incidents");
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns incidents list", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    const mockRecords = [
      {
        id: "inc-1",
        serviceId: "svc-1",
        incidentDate: new Date("2025-03-20"),
        childName: "Alice",
        incidentType: "injury",
        severity: "minor",
        description: "Scraped knee on playground",
        deleted: false,
        reportableToAuthority: false,
        followUpRequired: false,
        followUpCompleted: false,
        service: { id: "svc-1", name: "Sunnyside", code: "SUN" },
        createdBy: { id: "user-1", name: "Test" },
      },
      {
        id: "inc-2",
        serviceId: "svc-2",
        incidentDate: new Date("2025-03-19"),
        childName: "Bob",
        incidentType: "behaviour",
        severity: "moderate",
        description: "Aggressive behaviour toward peer",
        deleted: false,
        reportableToAuthority: false,
        followUpRequired: true,
        followUpCompleted: false,
        service: { id: "svc-2", name: "Riverside", code: "RIV" },
        createdBy: { id: "user-1", name: "Test" },
      },
    ];

    prismaMock.incidentRecord.findMany.mockResolvedValue(mockRecords);

    const req = createRequest("GET", "/api/incidents");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.incidents).toHaveLength(2);
    expect(body.count).toBe(2);
    expect(body.incidents[0].incidentType).toBe("injury");
  });

  it("returns summary stats when ?summary=true", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    const mockRecords = [
      {
        id: "inc-1",
        incidentType: "injury",
        severity: "minor",
        location: "playground",
        reportableToAuthority: true,
        followUpRequired: true,
        followUpCompleted: false,
        service: { id: "svc-1", name: "Sunnyside" },
      },
      {
        id: "inc-2",
        incidentType: "injury",
        severity: "major",
        location: "classroom",
        reportableToAuthority: false,
        followUpRequired: false,
        followUpCompleted: false,
        service: { id: "svc-1", name: "Sunnyside" },
      },
      {
        id: "inc-3",
        incidentType: "behaviour",
        severity: "minor",
        location: "playground",
        reportableToAuthority: false,
        followUpRequired: true,
        followUpCompleted: true,
        service: { id: "svc-2", name: "Riverside" },
      },
    ];

    prismaMock.incidentRecord.findMany.mockResolvedValue(mockRecords);

    const req = createRequest("GET", "/api/incidents?summary=true");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(3);
    expect(body.reportable).toBe(1);
    expect(body.followUpPending).toBe(1);
    expect(body.byType).toEqual({ injury: 2, behaviour: 1 });
    expect(body.bySeverity).toEqual({ minor: 2, major: 1 });
    expect(body.byCentre).toEqual({ Sunnyside: 2, Riverside: 1 });
    expect(body.byLocation).toEqual({ playground: 2, classroom: 1 });
  });
});

describe("POST /api/incidents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 400 with missing required fields", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    const req = createRequest("POST", "/api/incidents", {
      body: { childName: "Alice" },
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details).toBeTruthy();
  });

  it("creates incident with valid data", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    const createdRecord = {
      id: "inc-new",
      serviceId: "svc-1",
      incidentDate: new Date("2025-03-21"),
      childName: "Alice",
      incidentType: "injury",
      severity: "minor",
      description: "Fell during outdoor play",
      parentNotified: true,
      reportableToAuthority: false,
      followUpRequired: false,
      createdById: "user-1",
      service: { id: "svc-1", name: "Sunnyside" },
    };

    prismaMock.incidentRecord.create.mockResolvedValue(createdRecord);

    const req = createRequest("POST", "/api/incidents", {
      body: {
        serviceId: "svc-1",
        incidentDate: "2025-03-21",
        childName: "Alice",
        incidentType: "injury",
        severity: "minor",
        description: "Fell during outdoor play",
        parentNotified: true,
      },
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("inc-new");
    expect(body.service.name).toBe("Sunnyside");
    expect(prismaMock.incidentRecord.create).toHaveBeenCalledOnce();
  });
});
