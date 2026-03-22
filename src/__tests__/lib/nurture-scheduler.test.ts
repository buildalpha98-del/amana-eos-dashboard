import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "test-req-id",
}));

import { scheduleNurtureFromStageChange } from "@/lib/nurture-scheduler";
import { logger } from "@/lib/logger";

const NOW = new Date("2026-03-22T10:00:00Z");

describe("scheduleNurtureFromStageChange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(NOW);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("returns early if enquiry not found", async () => {
    prismaMock.parentEnquiry.findUnique.mockResolvedValue(null);

    await scheduleNurtureFromStageChange("missing-id", "info_sent");

    expect(prismaMock.centreContact.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.parentNurtureStep.upsert).not.toHaveBeenCalled();
  });

  it("returns early if enquiry has no parentEmail", async () => {
    prismaMock.parentEnquiry.findUnique.mockResolvedValue({
      id: "enq-1",
      serviceId: "svc-1",
      parentEmail: null,
      firstSessionDate: null,
    });

    await scheduleNurtureFromStageChange("enq-1", "info_sent");

    expect(prismaMock.centreContact.findFirst).not.toHaveBeenCalled();
  });

  it("returns early if no matching contact found", async () => {
    prismaMock.parentEnquiry.findUnique.mockResolvedValue({
      id: "enq-1",
      serviceId: "svc-1",
      parentEmail: "parent@test.com",
      firstSessionDate: null,
    });
    prismaMock.centreContact.findFirst.mockResolvedValue(null);

    await scheduleNurtureFromStageChange("enq-1", "info_sent");

    expect(prismaMock.parentNurtureStep.upsert).not.toHaveBeenCalled();
  });

  it("returns early for unknown stage (no steps created)", async () => {
    prismaMock.parentEnquiry.findUnique.mockResolvedValue({
      id: "enq-1",
      serviceId: "svc-1",
      parentEmail: "parent@test.com",
      firstSessionDate: null,
    });
    prismaMock.centreContact.findFirst.mockResolvedValue({ id: "contact-1" });

    await scheduleNurtureFromStageChange("enq-1", "unknown_stage");

    expect(prismaMock.parentNurtureStep.upsert).not.toHaveBeenCalled();
  });

  it("creates 2 legacy steps for info_sent stage", async () => {
    prismaMock.parentEnquiry.findUnique.mockResolvedValue({
      id: "enq-1",
      serviceId: "svc-1",
      parentEmail: "parent@test.com",
      firstSessionDate: null,
    });
    prismaMock.centreContact.findFirst.mockResolvedValue({ id: "contact-1" });
    prismaMock.parentNurtureStep.upsert.mockResolvedValue({});
    prismaMock.sequence.findMany.mockResolvedValue([]);

    await scheduleNurtureFromStageChange("enq-1", "info_sent");

    expect(prismaMock.parentNurtureStep.upsert).toHaveBeenCalledTimes(2);

    const calls = prismaMock.parentNurtureStep.upsert.mock.calls;
    const templateKeys = calls.map((c: unknown[]) => (c[0] as Record<string, unknown>).create).map((c: Record<string, unknown>) => c.templateKey);
    expect(templateKeys).toContain("ccs_assist");
    expect(templateKeys).toContain("nudge_1");
  });

  it("creates 2 legacy steps for nurturing stage", async () => {
    prismaMock.parentEnquiry.findUnique.mockResolvedValue({
      id: "enq-1",
      serviceId: "svc-1",
      parentEmail: "parent@test.com",
      firstSessionDate: null,
    });
    prismaMock.centreContact.findFirst.mockResolvedValue({ id: "contact-1" });
    prismaMock.parentNurtureStep.upsert.mockResolvedValue({});
    prismaMock.sequence.findMany.mockResolvedValue([]);

    await scheduleNurtureFromStageChange("enq-1", "nurturing");

    expect(prismaMock.parentNurtureStep.upsert).toHaveBeenCalledTimes(2);
  });

  it("creates 1 legacy step for form_started stage", async () => {
    prismaMock.parentEnquiry.findUnique.mockResolvedValue({
      id: "enq-1",
      serviceId: "svc-1",
      parentEmail: "parent@test.com",
      firstSessionDate: null,
    });
    prismaMock.centreContact.findFirst.mockResolvedValue({ id: "contact-1" });
    prismaMock.parentNurtureStep.upsert.mockResolvedValue({});
    prismaMock.sequence.findMany.mockResolvedValue([]);

    await scheduleNurtureFromStageChange("enq-1", "form_started");

    expect(prismaMock.parentNurtureStep.upsert).toHaveBeenCalledTimes(1);
    const call = prismaMock.parentNurtureStep.upsert.mock.calls[0][0] as Record<string, unknown>;
    expect((call.create as Record<string, unknown>).templateKey).toBe("form_support");
  });

  it("creates 5 legacy steps for first_session stage with future session date", async () => {
    const futureSession = new Date(NOW.getTime() + 7 * 86400000); // 7 days from now

    prismaMock.parentEnquiry.findUnique.mockResolvedValue({
      id: "enq-1",
      serviceId: "svc-1",
      parentEmail: "parent@test.com",
      firstSessionDate: futureSession,
    });
    prismaMock.centreContact.findFirst.mockResolvedValue({ id: "contact-1" });
    prismaMock.parentNurtureStep.upsert.mockResolvedValue({});
    prismaMock.sequence.findMany.mockResolvedValue([]);

    await scheduleNurtureFromStageChange("enq-1", "first_session");

    // session_reminder (day before), day1_checkin, day3_checkin, week2_feedback, month1_referral
    expect(prismaMock.parentNurtureStep.upsert).toHaveBeenCalledTimes(5);
  });

  it("skips session_reminder if reminder date is in the past", async () => {
    // Session is tomorrow — reminder would be today, which is > now (just barely)
    // Session is today — reminder would be yesterday, which is < now → skipped
    const pastSession = NOW; // firstSessionDate = now, so reminder = yesterday

    prismaMock.parentEnquiry.findUnique.mockResolvedValue({
      id: "enq-1",
      serviceId: "svc-1",
      parentEmail: "parent@test.com",
      firstSessionDate: pastSession,
    });
    prismaMock.centreContact.findFirst.mockResolvedValue({ id: "contact-1" });
    prismaMock.parentNurtureStep.upsert.mockResolvedValue({});
    prismaMock.sequence.findMany.mockResolvedValue([]);

    await scheduleNurtureFromStageChange("enq-1", "first_session");

    // Only 4 steps (session_reminder skipped because reminderDate < now)
    expect(prismaMock.parentNurtureStep.upsert).toHaveBeenCalledTimes(4);
    const templateKeys = prismaMock.parentNurtureStep.upsert.mock.calls.map(
      (c: unknown[]) => ((c[0] as Record<string, unknown>).create as Record<string, unknown>).templateKey,
    );
    expect(templateKeys).not.toContain("session_reminder");
  });

  it("uses current time as anchor when firstSessionDate is null", async () => {
    prismaMock.parentEnquiry.findUnique.mockResolvedValue({
      id: "enq-1",
      serviceId: "svc-1",
      parentEmail: "parent@test.com",
      firstSessionDate: null,
    });
    prismaMock.centreContact.findFirst.mockResolvedValue({ id: "contact-1" });
    prismaMock.parentNurtureStep.upsert.mockResolvedValue({});
    prismaMock.sequence.findMany.mockResolvedValue([]);

    await scheduleNurtureFromStageChange("enq-1", "first_session");

    // With null firstSessionDate, reminderDate = now - 1 day = past → skipped
    // So 4 steps instead of 5
    expect(prismaMock.parentNurtureStep.upsert).toHaveBeenCalledTimes(4);
  });

  it("creates SequenceEnrolment for matching DB sequences", async () => {
    prismaMock.parentEnquiry.findUnique.mockResolvedValue({
      id: "enq-1",
      serviceId: "svc-1",
      parentEmail: "parent@test.com",
      firstSessionDate: null,
    });
    prismaMock.centreContact.findFirst.mockResolvedValue({ id: "contact-1" });
    prismaMock.parentNurtureStep.upsert.mockResolvedValue({});
    prismaMock.sequence.findMany.mockResolvedValue([
      {
        id: "seq-1",
        type: "parent_nurture",
        triggerStage: "info_sent",
        isActive: true,
        steps: [
          { id: "step-1", stepNumber: 1, delayHours: 24 },
          { id: "step-2", stepNumber: 2, delayHours: 72 },
        ],
      },
    ]);
    prismaMock.sequenceEnrolment.findFirst.mockResolvedValue(null); // not yet enrolled
    prismaMock.sequenceEnrolment.create.mockResolvedValue({ id: "enrol-1" });
    prismaMock.sequenceStepExecution.create.mockResolvedValue({});

    await scheduleNurtureFromStageChange("enq-1", "info_sent");

    expect(prismaMock.sequenceEnrolment.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.sequenceStepExecution.create).toHaveBeenCalledTimes(2);
  });

  it("skips sequence enrolment if already enrolled", async () => {
    prismaMock.parentEnquiry.findUnique.mockResolvedValue({
      id: "enq-1",
      serviceId: "svc-1",
      parentEmail: "parent@test.com",
      firstSessionDate: null,
    });
    prismaMock.centreContact.findFirst.mockResolvedValue({ id: "contact-1" });
    prismaMock.parentNurtureStep.upsert.mockResolvedValue({});
    prismaMock.sequence.findMany.mockResolvedValue([
      { id: "seq-1", steps: [{ id: "step-1", stepNumber: 1, delayHours: 24 }] },
    ]);
    prismaMock.sequenceEnrolment.findFirst.mockResolvedValue({ id: "existing-enrol" });

    await scheduleNurtureFromStageChange("enq-1", "info_sent");

    expect(prismaMock.sequenceEnrolment.create).not.toHaveBeenCalled();
  });

  it("logs error but does not throw if sequence creation fails", async () => {
    prismaMock.parentEnquiry.findUnique.mockResolvedValue({
      id: "enq-1",
      serviceId: "svc-1",
      parentEmail: "parent@test.com",
      firstSessionDate: null,
    });
    prismaMock.centreContact.findFirst.mockResolvedValue({ id: "contact-1" });
    prismaMock.parentNurtureStep.upsert.mockResolvedValue({});
    prismaMock.sequence.findMany.mockRejectedValue(new Error("DB error"));

    // Should not throw
    await expect(
      scheduleNurtureFromStageChange("enq-1", "info_sent"),
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      "Failed to create sequence enrolment",
      expect.objectContaining({ err: expect.any(Error) }),
    );
  });
});
