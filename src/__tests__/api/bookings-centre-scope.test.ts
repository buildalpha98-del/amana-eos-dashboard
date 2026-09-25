import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "test-req-id",
}));

// Notification fan-out is fire-and-forget; stub it so the tests don't send mail.
vi.mock("@/lib/notifications/bookings", () => ({
  sendBookingConfirmedNotification: vi.fn().mockResolvedValue(undefined),
  sendBookingDeclinedNotification: vi.fn().mockResolvedValue(undefined),
}));

// Centre scope is stubbed rather than driven through its own DB queries —
// these tests are about whether the ROUTES honour the scope they are handed.
// `vi.hoisted` because vi.mock factories are lifted above the file's consts.
const { getCentreScope } = vi.hoisted(() => ({ getCentreScope: vi.fn() }));
vi.mock("@/lib/centre-scope", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/centre-scope")>();
  return { ...actual, getCentreScope };
});

import { GET } from "@/app/api/bookings/requests/route";
import { POST as APPROVE } from "@/app/api/bookings/[id]/approve/route";
import { POST as DECLINE } from "@/app/api/bookings/[id]/decline/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const OWN = "svc-own";
const OTHER = "svc-other";
const ctx = { params: Promise.resolve({ id: "bk-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.booking.findMany.mockResolvedValue([]);
  prismaMock.booking.count.mockResolvedValue(0);
  getCentreScope.mockResolvedValue({ serviceIds: [OWN] });
});

describe("GET /api/bookings/requests — centre scoping", () => {
  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await GET(createRequest("GET", "/api/bookings/requests"));
    expect(res.status).toBe(401);
  });

  it("scopes an unfiltered request to the caller's centres", async () => {
    mockSession({ id: "u1", name: "Dir", role: "member", serviceId: OWN });
    const res = await GET(createRequest("GET", "/api/bookings/requests"));
    expect(res.status).toBe(200);
    expect(prismaMock.booking.findMany.mock.calls[0][0].where.serviceId).toBe(OWN);
  });

  it("refuses an explicit serviceId outside the caller's centres", async () => {
    mockSession({ id: "u1", name: "Dir", role: "member", serviceId: OWN });
    const res = await GET(createRequest("GET", `/api/bookings/requests?serviceId=${OTHER}`));
    expect(res.status).toBe(403);
    expect(prismaMock.booking.findMany).not.toHaveBeenCalled();
  });

  it("allows an explicit serviceId inside the caller's centres", async () => {
    mockSession({ id: "u1", name: "Dir", role: "member", serviceId: OWN });
    const res = await GET(createRequest("GET", `/api/bookings/requests?serviceId=${OWN}`));
    expect(res.status).toBe(200);
    expect(prismaMock.booking.findMany.mock.calls[0][0].where.serviceId).toBe(OWN);
  });

  it("leaves org-wide roles (null scope) unfiltered", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    getCentreScope.mockResolvedValue({ serviceIds: null });
    const res = await GET(createRequest("GET", "/api/bookings/requests"));
    expect(res.status).toBe(200);
    expect(prismaMock.booking.findMany.mock.calls[0][0].where.serviceId).toBeUndefined();
  });
});

describe("POST /api/bookings/[id]/approve|decline — centre scoping", () => {
  it("404s approving a booking at another centre, without writing", async () => {
    mockSession({ id: "u1", name: "Dir", role: "member", serviceId: OWN });
    prismaMock.booking.findUnique.mockResolvedValue({ id: "bk-1", status: "requested", serviceId: OTHER });
    const res = await APPROVE(createRequest("POST", "/api/bookings/bk-1/approve"), ctx);
    expect(res.status).toBe(404);
    expect(prismaMock.booking.update).not.toHaveBeenCalled();
  });

  it("404s declining a booking at another centre, without writing", async () => {
    mockSession({ id: "u1", name: "Dir", role: "member", serviceId: OWN });
    prismaMock.booking.findUnique.mockResolvedValue({ id: "bk-1", status: "requested", serviceId: OTHER });
    const res = await DECLINE(createRequest("POST", "/api/bookings/bk-1/decline", { body: {} }), ctx);
    expect(res.status).toBe(404);
    expect(prismaMock.booking.update).not.toHaveBeenCalled();
  });

  it("approves a booking at the caller's own centre", async () => {
    mockSession({ id: "u1", name: "Dir", role: "member", serviceId: OWN });
    prismaMock.booking.findUnique.mockResolvedValue({ id: "bk-1", status: "requested", serviceId: OWN });
    prismaMock.booking.update.mockResolvedValue({ id: "bk-1", status: "confirmed" });
    const res = await APPROVE(createRequest("POST", "/api/bookings/bk-1/approve"), ctx);
    expect(res.status).toBe(200);
    expect(prismaMock.booking.update.mock.calls[0][0].data.status).toBe("confirmed");
  });

  it("declining writes status 'declined', not 'cancelled'", async () => {
    mockSession({ id: "u1", name: "Dir", role: "member", serviceId: OWN });
    prismaMock.booking.findUnique.mockResolvedValue({ id: "bk-1", status: "requested", serviceId: OWN });
    prismaMock.booking.update.mockResolvedValue({ id: "bk-1", status: "declined" });
    const res = await DECLINE(createRequest("POST", "/api/bookings/bk-1/decline", { body: { reason: "Full" } }), ctx);
    expect(res.status).toBe(200);
    const data = prismaMock.booking.update.mock.calls[0][0].data;
    expect(data.status).toBe("declined");
    expect(data.declineReason).toBe("Full");
    expect(data.reviewedById).toBe("u1");
  });
});
