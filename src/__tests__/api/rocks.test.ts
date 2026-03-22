import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

// Mock service-scope (owner/admin get null scope = see all)
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

  it("returns 403 when member tries to create", async () => {
    mockSession({ id: "user-2", name: "Member", role: "member" });

    const req = createRequest("POST", "/api/rocks", {
      body: { title: "Test Rock", ownerId: "user-2", quarter: "Q1-2025" },
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
