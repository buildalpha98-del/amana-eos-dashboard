import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

// Mock service-scope. Default = null (owner/admin see all). Individual tests
// can override via `.mockReturnValueOnce("svc1")` to simulate the 4b-widened
// helper for coordinator/marketing and confirm the rocks inline override
// still collapses scope back to null.
vi.mock("@/lib/service-scope", () => ({
  getServiceScope: vi.fn(() => null),
  getStateScope: vi.fn(() => null),
}));

// Mock teams-notify (fire-and-forget, don't actually notify)
vi.mock("@/lib/teams-notify", () => ({
  notifyNewRock: vi.fn(() => Promise.resolve()),
}));

// Import AFTER mocks are set up
import { GET, POST } from "@/app/api/rocks/route";
import { getServiceScope } from "@/lib/service-scope";

describe("GET /api/rocks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // withApiAuth checks user is active in DB
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();

    const req = createRequest("GET", "/api/rocks");
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns rocks for authenticated user", async () => {
    mockSession({ id: "user-1", name: "Test User", role: "owner" });

    const mockRocks = [
      {
        id: "rock-1",
        title: "Launch new centres",
        quarter: "Q1-2025",
        status: "on_track",
        priority: "high",
        ownerId: "user-1",
        owner: { id: "user-1", name: "Test User", email: "test@test.com", avatar: null },
        oneYearGoal: null,
        _count: { todos: 3, issues: 1, milestones: 2 },
      },
    ];

    prismaMock.rock.findMany.mockResolvedValue(mockRocks);

    const req = createRequest("GET", "/api/rocks?quarter=Q1-2025");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("Launch new centres");
  });

  it("filters by quarter when provided", async () => {
    mockSession({ id: "user-1", name: "Test User", role: "owner" });
    prismaMock.rock.findMany.mockResolvedValue([]);

    const req = createRequest("GET", "/api/rocks?quarter=Q2-2025");
    await GET(req);

    // Verify the where clause includes the quarter filter
    const callArgs = prismaMock.rock.findMany.mock.calls[0][0];
    expect(callArgs.where.quarter).toBe("Q2-2025");
    expect(callArgs.where.deleted).toBe(false);
  });
});

describe("POST /api/rocks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();

    const req = createRequest("POST", "/api/rocks", {
      body: { title: "Test Rock", ownerId: "user-1", quarter: "Q1-2025" },
    });
    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  // 2026-04-30: opened POST /api/rocks to coordinator + member so service-
  // level users (Director of Service) can create rocks from inside their
  // /services/[id] EOS tab. The previous 403-on-member test is now stale.
  it("allows member (Director of Service) to create — was previously 403", async () => {
    mockSession({ id: "user-2", name: "Member", role: "member", serviceId: "svc-1" });
    prismaMock.rock.create.mockResolvedValue({
      id: "rock-2",
      title: "Service Rock",
      ownerId: "user-2",
      serviceId: "svc-1",
    } as never);

    const req = createRequest("POST", "/api/rocks", {
      body: { title: "Service Rock", ownerId: "user-2", quarter: "Q1-2025", serviceId: "svc-1" },
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
  });

  it("returns 403 when marketing tries to create (no rock surface for marketing)", async () => {
    mockSession({ id: "user-3", name: "Marketing", role: "marketing" });

    const req = createRequest("POST", "/api/rocks", {
      body: { title: "Test Rock", ownerId: "user-3", quarter: "Q1-2025" },
    });
    const res = await POST(req);

    expect(res.status).toBe(403);
  });

  it("returns 400 when title is missing", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });

    const req = createRequest("POST", "/api/rocks", {
      body: { ownerId: "user-1", quarter: "Q1-2025" },
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("creates rock with valid data", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });

    const createdRock = {
      id: "rock-new",
      title: "New Rock",
      description: null,
      ownerId: "user-1",
      quarter: "Q1-2025",
      priority: "medium",
      rockType: "personal",
      owner: { id: "user-1", name: "Owner", email: "o@test.com", avatar: null },
      oneYearGoal: null,
      _count: { todos: 0, issues: 0, milestones: 0 },
    };

    prismaMock.rock.create.mockResolvedValue(createdRock);
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest("POST", "/api/rocks", {
      body: { title: "New Rock", ownerId: "user-1", quarter: "Q1-2025" },
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe("New Rock");

    // Verify activity log was created
    expect(prismaMock.activityLog.create).toHaveBeenCalledOnce();
  });
});

// ── 4b scope-widening regression: rocks is exempt (cross-service visibility) ──
describe("GET /api/rocks — 4b scope audit regression (exempt inline)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("coordinator sees cross-service rocks (inline override bypasses getServiceScope)", async () => {
    mockSession({
      id: "coord-1",
      name: "Coordinator",
      role: "member",
      serviceId: "svc1",
    });
    // Simulate the 4b-widened helper returning svc1. The rocks route must
    // still call `scope = null` via its inline override.
    vi.mocked(getServiceScope).mockReturnValue("svc1");

    prismaMock.rock.findMany.mockResolvedValue([]);

    const req = createRequest("GET", "/api/rocks");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const callArgs = prismaMock.rock.findMany.mock.calls[0][0];
    // No OR[{ serviceId }, { ownerId }] narrowing should be applied —
    // coordinator retains cross-service visibility for EOS rocks.
    expect(callArgs.where.OR).toBeUndefined();
    expect(callArgs.where.serviceId).toBeUndefined();
  });

  it("marketing sees cross-service rocks (inline override bypasses getServiceScope)", async () => {
    mockSession({
      id: "mkt-1",
      name: "Marketing",
      role: "marketing",
      serviceId: "svc1",
    });
    vi.mocked(getServiceScope).mockReturnValue("svc1");

    prismaMock.rock.findMany.mockResolvedValue([]);

    const req = createRequest("GET", "/api/rocks");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const callArgs = prismaMock.rock.findMany.mock.calls[0][0];
    expect(callArgs.where.OR).toBeUndefined();
    expect(callArgs.where.serviceId).toBeUndefined();
  });

  // 2026-04-30: post coordinator-collapse, the rocks route at
  // src/app/api/rocks/route.ts explicitly exempts BOTH member and marketing
  // from getServiceScope (`role === "member" || role === "marketing" → scope
  // = null`). Member retains the same cross-service visibility coordinator
  // had pre-collapse. The pre-collapse "member is NOT exempt — narrowing
  // still applies" assertion is obsolete and contradicts the current code;
  // the cross-service-visibility case is already covered by the
  // "coordinator sees cross-service rocks" test above (which uses
  // role="member"). Removed rather than rewritten — it would just be a
  // duplicate.
});
