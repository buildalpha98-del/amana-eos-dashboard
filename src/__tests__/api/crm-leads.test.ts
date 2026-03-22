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

// Mock CRM modules
vi.mock("@/lib/crm/handle-lead-won", () => ({
  handleLeadWon: vi.fn(() => Promise.resolve({ serviceId: "svc-1" })),
}));
vi.mock("@/lib/crm/schedule-sequence", () => ({
  scheduleCrmSequence: vi.fn(() => Promise.resolve()),
}));

import { GET as GET_LIST, POST } from "@/app/api/crm/leads/route";
import { GET as GET_ONE, PUT, DELETE } from "@/app/api/crm/leads/[id]/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

function setupActiveUserMock() {
  prismaMock.user.findUnique.mockReset();
  prismaMock.user.findUnique.mockImplementation(async (args: any) => {
    if (args?.where?.id === "user-1") return { active: true, id: "user-1", role: "owner" };
    return null;
  });
}

describe("GET /api/crm/leads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    setupActiveUserMock();
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("GET", "/api/crm/leads");
    const res = await GET_LIST(req);
    expect(res.status).toBe(401);
  });

  it("returns leads list", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    const mockLeads = [
      { id: "l1", schoolName: "Sunrise Primary", pipelineStage: "new_lead", deleted: false, assignedTo: null, service: null, _count: { touchpoints: 0 } },
      { id: "l2", schoolName: "Greenfield School", pipelineStage: "contact_made", deleted: false, assignedTo: null, service: null, _count: { touchpoints: 3 } },
    ];
    prismaMock.lead.findMany.mockResolvedValue(mockLeads);

    const req = createRequest("GET", "/api/crm/leads");
    const res = await GET_LIST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].schoolName).toBe("Sunrise Primary");
  });
});

describe("POST /api/crm/leads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    setupActiveUserMock();
  });

  it("returns 400 with missing required fields", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    const req = createRequest("POST", "/api/crm/leads", {
      body: { contactName: "John" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 201 with valid lead data", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });

    const createdLead = {
      id: "lead-1",
      schoolName: "Sunshine Academy",
      contactName: "Jane Doe",
      contactEmail: "jane@school.com",
      contactPhone: null,
      source: "direct",
      pipelineStage: "new_lead",
      deleted: false,
      assignedTo: { id: "user-1", name: "Owner", email: "user-1@test.com", avatar: null },
      createdAt: new Date(),
    };
    prismaMock.lead.create.mockResolvedValue(createdLead);
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest("POST", "/api/crm/leads", {
      body: { schoolName: "Sunshine Academy", contactName: "Jane Doe", contactEmail: "jane@school.com" },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.schoolName).toBe("Sunshine Academy");
    expect(body.contactName).toBe("Jane Doe");
  });
});

describe("PUT /api/crm/leads/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    setupActiveUserMock();
  });

  it("returns 404 for unknown lead", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    prismaMock.lead.findUnique.mockResolvedValue(null);

    const req = createRequest("PUT", "/api/crm/leads/unknown-id", {
      body: { schoolName: "Updated School" },
    });
    const context = { params: Promise.resolve({ id: "unknown-id" }) };
    const res = await PUT(req, context);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });

  it("updates lead successfully", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });

    const existingLead = {
      id: "lead-1",
      schoolName: "Old School",
      pipelineStage: "new_lead",
      deleted: false,
    };
    prismaMock.lead.findUnique.mockResolvedValue(existingLead);

    const updatedLead = {
      id: "lead-1",
      schoolName: "Updated School",
      pipelineStage: "new_lead",
      deleted: false,
      assignedTo: { id: "user-1", name: "Owner", email: "user-1@test.com", avatar: null },
      service: null,
    };
    prismaMock.lead.update.mockResolvedValue(updatedLead);
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest("PUT", "/api/crm/leads/lead-1", {
      body: { schoolName: "Updated School" },
    });
    const context = { params: Promise.resolve({ id: "lead-1" }) };
    const res = await PUT(req, context);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.schoolName).toBe("Updated School");
  });
});

describe("DELETE /api/crm/leads/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    setupActiveUserMock();
  });

  it("returns 200 on deletion", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });

    const existingLead = {
      id: "lead-1",
      schoolName: "To Delete",
      deleted: false,
    };
    prismaMock.lead.findUnique.mockResolvedValue(existingLead);
    prismaMock.lead.update.mockResolvedValue({ ...existingLead, deleted: true });
    prismaMock.activityLog.create.mockResolvedValue({});

    const req = createRequest("DELETE", "/api/crm/leads/lead-1");
    const context = { params: Promise.resolve({ id: "lead-1" }) };
    const res = await DELETE(req, context);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
