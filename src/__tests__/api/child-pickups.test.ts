import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

// Mock rate-limit
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "test-req-id",
}));

// Mock storage
vi.mock("@/lib/storage/uploadFile", () => ({
  uploadFile: vi.fn().mockResolvedValue("https://blob.example.com/photo.jpg"),
  deleteFile: vi.fn().mockResolvedValue(undefined),
}));

import { GET, POST } from "@/app/api/children/[id]/authorised-pickups/route";
import { PATCH, DELETE } from "@/app/api/children/[id]/authorised-pickups/[pickupId]/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const routeCtx = (params: Record<string, string>) => ({
  params: Promise.resolve(params),
});

const samplePickup = {
  id: "pickup-1",
  childId: "child-1",
  name: "Jane Smith",
  relationship: "Grandmother",
  phone: "0400111222",
  photoUrl: null,
  photoId: null,
  isEmergencyContact: false,
  active: true,
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

/* ------------------------------------------------------------------ */
/*  GET /api/children/[id]/authorised-pickups                          */
/* ------------------------------------------------------------------ */

describe("GET /api/children/[id]/authorised-pickups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("GET", "/api/children/child-1/authorised-pickups");
    const res = await GET(req, routeCtx({ id: "child-1" }));
    expect(res.status).toBe(401);
  });

  it("returns 404 when child not found", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.child.findUnique.mockResolvedValue(null);

    const req = createRequest("GET", "/api/children/child-1/authorised-pickups");
    const res = await GET(req, routeCtx({ id: "child-1" }));
    expect(res.status).toBe(404);
  });

  it("returns 200 with active pickups", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.child.findUnique.mockResolvedValue({ id: "child-1" });
    prismaMock.authorisedPickup.findMany.mockResolvedValue([samplePickup]);

    const req = createRequest("GET", "/api/children/child-1/authorised-pickups");
    const res = await GET(req, routeCtx({ id: "child-1" }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.pickups).toHaveLength(1);
    expect(data.pickups[0].name).toBe("Jane Smith");
  });
});

/* ------------------------------------------------------------------ */
/*  POST /api/children/[id]/authorised-pickups                         */
/* ------------------------------------------------------------------ */

describe("POST /api/children/[id]/authorised-pickups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("POST", "/api/children/child-1/authorised-pickups", {
      body: { name: "Test", relationship: "Friend", phone: "0400000000" },
    });
    const res = await POST(req, routeCtx({ id: "child-1" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid data (missing name)", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.child.findUnique.mockResolvedValue({ id: "child-1" });

    const req = createRequest("POST", "/api/children/child-1/authorised-pickups", {
      body: { relationship: "Friend", phone: "0400000000" },
    });
    const res = await POST(req, routeCtx({ id: "child-1" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when child not found", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.child.findUnique.mockResolvedValue(null);

    const req = createRequest("POST", "/api/children/child-1/authorised-pickups", {
      body: { name: "Jane", relationship: "Grandmother", phone: "0400111222" },
    });
    const res = await POST(req, routeCtx({ id: "child-1" }));
    expect(res.status).toBe(404);
  });

  it("returns 201 on successful creation", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.child.findUnique.mockResolvedValue({ id: "child-1" });
    prismaMock.authorisedPickup.create.mockResolvedValue(samplePickup);

    const req = createRequest("POST", "/api/children/child-1/authorised-pickups", {
      body: {
        name: "Jane Smith",
        relationship: "Grandmother",
        phone: "0400111222",
        notes: "Available weekdays only",
      },
    });
    const res = await POST(req, routeCtx({ id: "child-1" }));
    expect(res.status).toBe(201);
  });
});

/* ------------------------------------------------------------------ */
/*  PATCH /api/children/[id]/authorised-pickups/[pickupId]             */
/* ------------------------------------------------------------------ */

describe("PATCH /api/children/[id]/authorised-pickups/[pickupId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("PATCH", "/api/children/child-1/authorised-pickups/pickup-1", {
      body: { name: "Updated Name" },
    });
    const res = await PATCH(req, routeCtx({ id: "child-1", pickupId: "pickup-1" }));
    expect(res.status).toBe(401);
  });

  it("returns 404 when pickup not found", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.authorisedPickup.findFirst.mockResolvedValue(null);

    const req = createRequest("PATCH", "/api/children/child-1/authorised-pickups/pickup-999", {
      body: { name: "Updated Name" },
    });
    const res = await PATCH(req, routeCtx({ id: "child-1", pickupId: "pickup-999" }));
    expect(res.status).toBe(404);
  });

  it("returns 200 on successful update", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.authorisedPickup.findFirst.mockResolvedValue(samplePickup);
    prismaMock.authorisedPickup.update.mockResolvedValue({
      ...samplePickup,
      name: "Jane Doe",
      notes: "Updated notes",
    });

    const req = createRequest("PATCH", "/api/children/child-1/authorised-pickups/pickup-1", {
      body: { name: "Jane Doe", notes: "Updated notes" },
    });
    const res = await PATCH(req, routeCtx({ id: "child-1", pickupId: "pickup-1" }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe("Jane Doe");
  });
});

/* ------------------------------------------------------------------ */
/*  DELETE /api/children/[id]/authorised-pickups/[pickupId]            */
/* ------------------------------------------------------------------ */

describe("DELETE /api/children/[id]/authorised-pickups/[pickupId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("DELETE", "/api/children/child-1/authorised-pickups/pickup-1");
    const res = await DELETE(req, routeCtx({ id: "child-1", pickupId: "pickup-1" }));
    expect(res.status).toBe(401);
  });

  it("returns 404 when pickup not found", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.authorisedPickup.findFirst.mockResolvedValue(null);

    const req = createRequest("DELETE", "/api/children/child-1/authorised-pickups/pickup-999");
    const res = await DELETE(req, routeCtx({ id: "child-1", pickupId: "pickup-999" }));
    expect(res.status).toBe(404);
  });

  it("returns 200 and soft-deletes (sets active=false)", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.authorisedPickup.findFirst.mockResolvedValue(samplePickup);
    prismaMock.authorisedPickup.update.mockResolvedValue({
      ...samplePickup,
      active: false,
    });

    const req = createRequest("DELETE", "/api/children/child-1/authorised-pickups/pickup-1");
    const res = await DELETE(req, routeCtx({ id: "child-1", pickupId: "pickup-1" }));

    expect(res.status).toBe(200);

    // Verify soft delete, not hard delete
    expect(prismaMock.authorisedPickup.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { active: false },
      }),
    );
    expect(prismaMock.authorisedPickup.delete).not.toHaveBeenCalled();
  });
});
