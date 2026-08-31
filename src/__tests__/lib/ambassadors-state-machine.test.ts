import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import {
  canTransition,
  transitionAmbassadorRecord,
} from "@/lib/ambassadors/state-machine";
import { _clearAmbassadorCourseCache } from "@/lib/ambassadors/lms-gate";

function mockRecord(overrides: Record<string, unknown> = {}) {
  prismaMock.ambassadorEnrolment.findUnique.mockResolvedValue({
    id: "rec-1",
    status: "logged",
    qualified: true,
    attributionConflict: false,
    creditedEducatorId: "u-aisha",
    creditedEducator: { name: "Aisha Rahman" },
    regularSessionsPerWeek: 3,
    incentiveAmount: 50,
    ...overrides,
  });
}

function mockCourseCompleted(completed: boolean) {
  prismaMock.lMSCourse.findFirst.mockResolvedValue({ id: "course-1" });
  prismaMock.lMSEnrollment.findUnique.mockResolvedValue(
    completed ? { status: "completed" } : { status: "in_progress" },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  _clearAmbassadorCourseCache();
  prismaMock.ambassadorEnrolment.update.mockResolvedValue({});
  prismaMock.ambassadorTransition.create.mockResolvedValue({});
  mockCourseCompleted(true);
});

describe("canTransition", () => {
  it("encodes the forward path and rejects everything else", () => {
    expect(canTransition("logged", "director_verified")).toBe(true);
    expect(canTransition("director_verified", "sm_approved")).toBe(true);
    expect(canTransition("sm_approved", "sent_to_payroll")).toBe(true);
    expect(canTransition("sent_to_payroll", "paid")).toBe(true);
    expect(canTransition("rejected", "logged")).toBe(true);

    expect(canTransition("logged", "sm_approved")).toBe(false);
    expect(canTransition("logged", "paid")).toBe(false);
    expect(canTransition("sent_to_payroll", "logged")).toBe(false);
    expect(canTransition("paid", "sent_to_payroll")).toBe(false);
  });
});

describe("transitionAmbassadorRecord", () => {
  it("rejects an illegal jump", async () => {
    mockRecord({ status: "logged" });
    await expect(
      transitionAmbassadorRecord({ recordId: "rec-1", to: "paid", actorId: "u-admin" }),
    ).rejects.toThrow(/Cannot move/);
  });

  it("requires a reason to reject", async () => {
    mockRecord();
    await expect(
      transitionAmbassadorRecord({ recordId: "rec-1", to: "rejected", actorId: "u-dir" }),
    ).rejects.toThrow(/reason is required/i);
  });

  it("blocks verification while an attribution conflict is open", async () => {
    mockRecord({ attributionConflict: true });
    await expect(
      transitionAmbassadorRecord({
        recordId: "rec-1",
        to: "director_verified",
        actorId: "u-dir",
      }),
    ).rejects.toThrow(/attribution conflict/i);
  });

  it("blocks verifying a credited record without sessions per week", async () => {
    mockRecord({ regularSessionsPerWeek: null });
    await expect(
      transitionAmbassadorRecord({
        recordId: "rec-1",
        to: "director_verified",
        actorId: "u-dir",
      }),
    ).rejects.toThrow(/sessions per week/i);
  });

  it("allows verifying an UNATTRIBUTED record without sessions per week", async () => {
    mockRecord({ creditedEducatorId: null, creditedEducator: null, regularSessionsPerWeek: null });
    await expect(
      transitionAmbassadorRecord({
        recordId: "rec-1",
        to: "director_verified",
        actorId: "u-dir",
      }),
    ).resolves.toBeUndefined();
  });

  it("blocks approval of an unqualified record", async () => {
    mockRecord({ status: "director_verified", qualified: false });
    await expect(
      transitionAmbassadorRecord({ recordId: "rec-1", to: "sm_approved", actorId: "u-sm" }),
    ).rejects.toThrow(/not qualified/i);
  });

  it("LMS hard gate: blocks sent_to_payroll for a non-completer, with the educator named", async () => {
    mockRecord({ status: "sm_approved" });
    mockCourseCompleted(false);
    await expect(
      transitionAmbassadorRecord({
        recordId: "rec-1",
        to: "sent_to_payroll",
        actorId: "u-admin",
      }),
    ).rejects.toThrow(
      /Aisha Rahman has not completed the Amana Ambassadors course/,
    );
  });

  it("LMS gate does not block a $0 unattributed record", async () => {
    mockRecord({
      status: "sm_approved",
      creditedEducatorId: null,
      creditedEducator: null,
      incentiveAmount: 0,
    });
    mockCourseCompleted(false);
    await expect(
      transitionAmbassadorRecord({
        recordId: "rec-1",
        to: "sent_to_payroll",
        actorId: "u-admin",
      }),
    ).resolves.toBeUndefined();
  });

  it("writes the audit row and stamps timestamps on the happy path", async () => {
    mockRecord({ status: "sm_approved" });
    await transitionAmbassadorRecord({
      recordId: "rec-1",
      to: "sent_to_payroll",
      actorId: "u-admin",
    });
    expect(prismaMock.ambassadorEnrolment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "sent_to_payroll",
          sentToPayrollAt: expect.any(Date),
        }),
      }),
    );
    expect(prismaMock.ambassadorTransition.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fromStatus: "sm_approved",
          toStatus: "sent_to_payroll",
          actorId: "u-admin",
        }),
      }),
    );
  });
});
