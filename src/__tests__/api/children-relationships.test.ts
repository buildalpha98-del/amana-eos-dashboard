import { describe, it, expect, beforeEach, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60_000 }),
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

// Import AFTER mocks.
import { PATCH } from "@/app/api/children/[id]/relationships/route";

const ctx = (params: Record<string, string>) => ({
  params: Promise.resolve(params),
});

describe("PATCH /api/children/[id]/relationships", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    mockSession({
      id: "u1",
      name: "Owner",
      role: "owner",
      serviceId: "svc1",
    });
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.child.findUnique.mockResolvedValue({
      id: "c1",
      serviceId: "svc1",
      enrolmentId: "enr1",
    });
    prismaMock.enrolmentSubmission.findUnique.mockResolvedValue({
      id: "enr1",
      secondaryParent: null,
      emergencyContacts: [],
      authorisedPickup: [],
    });
    prismaMock.enrolmentSubmission.update.mockResolvedValue({
      id: "enr1",
    });
    // prisma-mock.ts auto-handles $transaction(async (tx) => ...)
  });

  it("401 without session", async () => {
    mockNoSession();
    const req = createRequest("PATCH", "/api/children/c1/relationships", {
      body: { secondaryParent: null },
    });
    const res = await PATCH(req, ctx({ id: "c1" }));
    expect(res.status).toBe(401);
  });

  it("404 when child not found", async () => {
    prismaMock.child.findUnique.mockResolvedValue(null);
    const req = createRequest("PATCH", "/api/children/c1/relationships", {
      body: {},
    });
    const res = await PATCH(req, ctx({ id: "c1" }));
    expect(res.status).toBe(404);
  });

  it("403 when coordinator is at a different service", async () => {
    mockSession({
      id: "u1",
      name: "Coord",
      role: "member",
      serviceId: "svc2",
    });
    const req = createRequest("PATCH", "/api/children/c1/relationships", {
      body: {},
    });
    const res = await PATCH(req, ctx({ id: "c1" }));
    expect(res.status).toBe(403);
  });

  it("403 for staff (read-only on relationships)", async () => {
    mockSession({
      id: "u1",
      name: "Staff",
      role: "staff",
      serviceId: "svc1",
    });
    const req = createRequest("PATCH", "/api/children/c1/relationships", {
      body: {},
    });
    const res = await PATCH(req, ctx({ id: "c1" }));
    expect(res.status).toBe(403);
  });

  // 2026-04-30: post coordinator-collapse, member (Director of Service)
  // inherits coordinator's edit perms on relationships. Test role changed
  // from member → staff (still read-only).
  it("403 for staff (read-only on relationships)", async () => {
    mockSession({
      id: "u1",
      name: "Staff",
      role: "staff",
      serviceId: "svc1",
    });
    const req = createRequest("PATCH", "/api/children/c1/relationships", {
      body: {},
    });
    const res = await PATCH(req, ctx({ id: "c1" }));
    expect(res.status).toBe(403);
  });

  it("403 for marketing (read-only on relationships)", async () => {
    mockSession({
      id: "u1",
      name: "Marketing",
      role: "marketing",
      serviceId: "svc1",
    });
    const req = createRequest("PATCH", "/api/children/c1/relationships", {
      body: {},
    });
    const res = await PATCH(req, ctx({ id: "c1" }));
    expect(res.status).toBe(403);
  });

  it("400 on invalid emergency contact", async () => {
    const req = createRequest("PATCH", "/api/children/c1/relationships", {
      body: {
        emergencyContacts: [
          // name missing (required)
          { relationship: "sis", phone: "0400..." },
        ],
      },
    });
    const res = await PATCH(req, ctx({ id: "c1" }));
    expect(res.status).toBe(400);
  });

  it("200 happy path — coord can patch secondary + emergency + pickups", async () => {
    mockSession({
      id: "u1",
      name: "Coord",
      role: "member",
      serviceId: "svc1",
    });
    const req = createRequest("PATCH", "/api/children/c1/relationships", {
      body: {
        secondaryParent: {
          firstName: "B",
          surname: "B",
          relationship: "Father",
        },
        emergencyContacts: [
          { name: "Nan", relationship: "Grandma", phone: "0400111222" },
        ],
        authorisedPickup: [
          { name: "Uncle Bob", relationship: "Uncle", phone: "0400333444" },
        ],
      },
    });
    const res = await PATCH(req, ctx({ id: "c1" }));
    expect(res.status).toBe(200);
    const call = prismaMock.enrolmentSubmission.update.mock.calls[0][0];
    expect(call.where.id).toBe("enr1");
    expect(call.data.secondaryParent).toEqual(
      expect.objectContaining({ firstName: "B", surname: "B" }),
    );
    expect(call.data.emergencyContacts).toHaveLength(1);
    expect(call.data.authorisedPickup).toHaveLength(1);
  });

  it("only sends patched keys to Prisma (others omitted, so Prisma preserves them)", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    const req = createRequest("PATCH", "/api/children/c1/relationships", {
      body: { secondaryParent: { firstName: "New", surname: "Secondary" } },
    });
    const res = await PATCH(req, ctx({ id: "c1" }));
    expect(res.status).toBe(200);
    const data = prismaMock.enrolmentSubmission.update.mock.calls[0][0].data;
    // secondaryParent patched
    expect(data.secondaryParent.firstName).toBe("New");
    // emergency + pickup untouched (not sent in the patch) — Prisma leaves
    // those columns alone.
    expect(data.emergencyContacts).toBeUndefined();
    expect(data.authorisedPickup).toBeUndefined();
  });

  it("rejects primaryParent (enrolment-flow-only)", async () => {
    const req = createRequest("PATCH", "/api/children/c1/relationships", {
      body: { primaryParent: { firstName: "no", surname: "no" } },
    });
    const res = await PATCH(req, ctx({ id: "c1" }));
    expect(res.status).toBe(400);
  });

  it("200 — coord clears secondary carer with null → Prisma.JsonNull", async () => {
    mockSession({
      id: "u1",
      name: "Coord",
      role: "member",
      serviceId: "svc1",
    });
    const req = createRequest("PATCH", "/api/children/c1/relationships", {
      body: { secondaryParent: null },
    });
    const res = await PATCH(req, ctx({ id: "c1" }));
    expect(res.status).toBe(200);
    const call = prismaMock.enrolmentSubmission.update.mock.calls[0][0];
    expect(call.where.id).toBe("enr1");
    expect(call.data.secondaryParent).toBe(Prisma.JsonNull);
  });

  it("200 — coord clears emergency contacts with an empty array", async () => {
    mockSession({
      id: "u1",
      name: "Coord",
      role: "member",
      serviceId: "svc1",
    });
    const req = createRequest("PATCH", "/api/children/c1/relationships", {
      body: { emergencyContacts: [] },
    });
    const res = await PATCH(req, ctx({ id: "c1" }));
    expect(res.status).toBe(200);
    const call = prismaMock.enrolmentSubmission.update.mock.calls[0][0];
    expect(call.data.emergencyContacts).toEqual([]);
  });

  it("200 — coord clears authorised pickups with an empty array", async () => {
    mockSession({
      id: "u1",
      name: "Coord",
      role: "member",
      serviceId: "svc1",
    });
    const req = createRequest("PATCH", "/api/children/c1/relationships", {
      body: { authorisedPickup: [] },
    });
    const res = await PATCH(req, ctx({ id: "c1" }));
    expect(res.status).toBe(200);
    const call = prismaMock.enrolmentSubmission.update.mock.calls[0][0];
    expect(call.data.authorisedPickup).toEqual([]);
  });
});
