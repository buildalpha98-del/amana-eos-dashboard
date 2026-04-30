import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
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
import { GET } from "@/app/api/children/route";

describe("GET /api/children — filters (4b)", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.child.findMany.mockResolvedValue([]);
    prismaMock.child.count.mockResolvedValue(0);
  });

  it("forwards ccsStatus=eligible as where.ccsStatus", async () => {
    await GET(createRequest("GET", "/api/children?ccsStatus=eligible"));
    const call = prismaMock.child.findMany.mock.calls[0][0];
    expect(call.where.ccsStatus).toBe("eligible");
  });

  it("forwards room=R1 as where.room (NOT ownaRoomName)", async () => {
    await GET(createRequest("GET", "/api/children?room=R1"));
    const call = prismaMock.child.findMany.mock.calls[0][0];
    expect(call.where.room).toBe("R1");
    expect(call.where.ownaRoomName).toBeUndefined();
  });

  it("forwards tags=siblings&tags=vip as where.tags.hasSome", async () => {
    await GET(createRequest("GET", "/api/children?tags=siblings&tags=vip"));
    const call = prismaMock.child.findMany.mock.calls[0][0];
    expect(call.where.tags).toEqual({ hasSome: ["siblings", "vip"] });
  });

  it("filters by day=mon (client-side via bookingPrefs.fortnightPattern)", async () => {
    // Provide children with various fortnight patterns; expect only Monday-ers to survive.
    const children = [
      {
        id: "c1",
        firstName: "A",
        surname: "1",
        bookingPrefs: {
          fortnightPattern: { week1: { bsc: ["mon"] }, week2: {} },
        },
        service: null,
        enrolment: null,
      },
      {
        id: "c2",
        firstName: "B",
        surname: "2",
        bookingPrefs: {
          fortnightPattern: { week1: {}, week2: { asc: ["tue"] } },
        },
        service: null,
        enrolment: null,
      },
      {
        id: "c3",
        firstName: "C",
        surname: "3",
        bookingPrefs: null,
        service: null,
        enrolment: null,
      },
    ];
    prismaMock.child.findMany.mockResolvedValue(children);
    prismaMock.child.count.mockResolvedValue(3);
    const res = await GET(createRequest("GET", "/api/children?day=mon"));
    const body = await res.json();
    expect(body.children.map((c: { id: string }) => c.id)).toEqual(["c1"]);
    // Total reflects the filtered set when day is applied (not DB count).
    expect(body.total).toBe(1);
  });

  it("combines filters (serviceId + status + ccsStatus + tags)", async () => {
    await GET(
      createRequest(
        "GET",
        "/api/children?serviceId=s1&status=current&ccsStatus=pending&tags=vip",
      ),
    );
    const call = prismaMock.child.findMany.mock.calls[0][0];
    expect(call.where).toMatchObject({
      serviceId: "s1",
      // 2026-04-29: status=current widened to active+pending (kids attending
      // OR awaiting enrolment processing — both are "current" to a Centre
      // Director's view).
      status: { in: ["active", "pending"] },
      ccsStatus: "pending",
      tags: { hasSome: ["vip"] },
    });
  });

  it("rejects unknown day value (silently — no crash, no filter)", async () => {
    await GET(createRequest("GET", "/api/children?day=funday"));
    // No throw, no filter applied for day
    expect(prismaMock.child.findMany).toHaveBeenCalled();
  });
});
