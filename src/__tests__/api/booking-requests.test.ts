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

import { GET, PATCH } from "@/app/api/services/[id]/booking-requests/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const SERVICE_ID = "svc-1";
const context = { params: Promise.resolve({ id: SERVICE_ID }) };

describe("GET /api/services/[id]/booking-requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("GET", `/api/services/${SERVICE_ID}/booking-requests`);
    const res = await GET(req, context);
    expect(res.status).toBe(401);
  });

  it("returns 403 for staff not on this service", async () => {
    mockSession({ id: "user-1", name: "Test", role: "member", serviceId: "svc-other" });
    const req = createRequest("GET", `/api/services/${SERVICE_ID}/booking-requests`);
    const res = await GET(req, context);
    expect(res.status).toBe(403);
  });

  it("allows head_office to access any service", async () => {
    mockSession({ id: "user-1", name: "Test", role: "head_office", serviceId: "svc-other" });
    prismaMock.booking.findMany.mockResolvedValue([]);
    const req = createRequest("GET", `/api/services/${SERVICE_ID}/booking-requests`);
    const res = await GET(req, context);
    expect(res.status).toBe(200);
  });

  it("sanitizes primaryParent — only returns safe fields", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin", serviceId: SERVICE_ID });
    prismaMock.booking.findMany.mockResolvedValue([
      {
        id: "b-1",
        date: "2026-04-10",
        sessionType: "asc",
        status: "requested",
        type: "casual",
        notes: null,
        createdAt: new Date().toISOString(),
        child: {
          id: "c-1",
          firstName: "Sam",
          surname: "Jones",
          enrolment: {
            primaryParent: {
              firstName: "Lisa",
              surname: "Jones",
              email: "lisa@test.com",
              mobile: "0412345678",
              // PII that should NOT be leaked:
              address: "123 Secret St",
              medicareNumber: "1234567890",
              taxFileNumber: "999999999",
            },
          },
        },
      },
    ]);

    const req = createRequest("GET", `/api/services/${SERVICE_ID}/booking-requests`);
    const res = await GET(req, context);
    expect(res.status).toBe(200);
    const body = await res.json();
    const parent = body.items[0].child.enrolment.primaryParent;
    expect(parent.firstName).toBe("Lisa");
    expect(parent.email).toBe("lisa@test.com");
    // These should NOT exist in the response
    expect(parent.address).toBeUndefined();
    expect(parent.medicareNumber).toBeUndefined();
    expect(parent.taxFileNumber).toBeUndefined();
  });
});

describe("PATCH /api/services/[id]/booking-requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("PATCH", `/api/services/${SERVICE_ID}/booking-requests`, {
      body: { bookingId: "b-1", status: "confirmed" },
    });
    const res = await PATCH(req, context);
    expect(res.status).toBe(401);
  });

  it("returns 403 for staff not on this service", async () => {
    mockSession({ id: "user-1", name: "Test", role: "member", serviceId: "svc-other" });
    const req = createRequest("PATCH", `/api/services/${SERVICE_ID}/booking-requests`, {
      body: { bookingId: "b-1", status: "confirmed" },
    });
    const res = await PATCH(req, context);
    expect(res.status).toBe(403);
  });

  it("returns 400 when status is invalid", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin", serviceId: SERVICE_ID });
    const req = createRequest("PATCH", `/api/services/${SERVICE_ID}/booking-requests`, {
      body: { bookingId: "b-1", status: "approved" }, // wrong value
    });
    const res = await PATCH(req, context);
    expect(res.status).toBe(400);
  });

  it("returns 404 when booking not found (updateMany returns 0)", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin", serviceId: SERVICE_ID });
    prismaMock.booking.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.booking.findUnique.mockResolvedValue(null); // doesn't exist

    const req = createRequest("PATCH", `/api/services/${SERVICE_ID}/booking-requests`, {
      body: { bookingId: "b-missing", status: "confirmed" },
    });
    const res = await PATCH(req, context);
    expect(res.status).toBe(404);
  });

  it("returns 409 when booking is already processed", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin", serviceId: SERVICE_ID });
    prismaMock.booking.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.booking.findUnique.mockResolvedValue({
      serviceId: SERVICE_ID,
      status: "confirmed", // already approved
    });

    const req = createRequest("PATCH", `/api/services/${SERVICE_ID}/booking-requests`, {
      body: { bookingId: "b-1", status: "confirmed" },
    });
    const res = await PATCH(req, context);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("already confirmed");
  });

  it("approves a booking successfully and logs activity", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin", serviceId: SERVICE_ID });
    prismaMock.booking.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.activityLog.create.mockResolvedValue({});
    prismaMock.booking.findUnique.mockResolvedValue({
      id: "b-1",
      status: "confirmed",
      child: { id: "c-1", firstName: "Sam", surname: "Jones" },
    });

    const req = createRequest("PATCH", `/api/services/${SERVICE_ID}/booking-requests`, {
      body: { bookingId: "b-1", status: "confirmed" },
    });
    const res = await PATCH(req, context);
    expect(res.status).toBe(200);

    // Verify activity log was written
    expect(prismaMock.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "approved_booking",
          entityType: "Booking",
          entityId: "b-1",
        }),
      }),
    );
  });

  it("rejects a booking successfully", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin", serviceId: SERVICE_ID });
    prismaMock.booking.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.activityLog.create.mockResolvedValue({});
    prismaMock.booking.findUnique.mockResolvedValue({
      id: "b-1",
      status: "cancelled",
      child: { id: "c-1", firstName: "Sam", surname: "Jones" },
    });

    const req = createRequest("PATCH", `/api/services/${SERVICE_ID}/booking-requests`, {
      body: { bookingId: "b-1", status: "cancelled" },
    });
    const res = await PATCH(req, context);
    expect(res.status).toBe(200);

    expect(prismaMock.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "rejected_booking" }),
      }),
    );
  });
});
