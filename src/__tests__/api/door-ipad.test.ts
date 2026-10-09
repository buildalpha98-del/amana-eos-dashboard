/**
 * The door iPad (Round 4, 2026-10-09). The screen hides what it shouldn't
 * offer; these pin that the SERVER refuses it too.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { hash } from "bcryptjs";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 5, resetIn: 0 })),
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "test-req-id",
}));
vi.mock("@/lib/kiosk-auth", () => ({
  authenticateKiosk: vi.fn(async (req: Request) =>
    req.headers.get("authorization") === "Bearer good" ? { id: "k1", serviceId: "svc-a", label: "Door" } : null,
  ),
}));
const handover = vi.hoisted(() => ({
  recordHandover: vi.fn(() => Promise.resolve({ id: "rec" })),
  syncDailyAttendance: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/attendance-handover", () => handover);

import { GET as today } from "@/app/api/door/today/route";
import { POST as sign } from "@/app/api/door/sign/route";
import { POST as unlock } from "@/app/api/door/unlock/route";
import { POST as pair } from "@/app/api/services/[id]/door-ipad/route";

const parents = {
  id: "enr-1",
  primaryParent: { firstName: "Mariam", surname: "Local", relationship: "Mother" },
  secondaryParent: { firstName: "Ahmed", surname: "Local", relationship: "Father" },
  courtOrders: false,
};
const booking = (childId: string, extra: Record<string, unknown> = {}) => ({
  sessionType: "asc",
  child: {
    id: childId,
    firstName: "Adam",
    surname: "Local",
    photo: null,
    custodyArrangements: null,
    enrolment: parents,
    ...extra,
  },
});
const doorReq = (url: string, body?: unknown, token = "good") =>
  new Request(`http://localhost${url}`, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

beforeEach(() => {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.service.findUnique.mockResolvedValue({ id: "svc-a", name: "Greenacre", appSettings: null });
  prismaMock.room.findMany.mockResolvedValue([{ legacyKey: "asc", name: "Amana Afternoons", sortOrder: 1 }]);
  prismaMock.booking.findMany.mockResolvedValue([booking("c1")]);
  prismaMock.attendanceRecord.findMany.mockResolvedValue([]);
});

describe("GET /api/door/today", () => {
  it("refuses a device that isn't paired", async () => {
    expect((await today(doorReq("/api/door/today", undefined, "bad"))).status).toBe(401);
  });

  it("shows first name and initial only, and parents' first names — nothing medical", async () => {
    const res = await today(doorReq("/api/door/today"));
    const json = await res.json();
    expect(json.children[0]).toMatchObject({
      firstName: "Adam",
      initial: "L",
      state: "arriving",
      needsEducator: false,
      adults: [
        { key: "primary", firstName: "Mariam", relationship: "Mother" },
        { key: "secondary", firstName: "Ahmed", relationship: "Father" },
      ],
    });
    expect(JSON.stringify(json)).not.toMatch(/Local|surname|medical|custody/i);
  });
});

describe("POST /api/door/sign", () => {
  const body = { sessionType: "asc", childIds: ["c1"], action: "sign_in", adult: "primary" };

  it("records a parent sign-in as the parent, on the iPad, through the shared write", async () => {
    const res = await sign(doorReq("/api/door/sign", body));
    expect(res.status).toBe(200);
    expect(handover.recordHandover).toHaveBeenCalledWith(
      expect.objectContaining({
        childId: "c1",
        action: "sign_in",
        recordedById: null,
        signedByName: "Mariam Local",
        signMethod: "parent_kiosk",
      }),
    );
  });

  it("sends a custody / court-order child to an educator", async () => {
    prismaMock.booking.findMany.mockResolvedValue([booking("c1", { custodyArrangements: { type: "court_order" } })]);
    expect((await sign(doorReq("/api/door/sign", body))).status).toBe(403);
    prismaMock.booking.findMany.mockResolvedValue([booking("c1", { enrolment: { ...parents, courtOrders: true } })]);
    expect((await sign(doorReq("/api/door/sign", body))).status).toBe(403);
    expect(handover.recordHandover).not.toHaveBeenCalled();
  });

  it("only lets a parent on the enrolment sign", async () => {
    prismaMock.booking.findMany.mockResolvedValue([booking("c1", { enrolment: { ...parents, secondaryParent: null } })]);
    const res = await sign(doorReq("/api/door/sign", { ...body, adult: "secondary" }));
    expect(res.status).toBe(403);
  });

  it("asks for a signature when the centre requires one", async () => {
    prismaMock.service.findUnique.mockResolvedValue({ appSettings: { signInOut: { requireSignature: true } } });
    expect((await sign(doorReq("/api/door/sign", body))).status).toBe(400);
    expect((await sign(doorReq("/api/door/sign", { ...body, signature: "data:image/png;base64,x" }))).status).toBe(200);
  });

  it("won't sign out a child who isn't in, or sign in one who's already here", async () => {
    expect((await sign(doorReq("/api/door/sign", { ...body, action: "sign_out" }))).status).toBe(409);
    prismaMock.attendanceRecord.findMany.mockResolvedValue([{ childId: "c1", status: "present", signOutTime: null }]);
    expect((await sign(doorReq("/api/door/sign", body))).status).toBe(409);
  });

  it("won't sign a child who isn't booked here today", async () => {
    prismaMock.booking.findMany.mockResolvedValue([]);
    expect((await sign(doorReq("/api/door/sign", body))).status).toBe(404);
  });
});

describe("POST /api/door/unlock", () => {
  beforeEach(async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: "u1", name: "Sarah Awad", kioskPinHash: await hash("2468", 4) }]);
  });
  it("opens Service mode with a centre staff member's PIN", async () => {
    const res = await unlock(doorReq("/api/door/unlock", { pin: "2468" }));
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("Sarah Awad");
  });
  it("refuses a wrong PIN", async () => {
    expect((await unlock(doorReq("/api/door/unlock", { pin: "1111" }))).status).toBe(401);
  });
});

describe("POST /api/services/[id]/door-ipad", () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
  beforeEach(() => prismaMock.kiosk.create.mockResolvedValue({ id: "k2", label: "Greenacre door iPad" }));

  it("lets the centre's Coordinator / centre login pair it", async () => {
    mockSession({ id: "co", name: "Greenacre", role: "member", serviceId: "svc-a" });
    const res = await pair(createRequest("POST", "/api/services/svc-a/door-ipad"), ctx("svc-a"));
    expect(res.status).toBe(201);
    expect((await res.json()).token).toMatch(/^[0-9a-f]{64}$/);
  });
  it("refuses another centre's Coordinator and educators", async () => {
    mockSession({ id: "co", name: "Other", role: "member", serviceId: "svc-b" });
    expect((await pair(createRequest("POST", "/api/services/svc-a/door-ipad"), ctx("svc-a"))).status).toBe(403);
    mockSession({ id: "ed", name: "Educator", role: "staff", serviceId: "svc-a" });
    expect((await pair(createRequest("POST", "/api/services/svc-a/door-ipad"), ctx("svc-a"))).status).toBe(403);
  });
});
