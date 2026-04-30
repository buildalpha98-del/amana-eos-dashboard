import { describe, it, expect, beforeEach, vi } from "vitest";

// Auto-mock the prisma module via the shared helper (registers vi.mock for @/lib/prisma).
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";
import { ApiError } from "@/lib/api-error";

// Mock withParentAuth to inject a fake parent — preserve other exports so anything
// imported from this module still resolves.
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

// The POST handler's happy path fires a notification — stub it out.
vi.mock("@/lib/notifications/bookings", () => ({
  sendBookingRequestNotification: vi.fn().mockResolvedValue(undefined),
}));

// Mock logger so error paths don't spam test output.
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

import { POST } from "@/app/api/parent/bookings/route";

function postBody(body: unknown) {
  return createRequest("POST", "/api/parent/bookings", {
    body: body as Record<string, unknown>,
  });
}

const baseBooking = {
  childId: "c1",
  serviceId: "s1",
  date: "2026-04-24", // Friday
  sessionType: "bsc" as const,
};

const configuredSettings = {
  bsc: { enabled: true, fee: 40, spots: 2, cutOffHours: 12, days: ["mon", "tue", "wed", "thu", "fri"] },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-04-22T10:00:00.000Z"));
  prismaMock.child.findMany.mockResolvedValue([{ id: "c1" }]);
  prismaMock.service.findUnique.mockResolvedValue({
    id: "s1",
    bscCasualRate: 40,
    ascCasualRate: 45,
    vcDailyRate: 80,
    casualBookingSettings: configuredSettings,
  });
  prismaMock.booking.findUnique.mockResolvedValue(null);
  prismaMock.booking.count.mockResolvedValue(0);
  prismaMock.booking.create.mockResolvedValue({ id: "bk1" });
  prismaMock.centreContact.findFirst.mockResolvedValue(null);
});

describe("POST /api/parent/bookings — casual enforcement (4b)", () => {
  it("400 when service has no casualBookingSettings", async () => {
    prismaMock.service.findUnique.mockResolvedValue({
      id: "s1",
      bscCasualRate: 40,
      ascCasualRate: 45,
      vcDailyRate: 80,
      casualBookingSettings: null,
    });
    const res = await POST(postBody(baseBooking));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not configured/i);
  });

  it("400 when session type disabled", async () => {
    prismaMock.service.findUnique.mockResolvedValue({
      id: "s1",
      bscCasualRate: 40,
      ascCasualRate: 45,
      vcDailyRate: 80,
      casualBookingSettings: {
        bsc: { enabled: false, fee: 40, spots: 2, cutOffHours: 12, days: ["fri"] },
      },
    });
    const res = await POST(postBody(baseBooking));
    expect(res.status).toBe(400);
  });

  it("400 when day-of-week not allowed", async () => {
    prismaMock.service.findUnique.mockResolvedValue({
      id: "s1",
      bscCasualRate: 40,
      ascCasualRate: 45,
      vcDailyRate: 80,
      casualBookingSettings: {
        bsc: { enabled: true, fee: 40, spots: 2, cutOffHours: 12, days: ["mon"] },
      },
    });
    // 2026-04-24 is Friday
    const res = await POST(postBody(baseBooking));
    expect(res.status).toBe(400);
  });

  it("400 when inside cut-off window", async () => {
    vi.setSystemTime(new Date("2026-04-24T00:00:00.000Z")); // booking is same day
    const res = await POST(postBody(baseBooking));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/at least \d+ hours?/i);
  });

  it("400 when spots exhausted", async () => {
    prismaMock.booking.count.mockResolvedValue(2); // equals settings.spots
    const res = await POST(postBody(baseBooking));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no casual spots/i);
  });

  it("201 on valid booking", async () => {
    const res = await POST(postBody(baseBooking));
    expect(res.status).toBe(201);
    expect(prismaMock.booking.create).toHaveBeenCalled();
  });

  it("asserts Serializable isolation is requested on the transaction", async () => {
    await POST(postBody(baseBooking));
    const txCall = prismaMock.$transaction.mock.calls[0];
    const options = txCall[1];
    expect(options?.isolationLevel).toBe("Serializable");
  });

  it("race: two parallel POSTs for the last spot — exactly one 201, one 400 'no casual spots'", async () => {
    // Simulate the race: first transaction sees 1 existing booking (can proceed),
    // second transaction sees 2 (the pre-existing one + the one tx1 just created).
    let callCount = 0;
    prismaMock.booking.count.mockImplementation(async () => {
      callCount += 1;
      return callCount === 1 ? 1 : 2;
    });
    const [resA, resB] = await Promise.all([
      POST(postBody(baseBooking)),
      POST(postBody(baseBooking)),
    ]);
    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 400]);
    const loser = resA.status === 400 ? resA : resB;
    expect((await loser.json()).error).toMatch(/no casual spots/i);
  });
});
