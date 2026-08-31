import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { recomputeAmbassadorRecord } from "@/lib/ambassadors/recompute";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const PAID_4 = [
  { date: d("2026-08-17"), fee: 0 }, // free first session
  { date: d("2026-08-19"), fee: 25 },
  { date: d("2026-08-21"), fee: 25 },
  { date: d("2026-08-24"), fee: 25 },
  { date: d("2026-08-26"), fee: 25 },
];

function mockRecord(overrides: Record<string, unknown> = {}) {
  prismaMock.ambassadorEnrolment.findUnique.mockResolvedValue({
    id: "rec-1",
    pilotId: "pilot-1",
    status: "logged",
    newChildStatus: "new_child",
    regularSessionsPerWeek: 3,
    creditedEducatorId: "u-aisha",
    attributionConflict: false,
    qualifiedAt: null,
    sessions: PAID_4,
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.ambassadorEnrolment.update.mockResolvedValue({});
  prismaMock.ambassadorEnrolment.count.mockResolvedValue(1);
  prismaMock.ambassadorAdjustment.findUnique.mockResolvedValue(null);
});

function updatedData() {
  return prismaMock.ambassadorEnrolment.update.mock.calls[0][0].data;
}

describe("recomputeAmbassadorRecord", () => {
  it("derives window fields and qualifies a new child with 4 paid sessions", async () => {
    mockRecord();
    await recomputeAmbassadorRecord("rec-1");
    const data = updatedData();
    expect(data.firstAttendanceDate.toISOString()).toBe(d("2026-08-17").toISOString());
    expect(data.paidSessionsAttended).toBe(4);
    expect(data.qualified).toBe(true);
    expect(data.tierAmount).toBe(50);
    expect(data.incentiveAmount).toBe(50);
    expect(data.qualifiedAt).toBeInstanceOf(Date);
  });

  it("does not qualify when the new-child check is uncertain", async () => {
    mockRecord({ newChildStatus: "uncertain" });
    await recomputeAmbassadorRecord("rec-1");
    expect(updatedData().qualified).toBe(false);
    expect(updatedData().incentiveAmount).toBe(0);
  });

  it("qualified but UNATTRIBUTED pays $0 (still counts toward target)", async () => {
    mockRecord({ creditedEducatorId: null });
    await recomputeAmbassadorRecord("rec-1");
    expect(updatedData().qualified).toBe(true);
    expect(updatedData().incentiveAmount).toBe(0);
  });

  it("qualified + credited but sessions/week unset → incentive null (not assessable)", async () => {
    mockRecord({ regularSessionsPerWeek: null });
    await recomputeAmbassadorRecord("rec-1");
    expect(updatedData().tierAmount).toBeNull();
    expect(updatedData().incentiveAmount).toBeNull();
  });

  it("1–2 sessions per week computes the $30 tier", async () => {
    mockRecord({ regularSessionsPerWeek: 2 });
    await recomputeAmbassadorRecord("rec-1");
    expect(updatedData().tierAmount).toBe(30);
    expect(updatedData().incentiveAmount).toBe(30);
  });

  it("skips records already sent to payroll (numbers are frozen)", async () => {
    mockRecord({ status: "sent_to_payroll" });
    await recomputeAmbassadorRecord("rec-1");
    expect(prismaMock.ambassadorEnrolment.update).not.toHaveBeenCalled();
  });

  it("creates the $100 milestone kicker at 5 qualified enrolments (idempotent)", async () => {
    mockRecord();
    prismaMock.ambassadorEnrolment.count.mockResolvedValue(5);
    await recomputeAmbassadorRecord("rec-1");
    expect(prismaMock.ambassadorAdjustment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          educatorId: "u-aisha",
          type: "milestone_kicker",
          amount: 100,
        }),
      }),
    );

    // Second run with the adjustment already present: no duplicate.
    vi.clearAllMocks();
    mockRecord();
    prismaMock.ambassadorEnrolment.update.mockResolvedValue({});
    prismaMock.ambassadorEnrolment.count.mockResolvedValue(5);
    prismaMock.ambassadorAdjustment.findUnique.mockResolvedValue({
      id: "adj-1",
      sentToPayrollAt: null,
    });
    await recomputeAmbassadorRecord("rec-1");
    expect(prismaMock.ambassadorAdjustment.create).not.toHaveBeenCalled();
  });

  it("removes an unpaid kicker when the count drops below 5, keeps a paid one", async () => {
    mockRecord();
    prismaMock.ambassadorEnrolment.count.mockResolvedValue(4);
    prismaMock.ambassadorAdjustment.findUnique.mockResolvedValue({
      id: "adj-1",
      sentToPayrollAt: null,
    });
    await recomputeAmbassadorRecord("rec-1");
    expect(prismaMock.ambassadorAdjustment.delete).toHaveBeenCalledWith({
      where: { id: "adj-1" },
    });

    vi.clearAllMocks();
    mockRecord();
    prismaMock.ambassadorEnrolment.update.mockResolvedValue({});
    prismaMock.ambassadorEnrolment.count.mockResolvedValue(4);
    prismaMock.ambassadorAdjustment.findUnique.mockResolvedValue({
      id: "adj-1",
      sentToPayrollAt: d("2026-09-01"),
    });
    await recomputeAmbassadorRecord("rec-1");
    expect(prismaMock.ambassadorAdjustment.delete).not.toHaveBeenCalled();
  });
});
