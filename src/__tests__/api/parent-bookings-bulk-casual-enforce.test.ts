import { describe, it, expect, beforeEach, vi } from "vitest";

import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";
import { ApiError } from "@/lib/api-error";

vi.mock("@/lib/parent-auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/parent-auth")>(
    "@/lib/parent-auth",
  );
  return {
    ...actual,
    withParentAuth: (
      handler: (req: unknown, ctx: { parent: { email: string; enrolmentIds: string[] } }) => Promise<Response>,
    ) =>
      async (req: unknown) => {
        try {
          return await handler(req, { parent: { email: "p1@x.test", enrolmentIds: ["enr1"] } });
        } catch (err) {
          if (err instanceof ApiError) {
            return new Response(
              JSON.stringify({
                error: err.message,
                ...(err.details != null ? { details: err.details } : {}),
              }),
              { status: err.status, headers: { "content-type": "application/json" } },
            );
          }
          throw err;
        }
      },
  };
});

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

import { POST } from "@/app/api/parent/bookings/bulk/route";

function post(body: unknown) {
  return createRequest("POST", "/api/parent/bookings/bulk", {
    body: body as Record<string, unknown>,
  });
}

const configuredSettings = {
  bsc: { enabled: true, fee: 40, spots: 2, cutOffHours: 12, days: ["mon", "tue", "wed", "thu", "fri"] },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-04-22T10:00:00.000Z"));
  prismaMock.child.findUnique.mockResolvedValue({ enrolmentId: "enr1" });
  prismaMock.service.findUnique.mockResolvedValue({
    id: "s1",
    casualBookingSettings: configuredSettings,
  });
  prismaMock.booking.findUnique.mockResolvedValue(null);
  prismaMock.booking.count.mockResolvedValue(0);
  prismaMock.booking.create.mockImplementation(async () => ({ id: `bk-${Math.random()}` }));
});

describe("POST /api/parent/bookings/bulk — casual enforcement (4b)", () => {
  it("201 when all items pass enforcement — body echoes count", async () => {
    const res = await POST(
      post({
        childId: "c1",
        serviceId: "s1",
        bookings: [
          { date: "2026-04-24", sessionType: "bsc" }, // Fri
          { date: "2026-04-27", sessionType: "bsc" }, // Mon
        ],
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.created).toBe(2);
    expect(body.requested).toBe(2);
    expect(body.skipped).toBe(0);
    expect(prismaMock.booking.create).toHaveBeenCalledTimes(2);
  });

  it("400 rolls back the whole batch when any item fails (message cites index)", async () => {
    // First item valid Friday; second item is Saturday (not in days[]).
    const res = await POST(
      post({
        childId: "c1",
        serviceId: "s1",
        bookings: [
          { date: "2026-04-24", sessionType: "bsc" }, // Fri — ok
          { date: "2026-04-25", sessionType: "bsc" }, // Sat — fails day-of-week
        ],
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/^Booking 2:/);
    expect(body.error).toMatch(/not available on/i);
  });

  it("400 when service has no casualBookingSettings", async () => {
    prismaMock.service.findUnique.mockResolvedValue({
      id: "s1",
      casualBookingSettings: null,
    });
    const res = await POST(
      post({
        childId: "c1",
        serviceId: "s1",
        bookings: [{ date: "2026-04-24", sessionType: "bsc" }],
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not configured/i);
  });

  it("400 when spots exhausted for one of the items", async () => {
    prismaMock.booking.count.mockResolvedValue(2); // full for every date
    const res = await POST(
      post({
        childId: "c1",
        serviceId: "s1",
        bookings: [{ date: "2026-04-24", sessionType: "bsc" }],
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no casual spots/i);
  });

  it("201 with skipped=1 when one item is a duplicate (findUnique returns existing row)", async () => {
    // First item's date (2026-04-24) returns a duplicate; second item (2026-04-27) is new.
    prismaMock.booking.findUnique.mockImplementation(async (args: any) => {
      const date: Date = args?.where?.childId_serviceId_date_sessionType?.date;
      if (date instanceof Date && date.toISOString().startsWith("2026-04-24")) {
        return { id: "existing-bk" };
      }
      return null;
    });

    const res = await POST(
      post({
        childId: "c1",
        serviceId: "s1",
        bookings: [
          { date: "2026-04-24", sessionType: "bsc" }, // Fri — duplicate, skipped
          { date: "2026-04-27", sessionType: "bsc" }, // Mon — created
        ],
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.requested).toBe(2);
    expect(body.created).toBe(1);
    expect(body.skipped).toBe(1);
    expect(prismaMock.booking.create).toHaveBeenCalledTimes(1);
  });

  it("asserts Serializable isolation is requested on the transaction", async () => {
    await POST(
      post({
        childId: "c1",
        serviceId: "s1",
        bookings: [{ date: "2026-04-24", sessionType: "bsc" }],
      }),
    );
    const txCall = prismaMock.$transaction.mock.calls[0];
    const options = txCall[1];
    expect(options?.isolationLevel).toBe("Serializable");
  });
});
