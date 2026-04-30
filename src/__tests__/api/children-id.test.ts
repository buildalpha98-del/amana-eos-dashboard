import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 }),
  ),
}));
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
vi.mock("@/lib/booking-generator", () => ({
  generateBookings: vi.fn(() => []),
}));

import { PATCH, GET } from "@/app/api/children/[id]/route";

const ctx = (params: Record<string, string>) => ({
  params: Promise.resolve(params),
});

describe("PATCH /api/children/[id] — role narrowing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.child.update.mockResolvedValue({
      id: "child-1",
      serviceId: "svc-1",
      bookingPrefs: null,
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("PATCH", "/api/children/child-1", {
      body: { schoolName: "Test" },
    });
    const res = await PATCH(req, ctx({ id: "child-1" }));
    expect(res.status).toBe(401);
  });

  it("staff role patching medicareNumber → 403", async () => {
    mockSession({ id: "u1", name: "Staff", role: "staff", serviceId: "svc-1" });
    const req = createRequest("PATCH", "/api/children/child-1", {
      body: { medicareNumber: "1234567890" },
    });
    const res = await PATCH(req, ctx({ id: "child-1" }));
    expect(res.status).toBe(403);
  });

  it("staff role patching medicalConditions → 403", async () => {
    mockSession({ id: "u1", name: "Staff", role: "staff", serviceId: "svc-1" });
    const req = createRequest("PATCH", "/api/children/child-1", {
      body: { medicalConditions: ["Asthma"] },
    });
    const res = await PATCH(req, ctx({ id: "child-1" }));
    expect(res.status).toBe(403);
  });

  it("staff role patching bookingPrefs → 403", async () => {
    mockSession({ id: "u1", name: "Staff", role: "staff", serviceId: "svc-1" });
    const req = createRequest("PATCH", "/api/children/child-1", {
      body: { bookingPrefs: { fortnightPattern: {} } },
    });
    const res = await PATCH(req, ctx({ id: "child-1" }));
    expect(res.status).toBe(403);
  });

  it("member role patching medicalConditions → 403", async () => {
    mockSession({ id: "u1", name: "Member", role: "staff", serviceId: "svc-1" });
    const req = createRequest("PATCH", "/api/children/child-1", {
      body: { medicalConditions: ["Asthma"] },
    });
    const res = await PATCH(req, ctx({ id: "child-1" }));
    expect(res.status).toBe(403);
  });

  it("marketing role patching bookingPrefs → 403", async () => {
    mockSession({
      id: "u1",
      name: "Marketer",
      role: "marketing",
      serviceId: null,
    });
    const req = createRequest("PATCH", "/api/children/child-1", {
      body: { bookingPrefs: { fortnightPattern: {} } },
    });
    const res = await PATCH(req, ctx({ id: "child-1" }));
    expect(res.status).toBe(403);
  });

  it("staff role patching schoolName (non-restricted) → 200", async () => {
    mockSession({ id: "u1", name: "Staff", role: "staff", serviceId: "svc-1" });
    prismaMock.child.update.mockResolvedValue({
      id: "child-1",
      schoolName: "New School",
      serviceId: "svc-1",
      bookingPrefs: null,
    });
    const req = createRequest("PATCH", "/api/children/child-1", {
      body: { schoolName: "New School" },
    });
    const res = await PATCH(req, ctx({ id: "child-1" }));
    expect(res.status).toBe(200);
  });

  it("coordinator at same service patching medicareNumber → 200", async () => {
    mockSession({
      id: "u1",
      name: "Coord",
      role: "member",
      serviceId: "svc-1",
    });
    prismaMock.child.findUnique.mockResolvedValue({ serviceId: "svc-1" });
    prismaMock.child.update.mockResolvedValue({
      id: "child-1",
      serviceId: "svc-1",
      medicareNumber: "1234567890",
      bookingPrefs: null,
    });
    const req = createRequest("PATCH", "/api/children/child-1", {
      body: { medicareNumber: "1234567890" },
    });
    const res = await PATCH(req, ctx({ id: "child-1" }));
    expect(res.status).toBe(200);
  });

  it("coordinator at different service → 403", async () => {
    mockSession({
      id: "u1",
      name: "Coord",
      role: "member",
      serviceId: "svc-1",
    });
    prismaMock.child.findUnique.mockResolvedValue({ serviceId: "svc-2" });
    const req = createRequest("PATCH", "/api/children/child-1", {
      body: { medicareNumber: "1234567890" },
    });
    const res = await PATCH(req, ctx({ id: "child-1" }));
    expect(res.status).toBe(403);
  });

  it("coordinator on child with no service → 403", async () => {
    mockSession({
      id: "u1",
      name: "Coord",
      role: "member",
      serviceId: "svc-1",
    });
    prismaMock.child.findUnique.mockResolvedValue({ serviceId: null });
    const req = createRequest("PATCH", "/api/children/child-1", {
      body: { medicareNumber: "1234567890" },
    });
    const res = await PATCH(req, ctx({ id: "child-1" }));
    expect(res.status).toBe(403);
  });

  it("coordinator, child not found → 404", async () => {
    mockSession({
      id: "u1",
      name: "Coord",
      role: "member",
      serviceId: "svc-1",
    });
    prismaMock.child.findUnique.mockResolvedValue(null);
    const req = createRequest("PATCH", "/api/children/child-missing", {
      body: { medicareNumber: "1234567890" },
    });
    const res = await PATCH(req, ctx({ id: "child-missing" }));
    expect(res.status).toBe(404);
  });

  it("admin at any service → 200", async () => {
    mockSession({
      id: "u1",
      name: "Admin",
      role: "admin",
      serviceId: null,
    });
    prismaMock.child.update.mockResolvedValue({
      id: "child-1",
      serviceId: "svc-1",
      medicareNumber: "1234567890",
      bookingPrefs: null,
    });
    const req = createRequest("PATCH", "/api/children/child-1", {
      body: { medicareNumber: "1234567890" },
    });
    const res = await PATCH(req, ctx({ id: "child-1" }));
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/children/[id] — bookingPrefs transactional merge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("merges fortnightPattern while preserving other keys", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin", serviceId: null });

    // Inside the $transaction callback:
    //   tx.child.findUnique → existing bookingPrefs
    //   tx.child.update → merged update
    prismaMock.child.findUnique.mockResolvedValue({
      bookingPrefs: {
        legacyKey: "keep-me",
        startDate: "2026-01-01",
        fortnightPattern: { week1: { asc: ["mon"] }, week2: {} },
      },
    });
    prismaMock.child.update.mockResolvedValue({
      id: "child-1",
      serviceId: "svc-1",
      bookingPrefs: {
        legacyKey: "keep-me",
        startDate: "2026-01-01",
        fortnightPattern: { week1: { asc: ["tue"] }, week2: {} },
      },
    });

    const req = createRequest("PATCH", "/api/children/child-1", {
      body: {
        bookingPrefs: {
          fortnightPattern: { week1: { asc: ["tue"] }, week2: {} },
        },
      },
    });
    const res = await PATCH(req, ctx({ id: "child-1" }));
    expect(res.status).toBe(200);

    // The update call inside the transaction must include merged data
    expect(prismaMock.child.update).toHaveBeenCalledTimes(1);
    const updateArg = prismaMock.child.update.mock.calls[0][0];
    expect(updateArg.data.bookingPrefs.legacyKey).toBe("keep-me");
    expect(updateArg.data.bookingPrefs.startDate).toBe("2026-01-01");
    expect(updateArg.data.bookingPrefs.fortnightPattern.week1.asc).toEqual([
      "tue",
    ]);
  });

  it("treats missing existing bookingPrefs as empty object", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin", serviceId: null });

    prismaMock.child.findUnique.mockResolvedValue({ bookingPrefs: null });
    prismaMock.child.update.mockResolvedValue({
      id: "child-1",
      serviceId: "svc-1",
      bookingPrefs: { fortnightPattern: { week1: {}, week2: {} } },
    });

    const req = createRequest("PATCH", "/api/children/child-1", {
      body: {
        bookingPrefs: {
          fortnightPattern: { week1: {}, week2: {} },
        },
      },
    });
    const res = await PATCH(req, ctx({ id: "child-1" }));
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/children/[id] — validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("accepts full Details payload (200)", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin", serviceId: null });
    prismaMock.child.update.mockResolvedValue({
      id: "child-1",
      serviceId: "svc-1",
      bookingPrefs: null,
    });
    const req = createRequest("PATCH", "/api/children/child-1", {
      body: {
        firstName: "Jane",
        surname: "Doe",
        dob: "2017-05-10T00:00:00.000Z",
        gender: "female",
        crn: "1234567",
        photo: "https://example.com/photo.jpg",
        schoolName: "Sunrise Primary",
        yearLevel: "3",
        status: "active",
      },
    });
    const res = await PATCH(req, ctx({ id: "child-1" }));
    expect(res.status).toBe(200);
  });

  it("rejects invalid gender enum (400)", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin", serviceId: null });
    const req = createRequest("PATCH", "/api/children/child-1", {
      body: { gender: "bogus" },
    });
    const res = await PATCH(req, ctx({ id: "child-1" }));
    expect(res.status).toBe(400);
  });

  // ── OWNA gap close — Phase D: custody + immunisation ──
  it("admin patching nextImmunisationDue → 200 + Date coercion", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin", serviceId: null });
    prismaMock.child.update.mockResolvedValue({
      id: "child-1",
      serviceId: "svc-1",
      bookingPrefs: null,
    });
    const req = createRequest("PATCH", "/api/children/child-1", {
      body: { nextImmunisationDue: "2026-09-15T00:00:00.000Z" },
    });
    const res = await PATCH(req, ctx({ id: "child-1" }));
    expect(res.status).toBe(200);
    const updateCall = prismaMock.child.update.mock.calls[0]?.[0];
    expect(updateCall?.data?.nextImmunisationDue).toBeInstanceOf(Date);
  });

  it("staff patching nextImmunisationDue → 403 (restricted)", async () => {
    mockSession({ id: "u1", name: "Staff", role: "staff", serviceId: "svc-1" });
    const req = createRequest("PATCH", "/api/children/child-1", {
      body: { nextImmunisationDue: "2026-09-15T00:00:00.000Z" },
    });
    const res = await PATCH(req, ctx({ id: "child-1" }));
    expect(res.status).toBe(403);
  });

  it("admin patching custodyArrangements → 200", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin", serviceId: null });
    prismaMock.child.update.mockResolvedValue({
      id: "child-1",
      serviceId: "svc-1",
      bookingPrefs: null,
    });
    const req = createRequest("PATCH", "/api/children/child-1", {
      body: {
        custodyArrangements: {
          type: "shared",
          primaryGuardian: "Jane Doe",
          details: "50/50 alternating weeks",
        },
      },
    });
    const res = await PATCH(req, ctx({ id: "child-1" }));
    expect(res.status).toBe(200);
  });

  it("staff patching custodyArrangements → 403 (restricted)", async () => {
    mockSession({ id: "u1", name: "Staff", role: "staff", serviceId: "svc-1" });
    const req = createRequest("PATCH", "/api/children/child-1", {
      body: {
        custodyArrangements: { type: "shared" },
      },
    });
    const res = await PATCH(req, ctx({ id: "child-1" }));
    expect(res.status).toBe(403);
  });

  it("rejects invalid custodyArrangements.type enum (400)", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin", serviceId: null });
    const req = createRequest("PATCH", "/api/children/child-1", {
      body: {
        custodyArrangements: { type: "invalid_value" },
      },
    });
    const res = await PATCH(req, ctx({ id: "child-1" }));
    expect(res.status).toBe(400);
  });

  it("admin can clear custodyArrangements with null", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin", serviceId: null });
    prismaMock.child.update.mockResolvedValue({
      id: "child-1",
      serviceId: "svc-1",
      bookingPrefs: null,
    });
    const req = createRequest("PATCH", "/api/children/child-1", {
      body: { custodyArrangements: null },
    });
    const res = await PATCH(req, ctx({ id: "child-1" }));
    expect(res.status).toBe(200);
    const updateCall = prismaMock.child.update.mock.calls[0]?.[0];
    expect(updateCall?.data?.custodyArrangements).toBeNull();
  });
});

describe("GET /api/children/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 404 when child not found", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin", serviceId: null });
    prismaMock.child.findUnique.mockResolvedValue(null);
    const req = createRequest("GET", "/api/children/missing");
    const res = await GET(req, ctx({ id: "missing" }));
    expect(res.status).toBe(404);
  });
});
