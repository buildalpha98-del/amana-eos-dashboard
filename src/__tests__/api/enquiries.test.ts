import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

// Mock service-scope
vi.mock("@/lib/service-scope", () => ({
  getServiceScope: vi.fn(() => null),
  getStateScope: vi.fn(() => null),
}));

import { GET, POST } from "@/app/api/enquiries/route";

describe("GET /api/enquiries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("GET", "/api/enquiries");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for unauthorized roles", async () => {
    mockSession({ id: "user-1", name: "Staff", role: "staff" });
    const req = createRequest("GET", "/api/enquiries");
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns paginated enquiries for admin", async () => {
    mockSession({ id: "user-1", name: "Admin", role: "admin" });

    const mockEnquiries = [
      {
        id: "e1",
        parentName: "John Doe",
        parentEmail: "john@test.com",
        childName: "Jane",
        stage: "new",
        serviceId: "svc-1",
        service: { id: "svc-1", name: "Centre A", code: "CA" },
        assignee: null,
      },
    ];

    prismaMock.parentEnquiry.findMany.mockResolvedValue(mockEnquiries);
    prismaMock.parentEnquiry.count.mockResolvedValue(1);

    const req = createRequest("GET", "/api/enquiries");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enquiries).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.totalPages).toBe(1);
  });

  it("filters by stage", async () => {
    mockSession({ id: "user-1", name: "Admin", role: "admin" });
    prismaMock.parentEnquiry.findMany.mockResolvedValue([]);
    prismaMock.parentEnquiry.count.mockResolvedValue(0);

    const req = createRequest("GET", "/api/enquiries?stage=info_sent");
    await GET(req);

    const callArgs = prismaMock.parentEnquiry.findMany.mock.calls[0][0];
    expect(callArgs.where.stage).toBe("info_sent");
  });

  it("filters by serviceId", async () => {
    mockSession({ id: "user-1", name: "Admin", role: "admin" });
    prismaMock.parentEnquiry.findMany.mockResolvedValue([]);
    prismaMock.parentEnquiry.count.mockResolvedValue(0);

    const req = createRequest("GET", "/api/enquiries?serviceId=svc-1");
    await GET(req);

    const callArgs = prismaMock.parentEnquiry.findMany.mock.calls[0][0];
    expect(callArgs.where.serviceId).toBe("svc-1");
  });

  it("respects pagination params", async () => {
    mockSession({ id: "user-1", name: "Admin", role: "admin" });
    prismaMock.parentEnquiry.findMany.mockResolvedValue([]);
    prismaMock.parentEnquiry.count.mockResolvedValue(150);

    const req = createRequest("GET", "/api/enquiries?page=3&limit=20");
    const res = await GET(req);
    const body = await res.json();
    expect(body.page).toBe(3);
    expect(body.limit).toBe(20);
    expect(body.totalPages).toBe(8);

    const callArgs = prismaMock.parentEnquiry.findMany.mock.calls[0][0];
    expect(callArgs.skip).toBe(40);
    expect(callArgs.take).toBe(20);
  });

  it("supports search filter", async () => {
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    prismaMock.parentEnquiry.findMany.mockResolvedValue([]);
    prismaMock.parentEnquiry.count.mockResolvedValue(0);

    const req = createRequest("GET", "/api/enquiries?search=john");
    await GET(req);

    const callArgs = prismaMock.parentEnquiry.findMany.mock.calls[0][0];
    expect(callArgs.where.OR).toBeDefined();
    expect(callArgs.where.OR).toHaveLength(4);
  });
});

describe("POST /api/enquiries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("POST", "/api/enquiries", {
      body: { serviceId: "svc-1", parentName: "Test", channel: "phone" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for unauthorized roles", async () => {
    mockSession({ id: "user-1", name: "Member", role: "member" });
    const req = createRequest("POST", "/api/enquiries", {
      body: { serviceId: "svc-1", parentName: "Test", channel: "phone" },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 when required fields are missing", async () => {
    mockSession({ id: "user-1", name: "Admin", role: "admin" });
    const req = createRequest("POST", "/api/enquiries", {
      body: { parentName: "Test" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when parentName is missing", async () => {
    mockSession({ id: "user-1", name: "Admin", role: "admin" });
    const req = createRequest("POST", "/api/enquiries", {
      body: { serviceId: "svc-1", channel: "phone" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 400 for invalid channel", async () => {
    mockSession({ id: "user-1", name: "Admin", role: "admin" });
    const req = createRequest("POST", "/api/enquiries", {
      body: { serviceId: "svc-1", parentName: "Test", channel: "invalid" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("creates enquiry with valid data", async () => {
    mockSession({ id: "user-1", name: "Admin", role: "admin" });
    const createdEnquiry = {
      id: "e-new",
      parentName: "Jane Doe",
      parentEmail: "jane@test.com",
      childName: "Jimmy",
      channel: "email",
      stage: "new",
      serviceId: "svc-1",
      service: { id: "svc-1", name: "Centre A", code: "CA" },
    };
    prismaMock.parentEnquiry.create.mockResolvedValue(createdEnquiry);

    const req = createRequest("POST", "/api/enquiries", {
      body: {
        serviceId: "svc-1",
        parentName: "Jane Doe",
        parentEmail: "jane@test.com",
        childName: "Jimmy",
        channel: "email",
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.parentName).toBe("Jane Doe");
    expect(body.service.code).toBe("CA");
  });
});
