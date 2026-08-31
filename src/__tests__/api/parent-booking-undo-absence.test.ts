/**
 * A family changing their mind about an absence.
 *
 * Marking a child absent was a one-way tap: to undo it you had to ring
 * the centre. Now it's reversible up to 24 hours before the session —
 * the same window that governs cancelling a casual booking, because
 * after that the centre has staffed and catered to the number.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    booking: { findUnique: vi.fn(), update: vi.fn() },
    service: { findUnique: vi.fn() },
    // Stage 1: absence.create resolves a required roomId.
    room: {
      findUnique: vi.fn().mockResolvedValue({ id: "room-test", legacyKey: "asc" }),
      findMany: vi.fn().mockResolvedValue([{ id: "room-asc", legacyKey: "asc" }]),
    },
    absence: { create: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/parent-auth", () => ({
  withParentAuth:
    (
      handler: (
        req: Request,
        ctx: {
          parent: { email: string; enrolmentIds: string[] };
          params: Promise<{ bookingId: string }>;
        },
      ) => Promise<Response>,
    ) =>
    async (req: Request, ctx: { params: Promise<{ bookingId: string }> }) => {
      try {
        return await handler(req, {
          parent: { email: "jane@example.com", enrolmentIds: ["enr-1"] },
          params: ctx.params,
        });
      } catch (err) {
        return Response.json(
          { error: (err as Error)?.message ?? "Error" },
          { status: (err as { status?: number })?.status ?? 500 },
        );
      }
    },
}));

// Returns a SET — the route calls .has() on it.
vi.mock("@/app/api/parent/bookings/route", () => ({
  getParentChildIds: vi.fn(async () => new Set(["child-1"])),
}));

import { prisma } from "@/lib/prisma";
import { PATCH, DELETE } from "@/app/api/parent/bookings/[bookingId]/route";

const mockPrisma = prisma as unknown as {
  booking: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  absence: { create: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
  service: { findUnique: ReturnType<typeof vi.fn> };
};

const mockService = mockPrisma.service;

const inHours = (h: number) => new Date(Date.now() + h * 60 * 60 * 1000);

function booking(over: Record<string, unknown> = {}) {
  return {
    id: "bk-1",
    childId: "child-1",
    serviceId: "svc-1",
    sessionType: "asc",
    type: "permanent",
    status: "absent_notified",
    date: inHours(72),
    ...over,
  };
}

const call = (body: unknown) =>
  PATCH(
    new Request("http://localhost/api/parent/bookings/bk-1", {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }) as never,
    { params: Promise.resolve({ bookingId: "bk-1" }) } as never,
  );

describe("PATCH /api/parent/bookings/[bookingId] — action: attending", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (ops: unknown[]) =>
      Promise.all(ops as Promise<unknown>[]),
    );
    mockPrisma.booking.update.mockResolvedValue({ id: "bk-1", status: "confirmed" });
    mockPrisma.absence.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("restores the booking AND clears the absence together", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(booking());
    const res = await call({ action: "attending" });
    expect(res.status).toBe(200);

    expect(mockPrisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "confirmed" } }),
    );
    // A lingering absence row would keep the child off the roll while
    // the booking said they were coming.
    expect(mockPrisma.absence.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ childId: "child-1", sessionType: "asc" }),
      }),
    );
  });

  it("refuses inside 24 hours, and says what to do instead", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(booking({ date: inHours(5) }));
    const res = await call({ action: "attending" });
    expect(res.status).toBe(400);
    // Same-day changes go to the centre, not the enrolments inbox —
    // it's "she's coming after all", not an enrolment change.
    expect((await res.json()).error).toMatch(/head office/i);
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });

  it("allows it right at the edge of the window", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(booking({ date: inHours(25) }));
    expect((await call({ action: "attending" })).status).toBe(200);
  });

  it("says so when the session is already attending", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(
      booking({ status: "confirmed" }),
    );
    const res = await call({ action: "attending" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/already marked as attending/i);
  });

  it("won't revive a cancelled booking", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(
      booking({ status: "cancelled" }),
    );
    expect((await call({ action: "attending" })).status).toBe(400);
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });

  it("still marks absent when no action is given", async () => {
    // The app has posted a bare { isIllness, notes } body since this
    // route existed; adding `action` must not break those callers.
    mockPrisma.booking.findUnique.mockResolvedValue(
      booking({ status: "confirmed" }),
    );
    mockPrisma.absence.create.mockResolvedValue({ id: "abs-1" });
    mockPrisma.booking.update.mockResolvedValue({ id: "bk-1", status: "absent_notified" });

    const res = await call({ isIllness: true, notes: "Fever" });
    expect(res.status).toBe(200);
    expect(mockPrisma.absence.create).toHaveBeenCalled();
  });
});

describe("DELETE /api/parent/bookings/[bookingId] — cancellation windows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.booking.update.mockResolvedValue({ id: "bk-1", status: "cancelled" });
    mockService.findUnique.mockResolvedValue({ casualBookingSettings: null });
  });

  const del = () =>
    DELETE(
      new Request("http://localhost/api/parent/bookings/bk-1", {
        method: "DELETE",
      }) as never,
      { params: Promise.resolve({ bookingId: "bk-1" }) } as never,
    );

  // 2026-08-06: recurring bookings are no longer cancellable online at
  // ANY notice. "Not this Tuesday" is marking the child not attending,
  // which keeps the place; "change our days" is an enrolment change with
  // fee and CCS consequences. The old seven-day window let the first
  // case silently drop a permanent place.
  it.each([
    ["a week out", 8 * 24],
    ["inside the week", 3 * 24],
    ["months away", 90 * 24],
  ])("refuses a recurring booking %s", async (_label, hours) => {
    mockPrisma.booking.findUnique.mockResolvedValue(
      booking({ type: "permanent", status: "confirmed", date: inHours(hours) }),
    );
    const res = await del();
    expect(res.status).toBe(400);
    const error = (await res.json()).error;
    // Both doors named: keep the place, or change the pattern.
    expect(error).toMatch(/not attending/i);
    expect(error).toMatch(/enrolments@amanaoshc\.com\.au/i);
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });

  it("keeps the 24-hour window for casual", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(
      booking({ type: "casual", status: "confirmed", date: inHours(48) }),
    );
    expect((await del()).status).toBe(200);
  });

  it("blocks casual entirely when the centre has switched it off", async () => {
    mockService.findUnique.mockResolvedValue({
      casualBookingSettings: { policy: { blockCasualCancellation: true } },
    });
    mockPrisma.booking.findUnique.mockResolvedValue(
      booking({ type: "casual", status: "confirmed", date: inHours(200) }),
    );
    const res = await del();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/enrolments@amanaoshc\.com\.au/i);
  });
});
