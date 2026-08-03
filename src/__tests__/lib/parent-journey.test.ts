/**
 * Portal families entering the existing nurture flow.
 *
 * The two failure modes worth guarding: re-scheduling on every draft
 * autosave (which would spam a family), and walking someone BACKWARDS
 * into the nudge sequence after they've already been approved.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    parentEnquiry: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const schedule = vi.fn(async () => {});
vi.mock("@/lib/nurture-scheduler", () => ({
  scheduleNurtureFromStageChange: (...a: unknown[]) => schedule(...(a as [])),
}));

import { prisma } from "@/lib/prisma";
import { syncParentJourney } from "@/lib/parent-journey";

const mockPrisma = prisma as unknown as {
  parentEnquiry: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

describe("syncParentJourney", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.parentEnquiry.create.mockResolvedValue({ id: "enq-new" });
    mockPrisma.parentEnquiry.update.mockResolvedValue({ id: "enq-1" });
  });

  it("does nothing before a service is known", async () => {
    // A family who hasn't picked a school yet has no centre to be
    // emailed from — that's the normal early state, not a failure.
    await syncParentJourney({
      email: "jane@example.com",
      serviceId: null,
      stage: "form_started",
    });
    expect(mockPrisma.parentEnquiry.create).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  it("does nothing without an email", async () => {
    await syncParentJourney({
      email: null,
      serviceId: "svc-1",
      stage: "form_started",
    });
    expect(mockPrisma.parentEnquiry.create).not.toHaveBeenCalled();
  });

  it("creates an enquiry and schedules the stage's sequence", async () => {
    mockPrisma.parentEnquiry.findFirst.mockResolvedValue(null);
    await syncParentJourney({
      email: "  Jane@Example.COM ",
      serviceId: "svc-1",
      stage: "form_started",
      parentName: "Jane Doe",
      childName: "Billy Doe",
    });

    expect(mockPrisma.parentEnquiry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          // Lowercased, or the contact lookup in the scheduler misses.
          parentEmail: "jane@example.com",
          serviceId: "svc-1",
          stage: "form_started",
          channel: "portal",
          formStarted: true,
          formCompleted: false,
        }),
      }),
    );
    expect(schedule).toHaveBeenCalledWith("enq-new", "form_started");
  });

  it("is idempotent — a repeat autosave does not re-schedule", async () => {
    mockPrisma.parentEnquiry.findFirst.mockResolvedValue({
      id: "enq-1",
      stage: "form_started",
      firstSessionDate: null,
    });
    await syncParentJourney({
      email: "jane@example.com",
      serviceId: "svc-1",
      stage: "form_started",
    });
    // Autosave fires on every keystroke batch. Re-scheduling here would
    // send the family the same nudge repeatedly.
    expect(schedule).not.toHaveBeenCalled();
  });

  it("never walks a family backwards into the nudges", async () => {
    mockPrisma.parentEnquiry.findFirst.mockResolvedValue({
      id: "enq-1",
      stage: "first_session",
      firstSessionDate: new Date("2026-09-01"),
    });
    await syncParentJourney({
      email: "jane@example.com",
      serviceId: "svc-1",
      stage: "form_started",
    });
    expect(schedule).not.toHaveBeenCalled();
  });

  it("advances an existing enquiry and schedules onboarding", async () => {
    mockPrisma.parentEnquiry.findFirst.mockResolvedValue({
      id: "enq-1",
      stage: "form_started",
      firstSessionDate: null,
    });
    const start = new Date("2026-09-01T00:00:00.000Z");
    await syncParentJourney({
      email: "jane@example.com",
      serviceId: "svc-1",
      stage: "first_session",
      firstSessionDate: start,
    });

    expect(mockPrisma.parentEnquiry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "enq-1" },
        data: expect.objectContaining({
          stage: "first_session",
          // Anchors the day-before reminder and the day-1/day-3 check-ins.
          firstSessionDate: start,
          formCompleted: true,
        }),
      }),
    );
    expect(schedule).toHaveBeenCalledWith("enq-1", "first_session");
  });

  it("never lets a marketing failure escape to the caller", async () => {
    // This runs inside enrolment submission and approval. A broken
    // sequence must not fail a family's enrolment.
    mockPrisma.parentEnquiry.findFirst.mockRejectedValue(new Error("db down"));
    await expect(
      syncParentJourney({
        email: "jane@example.com",
        serviceId: "svc-1",
        stage: "form_started",
      }),
    ).resolves.toBeUndefined();
  });
});
