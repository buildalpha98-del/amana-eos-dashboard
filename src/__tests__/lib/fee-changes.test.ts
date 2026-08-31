/**
 * Applying scheduled fee changes.
 *
 * These decide what families are charged, so the tests pin the failure
 * modes that would cost money: a change applied early, a missed day
 * dropping a change forever, a re-run charging twice, and a deleted fee
 * being resurrected by a change scheduled against it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { applyDueFeeChanges, todayUtc } from "@/lib/fee-changes";

type Any = ReturnType<typeof vi.fn>;

function makePrisma(opts: {
  due: unknown[];
  sessionTimes: unknown;
}) {
  const serviceUpdate = vi.fn().mockResolvedValue({});
  const changeUpdateMany = vi.fn().mockResolvedValue({});
  const tx = {
    service: {
      findUnique: vi.fn().mockResolvedValue({ sessionTimes: opts.sessionTimes }),
      update: serviceUpdate,
    },
    serviceFeeChange: { updateMany: changeUpdateMany },
  };
  const prisma = {
    serviceFeeChange: {
      findMany: vi.fn().mockResolvedValue(opts.due),
    },
    $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  };
  return { prisma, serviceUpdate, changeUpdateMany };
}

const change = (over: Record<string, unknown> = {}) => ({
  id: "fc-1",
  serviceId: "svc-1",
  sessionType: "asc",
  feeTierId: "fee-1",
  feeName: "Casual",
  toAmountCents: 4500,
  toCasualCents: null,
  toStaffCents: null,
  effectiveDate: new Date("2026-08-01T00:00:00Z"),
  ...over,
});

const times = () => ({
  asc: {
    start: "15:00",
    end: "18:30",
    fees: [{ id: "fee-1", name: "Casual", amountCents: 4168 }],
  },
});

describe("todayUtc", () => {
  it("is UTC midnight, matching how @db.Date is stored", () => {
    const d = todayUtc(new Date("2026-08-06T13:45:00Z"));
    expect(d.toISOString()).toBe("2026-08-06T00:00:00.000Z");
  });
});

describe("applyDueFeeChanges", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes the new rate onto the room's fee", async () => {
    const { prisma, serviceUpdate, changeUpdateMany } = makePrisma({
      due: [change()],
      sessionTimes: times(),
    });
    const res = await applyDueFeeChanges(prisma as never, {
      now: new Date("2026-08-02T00:00:00Z"),
    });
    expect(res.applied).toBe(1);
    const written = serviceUpdate.mock.calls[0][0].data.sessionTimes;
    expect(written.asc.fees[0].amountCents).toBe(4500);
    // Marked applied in the SAME transaction, so a re-run is a no-op.
    expect(changeUpdateMany.mock.calls[0][0].data.status).toBe("applied");
  });

  it("asks for changes due on or BEFORE today, not exactly today", async () => {
    // A cron that fails on the 10th must still apply the 10th's change
    // on the 11th. Matching only today would drop it forever.
    const { prisma } = makePrisma({ due: [], sessionTimes: times() });
    await applyDueFeeChanges(prisma as never, {
      now: new Date("2026-08-06T09:00:00Z"),
    });
    const where = (prisma.serviceFeeChange.findMany as Any).mock.calls[0][0]
      .where;
    expect(where.status).toBe("scheduled");
    expect(where.effectiveDate).toEqual({
      lte: new Date("2026-08-06T00:00:00.000Z"),
    });
  });

  it("does nothing when nothing is due", async () => {
    const { prisma, serviceUpdate } = makePrisma({
      due: [],
      sessionTimes: times(),
    });
    const res = await applyDueFeeChanges(prisma as never);
    expect(res).toEqual({ applied: 0, cancelled: 0, services: 0 });
    expect(serviceUpdate).not.toHaveBeenCalled();
  });

  it("cancels rather than resurrects a change for a deleted fee", async () => {
    const { prisma, serviceUpdate, changeUpdateMany } = makePrisma({
      due: [change({ feeTierId: "fee-gone" })],
      sessionTimes: times(),
    });
    const res = await applyDueFeeChanges(prisma as never, {
      now: new Date("2026-08-02T00:00:00Z"),
    });
    expect(res.cancelled).toBe(1);
    expect(res.applied).toBe(0);
    // The centre deleted that fee on purpose; re-creating it would be
    // us overruling them.
    expect(serviceUpdate).not.toHaveBeenCalled();
    expect(changeUpdateMany.mock.calls[0][0].data.status).toBe("cancelled");
  });

  it("applies casual and staff rates only when the change carries them", async () => {
    const { prisma, serviceUpdate } = makePrisma({
      due: [change({ toCasualCents: 5000, toStaffCents: null })],
      sessionTimes: times(),
    });
    await applyDueFeeChanges(prisma as never, {
      now: new Date("2026-08-02T00:00:00Z"),
    });
    const fee = serviceUpdate.mock.calls[0][0].data.sessionTimes.asc.fees[0];
    expect(fee.casualAmountCents).toBe(5000);
    // Null means "not part of this change", not "clear it".
    expect(fee.staffAmountCents).toBeUndefined();
  });

  it("groups a service's changes into one write", async () => {
    // Two changes to the same room on the same day must not overwrite
    // each other with a stale copy of sessionTimes.
    const { prisma, serviceUpdate } = makePrisma({
      due: [
        change({ id: "a", feeTierId: "fee-1", toAmountCents: 4500 }),
        change({ id: "b", feeTierId: "fee-2", toAmountCents: 9900 }),
      ],
      sessionTimes: {
        asc: {
          start: "15:00",
          end: "18:30",
          fees: [
            { id: "fee-1", name: "Casual", amountCents: 4168 },
            { id: "fee-2", name: "Recurring", amountCents: 3647 },
          ],
        },
      },
    });
    const res = await applyDueFeeChanges(prisma as never, {
      now: new Date("2026-08-02T00:00:00Z"),
    });
    expect(res.applied).toBe(2);
    expect(serviceUpdate).toHaveBeenCalledTimes(1);
    const fees = serviceUpdate.mock.calls[0][0].data.sessionTimes.asc.fees;
    expect(fees.find((f: { id: string }) => f.id === "fee-1").amountCents).toBe(4500);
    expect(fees.find((f: { id: string }) => f.id === "fee-2").amountCents).toBe(9900);
  });
});
