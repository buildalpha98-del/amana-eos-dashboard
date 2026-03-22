import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

// Mock logger + rate limit
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "test-req-id",
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })),
}));

// Mock audit-log
vi.mock("@/lib/audit-log", () => ({
  logAuditEvent: vi.fn(),
}));

import { GET as GET_LIST, POST } from "@/app/api/marketing/campaigns/route";
import { GET as GET_ONE, PATCH, DELETE } from "@/app/api/marketing/campaigns/[id]/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

function setupActiveUserMock() {
  prismaMock.user.findUnique.mockReset();
  prismaMock.user.findUnique.mockImplementation(async (args: any) => {
    if (args?.where?.id === "user-1") return { active: true, id: "user-1", role: "owner" };
    return null;
  });
}

describe("GET /api/marketing/campaigns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    setupActiveUserMock();
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("GET", "/api/marketing/campaigns");
    const res = await GET_LIST(req);
    expect(res.status).toBe(401);
  });

  it("returns campaigns list for authenticated user", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    const mockCampaigns = [
      { id: "c1", name: "Summer Campaign", type: "campaign", status: "draft", deleted: false, _count: { posts: 2, comments: 1 }, services: [] },
      { id: "c2", name: "Winter Promo", type: "promotion", status: "active", deleted: false, _count: { posts: 0, comments: 0 }, services: [] },
    ];
    prismaMock.marketingCampaign.findMany.mockResolvedValue(mockCampaigns);

    const req = createRequest("GET", "/api/marketing/campaigns");
    const res = await GET_LIST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].name).toBe("Summer Campaign");
    expect(body[1].name).toBe("Winter Promo");
  });
});

describe("POST /api/marketing/campaigns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    setupActiveUserMock();
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("POST", "/api/marketing/campaigns", {
      body: { name: "Test Campaign" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 with missing required fields (name)", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    const req = createRequest("POST", "/api/marketing/campaigns", {
      body: { type: "campaign" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 201 with valid campaign data", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });

    const createdCampaign = {
      id: "camp-1",
      name: "Launch Event",
      type: "event",
      status: "draft",
      startDate: null,
      endDate: null,
      platforms: [],
      goal: null,
      notes: null,
      designLink: null,
      budget: null,
      location: null,
      deliverables: null,
      deleted: false,
      createdAt: new Date(),
    };
    prismaMock.marketingCampaign.create.mockResolvedValue(createdCampaign);

    const fullCampaign = {
      ...createdCampaign,
      _count: { posts: 0, comments: 0 },
      services: [],
    };
    prismaMock.marketingCampaign.findUnique.mockResolvedValue(fullCampaign);
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest("POST", "/api/marketing/campaigns", {
      body: { name: "Launch Event", type: "event" },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("Launch Event");
    expect(body.type).toBe("event");
  });
});

describe("PATCH /api/marketing/campaigns/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    setupActiveUserMock();
  });

  it("returns 404 for unknown campaign ID", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    prismaMock.marketingCampaign.findUnique.mockResolvedValue(null);

    const req = createRequest("PATCH", "/api/marketing/campaigns/unknown-id", {
      body: { name: "Updated" },
    });
    const context = { params: Promise.resolve({ id: "unknown-id" }) };
    const res = await PATCH(req, context);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });

  it("updates campaign successfully", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });

    const existingCampaign = {
      id: "camp-1",
      name: "Old Name",
      type: "campaign",
      status: "draft",
      deleted: false,
    };
    // First findUnique is the existing check
    prismaMock.marketingCampaign.findUnique.mockResolvedValueOnce(existingCampaign);

    const updatedCampaign = {
      ...existingCampaign,
      name: "New Name",
    };
    prismaMock.marketingCampaign.update.mockResolvedValue(updatedCampaign);

    const fullCampaign = {
      ...updatedCampaign,
      _count: { posts: 0, comments: 0 },
      services: [],
    };
    // Second findUnique is the re-fetch with includes
    prismaMock.marketingCampaign.findUnique.mockResolvedValueOnce(fullCampaign);
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest("PATCH", "/api/marketing/campaigns/camp-1", {
      body: { name: "New Name" },
    });
    const context = { params: Promise.resolve({ id: "camp-1" }) };
    const res = await PATCH(req, context);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("New Name");
  });
});

describe("DELETE /api/marketing/campaigns/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    setupActiveUserMock();
  });

  it("returns 200 on successful deletion", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });

    const existingCampaign = {
      id: "camp-1",
      name: "To Delete",
      deleted: false,
    };
    prismaMock.marketingCampaign.findUnique.mockResolvedValue(existingCampaign);
    prismaMock.marketingCampaign.update.mockResolvedValue({ ...existingCampaign, deleted: true });
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest("DELETE", "/api/marketing/campaigns/camp-1");
    const context = { params: Promise.resolve({ id: "camp-1" }) };
    const res = await DELETE(req, context);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
