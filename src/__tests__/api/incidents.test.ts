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

// Knox: the REAL triggerTriage runs; only its collaborators are faked, so the
// "must never throw" contract is exercised end to end.
vi.mock("@/lib/knox/enqueue", () => ({ enqueueTriage: vi.fn() }));
vi.mock("@/lib/knox/worker", () => ({ runTriageJob: vi.fn() }));
vi.mock("@/lib/run-after", () => ({ runAfter: vi.fn() }));

// Import AFTER mocks are set up
import { GET, POST } from "@/app/api/incidents/route";
import { PATCH } from "@/app/api/incidents/[id]/route";
import { _clearUserActiveCache } from "@/lib/server-auth";
import { enqueueTriage } from "@/lib/knox/enqueue";
import { runTriageJob } from "@/lib/knox/worker";
import { runAfter } from "@/lib/run-after";

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
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    vi.mocked(enqueueTriage).mockResolvedValue("job-1");
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

  it("lets an educator log an incident at their own centre (2026-10-08)", async () => {
    mockSession({ id: "edu", name: "Educator", role: "staff", serviceId: "svc-1" });
    prismaMock.incidentRecord.create.mockResolvedValue({ id: "inc-2", serviceId: "svc-1", service: { id: "svc-1", name: "S" } });
    const res = await POST(createRequest("POST", "/api/incidents", {
      body: { serviceId: "svc-1", incidentDate: "2026-10-08", childName: "Alice", incidentType: "injury", severity: "minor", description: "Fell", parentNotified: true },
    }));
    expect(res.status).toBe(201);
  });

  it("refuses logging into another centre", async () => {
    mockSession({ id: "edu", name: "Educator", role: "staff", serviceId: "svc-2" });
    const res = await POST(createRequest("POST", "/api/incidents", {
      body: { serviceId: "svc-1", incidentDate: "2026-10-08", childName: "Alice", incidentType: "injury", severity: "minor", description: "Fell", parentNotified: true },
    }));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/incidents — Knox trigger", () => {
  const body = {
    serviceId: "svc-1", incidentDate: "2026-10-20", childName: "Alice",
    incidentType: "injury", severity: "minor", description: "Fell", parentNotified: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.incidentRecord.create.mockResolvedValue({
      id: "inc-new", serviceId: "svc-1", service: { id: "svc-1", name: "S" },
    });
    vi.mocked(enqueueTriage).mockResolvedValue("job-1");
  });

  it("enqueues triage after the create and runs the job after the response", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    const res = await POST(createRequest("POST", "/api/incidents", { body }));

    expect(res.status).toBe(201);
    // Nothing runs until the response is out: the whole job sits in runAfter.
    expect(runAfter).toHaveBeenCalledOnce();
    expect(enqueueTriage).not.toHaveBeenCalled();
    const task = vi.mocked(runAfter).mock.calls[0][0];
    await task();
    expect(enqueueTriage).toHaveBeenCalledWith(
      expect.anything(),
      { subjectType: "incident", subjectId: "inc-new", serviceId: "svc-1", reason: "created" },
    );
    expect(runTriageJob).toHaveBeenCalledWith("job-1");
  });

  it("POST returns 201 even when enqueueTriage rejects", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });
    vi.mocked(enqueueTriage).mockRejectedValue(new Error("db down"));

    const res = await POST(createRequest("POST", "/api/incidents", { body }));

    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("inc-new");
    // The deferred task swallows the failure too and never starts a job.
    await vi.mocked(runAfter).mock.calls[0][0]();
    expect(runTriageJob).not.toHaveBeenCalled();
  });

  it("POST returns 201 even when enqueueTriage throws synchronously", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });
    vi.mocked(enqueueTriage).mockImplementation(() => {
      throw new Error("sync boom");
    });

    const res = await POST(createRequest("POST", "/api/incidents", { body }));

    expect(res.status).toBe(201);
    await expect(vi.mocked(runAfter).mock.calls[0][0]()).resolves.toBeUndefined();
  });

  it("POST returns 201 even when runAfter itself throws synchronously", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });
    vi.mocked(runAfter).mockImplementation(() => {
      throw new Error("no request scope");
    });

    const res = await POST(createRequest("POST", "/api/incidents", { body }));

    expect(res.status).toBe(201);
    vi.mocked(runAfter).mockReset();
  });
});

describe("PATCH /api/incidents/[id] — Knox trigger", () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
  const before = {
    id: "inc-1", serviceId: "svc-1", createdById: "user-1", deleted: false,
    severity: "minor", incidentType: "injury", reportableToAuthority: false,
    seriousIncidentCategory: null, ambulanceCalled: false, medicalPersonnelContacted: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.incidentRecord.findUnique.mockResolvedValue(before);
    prismaMock.incidentRecord.update.mockResolvedValue({ ...before });
    vi.mocked(enqueueTriage).mockResolvedValue("job-9");
  });

  it("a description-only patch does not trigger Knox", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    const res = await PATCH(
      createRequest("PATCH", "/api/incidents/inc-1", { body: { description: "More detail" } }),
      ctx("inc-1"),
    );

    expect(res.status).toBe(200);
    expect(prismaMock.incidentRecord.update).toHaveBeenCalledOnce();
    expect(runAfter).not.toHaveBeenCalled();
  });

  it("re-sending the same severity does not trigger Knox", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    await PATCH(
      createRequest("PATCH", "/api/incidents/inc-1", { body: { severity: "minor" } }),
      ctx("inc-1"),
    );

    expect(runAfter).not.toHaveBeenCalled();
  });

  it("a severity change enqueues an 'updated' triage and runs it immediately, after the write", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    const res = await PATCH(
      createRequest("PATCH", "/api/incidents/inc-1", { body: { severity: "serious" } }),
      ctx("inc-1"),
    );

    expect(res.status).toBe(200);
    expect(runAfter).toHaveBeenCalledOnce();
    await vi.mocked(runAfter).mock.calls[0][0]();
    expect(enqueueTriage).toHaveBeenCalledWith(
      expect.anything(),
      { subjectType: "incident", subjectId: "inc-1", serviceId: "svc-1", reason: "updated" },
    );
    expect(runTriageJob).toHaveBeenCalledWith("job-9");
    const updateOrder = prismaMock.incidentRecord.update.mock.invocationCallOrder[0];
    const runAfterOrder = vi.mocked(runAfter).mock.invocationCallOrder[0];
    expect(runAfterOrder).toBeGreaterThan(updateOrder);
  });

  it("a medical contact going from empty to set triggers Knox", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    await PATCH(
      createRequest("PATCH", "/api/incidents/inc-1", { body: { medicalPersonnelContacted: "Dr Lee" } }),
      ctx("inc-1"),
    );

    expect(runAfter).toHaveBeenCalledOnce();
  });

  it("a patch that fails validation does not trigger Knox", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    const res = await PATCH(
      createRequest("PATCH", "/api/incidents/inc-1", { body: { severity: "" } }),
      ctx("inc-1"),
    );

    expect(res.status).toBe(400);
    expect(runAfter).not.toHaveBeenCalled();
  });
});
