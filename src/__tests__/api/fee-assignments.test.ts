import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

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
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 }),
  ),
}));

import {
  GET,
  POST,
  DELETE,
} from "@/app/api/services/[id]/fee-assignments/route";

const ctx = { params: Promise.resolve({ id: "svc-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  // withApiAuth checks the account is still active before running the
  // handler; without this every call falls through to a 403.
  prismaMock.user.findUnique.mockResolvedValue({ active: true } as never);
  mockSession({
    id: "u-1",
    name: "Jayden",
    role: "admin",
    serviceId: "svc-1",
  });
});

describe("GET — count mode", () => {
  it("returns one entry per (room, fee) from a single groupBy", async () => {
    prismaMock.childFeeAssignment.groupBy.mockResolvedValue([
      { sessionType: "asc", feeTierId: "fee-1", _count: { _all: 63 } },
      { sessionType: "asc", feeTierId: "fee-2", _count: { _all: 12 } },
    ] as never);

    const res = await GET(
      createRequest("GET", "http://x/api/services/svc-1/fee-assignments"),
      ctx as never,
    );
    const body = await res.json();

    expect(prismaMock.childFeeAssignment.groupBy).toHaveBeenCalledTimes(1);
    expect(body.counts).toEqual([
      { sessionType: "asc", feeTierId: "fee-1", count: 63 },
      { sessionType: "asc", feeTierId: "fee-2", count: 12 },
    ]);
  });

  it("scopes the count to this service", async () => {
    prismaMock.childFeeAssignment.groupBy.mockResolvedValue([] as never);
    await GET(
      createRequest("GET", "http://x/api/services/svc-1/fee-assignments"),
      ctx as never,
    );
    expect(prismaMock.childFeeAssignment.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { serviceId: "svc-1" } }),
    );
  });
});

describe("GET — detail mode", () => {
  it("lists the children on one fee", async () => {
    prismaMock.childFeeAssignment.findMany.mockResolvedValue([
      {
        id: "a-1",
        effectiveFrom: null,
        child: {
          id: "c-1",
          firstName: "Aisha",
          surname: "Khan",
          status: "active",
        },
      },
    ] as never);

    const res = await GET(
      createRequest("GET", "http://x/api/services/svc-1/fee-assignments?sessionType=asc&feeTierId=fee-1"),
      ctx as never,
    );
    const body = await res.json();

    expect(body.children).toEqual([
      {
        assignmentId: "a-1",
        childId: "c-1",
        name: "Aisha Khan",
        status: "active",
        effectiveFrom: null,
      },
    ]);
  });

  it("rejects an unknown room", async () => {
    const res = await GET(
        createRequest("GET", "http://x/api/services/svc-1/fee-assignments?sessionType=nursery&feeTierId=fee-1"),
        ctx as never,
    );
    expect(res.status).toBe(400);
  });
});

describe("GET — picker mode", () => {
  it("only offers children with no fee for that room", async () => {
    prismaMock.child.findMany.mockResolvedValue([
      { id: "c-2", firstName: "Omar", surname: "Ali" },
    ] as never);

    const res = await GET(
      createRequest("GET", "http://x/api/services/svc-1/fee-assignments?sessionType=asc&unassigned=1"),
      ctx as never,
    );
    const body = await res.json();

    expect(body.children).toEqual([{ childId: "c-2", name: "Omar Ali" }]);
    // The "none" filter is the whole point — a child already on a fee
    // for this room can't take a second one.
    expect(prismaMock.child.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          serviceId: "svc-1",
          status: "active",
          feeAssignments: { none: { sessionType: "asc" } },
        }),
      }),
    );
  });
});

describe("POST", () => {
  const body = {
    childId: "c-1",
    sessionType: "asc",
    feeTierId: "fee-1",
    feeName: "Recurring",
  };

  it("upserts on (child, room) so re-assigning moves rather than duplicates", async () => {
    prismaMock.child.findUnique.mockResolvedValue({
      id: "c-1",
      serviceId: "svc-1",
    } as never);
    prismaMock.childFeeAssignment.upsert.mockResolvedValue({
      id: "a-1",
      feeTierId: "fee-1",
      feeName: "Recurring",
    } as never);

    const res = await POST(
      createRequest("POST", "/api/services/svc-1/fee-assignments", { body }),
      ctx as never,
    );

    expect(res.status).toBe(201);
    expect(prismaMock.childFeeAssignment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          childId_sessionType: { childId: "c-1", sessionType: "asc" },
        },
      }),
    );
  });

  it("refuses a child that belongs to another service", async () => {
    // Without this check a child from another centre could be assigned a
    // fee here and would then be counted against this centre's matrix.
    prismaMock.child.findUnique.mockResolvedValue({
      id: "c-1",
      serviceId: "svc-OTHER",
    } as never);

    const res = await POST(
        createRequest("POST", "/api/services/svc-1/fee-assignments", { body }),
        ctx as never,
    );
    expect(res.status).toBe(404);
    expect(prismaMock.childFeeAssignment.upsert).not.toHaveBeenCalled();
  });

  it("refuses a child that does not exist", async () => {
    prismaMock.child.findUnique.mockResolvedValue(null as never);
    const res = await POST(
        createRequest("POST", "/api/services/svc-1/fee-assignments", { body }),
        ctx as never,
    );
    expect(res.status).toBe(404);
  });

  it("rejects a payload with no fee name", async () => {
    const res = await POST(
        createRequest("POST", "/api/services/svc-1/fee-assignments", {
          body: { ...body, feeName: "" },
        }),
        ctx as never,
    );
    expect(res.status).toBe(400);
  });
});

describe("DELETE", () => {
  it("removes an assignment belonging to this service", async () => {
    prismaMock.childFeeAssignment.findUnique.mockResolvedValue({
      serviceId: "svc-1",
    } as never);
    prismaMock.childFeeAssignment.delete.mockResolvedValue({} as never);

    const res = await DELETE(
      createRequest(
        "DELETE",
        "/api/services/svc-1/fee-assignments?assignmentId=a-1",
      ),
      ctx as never,
    );

    expect(res.status).toBe(200);
    expect(prismaMock.childFeeAssignment.delete).toHaveBeenCalledWith({
      where: { id: "a-1" },
    });
  });

  it("refuses to delete another service's assignment through this URL", async () => {
    prismaMock.childFeeAssignment.findUnique.mockResolvedValue({
      serviceId: "svc-OTHER",
    } as never);

    const res = await DELETE(
        createRequest(
          "DELETE",
          "/api/services/svc-1/fee-assignments?assignmentId=a-1",
        ),
        ctx as never,
    );
    expect(res.status).toBe(404);
    expect(prismaMock.childFeeAssignment.delete).not.toHaveBeenCalled();
  });

  it("requires an assignmentId", async () => {
    const res = await DELETE(
        createRequest("DELETE", "/api/services/svc-1/fee-assignments"),
        ctx as never,
    );
    expect(res.status).toBe(400);
  });
});
