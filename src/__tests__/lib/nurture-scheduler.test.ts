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

/** Standard enquiry mock setup with existing contact */
function setupEnquiry(overrides: Record<string, unknown> = {}) {
  prismaMock.parentEnquiry.findUnique.mockResolvedValue({
    id: "enq-1",
    serviceId: "svc-1",
    parentEmail: "parent@test.com",
    parentName: "Jane Doe",
    firstSessionDate: null,
    ...overrides,
  });
  prismaMock.centreContact.findFirst.mockResolvedValue({ id: "contact-1" });
  prismaMock.parentNurtureStep.upsert.mockResolvedValue({});
  prismaMock.parentNurtureStep.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.sequence.findMany.mockResolvedValue([]);
}

describe("scheduleNurtureFromStageChange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(NOW);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  // ── Early returns ──────────────────────────────────────────

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
      parentName: null,
      firstSessionDate: null,
    });

    await scheduleNurtureFromStageChange("enq-1", "info_sent");

    expect(prismaMock.centreContact.findFirst).not.toHaveBeenCalled();
  });

  it("returns early for unknown stage (no steps created)", async () => {
    setupEnquiry();

    await scheduleNurtureFromStageChange("enq-1", "unknown_stage");

    expect(prismaMock.parentNurtureStep.upsert).not.toHaveBeenCalled();
  });

  // ── Auto-contact creation ──────────────────────────────────

  it("auto-creates CentreContact when none exists", async () => {
    prismaMock.parentEnquiry.findUnique.mockResolvedValue({
      id: "enq-1",
      serviceId: "svc-1",
      parentEmail: "new-parent@test.com",
      parentName: "Sarah Johnson",
      firstSessionDate: null,
    });
    prismaMock.centreContact.findFirst.mockResolvedValue(null); // No existing contact
    prismaMock.centreContact.create.mockResolvedValue({ id: "new-contact-1" });
    prismaMock.parentNurtureStep.upsert.mockResolvedValue({});
    prismaMock.parentNurtureStep.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.sequence.findMany.mockResolvedValue([]);

    await scheduleNurtureFromStageChange("enq-1", "new");

    // Should have created a contact with first name extracted from parentName
    expect(prismaMock.centreContact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "new-parent@test.com",
          serviceId: "svc-1",
          firstName: "Sarah",
          subscribed: true,
        }),
      }),
    );

    // Should still create the welcome step
    expect(prismaMock.parentNurtureStep.upsert).toHaveBeenCalledTimes(1);
  });

  it("handles P2002 race condition on contact creation", async () => {
    prismaMock.parentEnquiry.findUnique.mockResolvedValue({
      id: "enq-1",
      serviceId: "svc-1",
      parentEmail: "race@test.com",
      parentName: "Race Condition",
      firstSessionDate: null,
    });
    // First lookup: no contact
    prismaMock.centreContact.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "contact-from-race" }); // Re-fetch after P2002
    // Create fails with unique constraint
    const p2002Error = new Error("Unique constraint");
    (p2002Error as unknown as Record<string, unknown>).code = "P2002";
    prismaMock.centreContact.create.mockRejectedValue(p2002Error);
    prismaMock.parentNurtureStep.upsert.mockResolvedValue({});
    prismaMock.parentNurtureStep.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.sequence.findMany.mockResolvedValue([]);

    await scheduleNurtureFromStageChange("enq-1", "new");

    // Should have re-fetched after P2002 and continued
    expect(prismaMock.centreContact.findFirst).toHaveBeenCalledTimes(2);
    expect(prismaMock.parentNurtureStep.upsert).toHaveBeenCalledTimes(1);
  });

  // ── Stage: new ─────────────────────────────────────────────

  it("creates 1 welcome step for new stage", async () => {
    setupEnquiry();

    await scheduleNurtureFromStageChange("enq-1", "new");

    expect(prismaMock.parentNurtureStep.upsert).toHaveBeenCalledTimes(1);
    const call = prismaMock.parentNurtureStep.upsert.mock.calls[0][0] as Record<string, unknown>;
    expect((call.create as Record<string, unknown>).templateKey).toBe("welcome");
  });

  // ── Stage: info_sent ───────────────────────────────────────

  it("creates 3 legacy steps for info_sent stage", async () => {
    setupEnquiry();

    await scheduleNurtureFromStageChange("enq-1", "info_sent");

    expect(prismaMock.parentNurtureStep.upsert).toHaveBeenCalledTimes(3);

    const calls = prismaMock.parentNurtureStep.upsert.mock.calls;
    const templateKeys = calls.map((c: unknown[]) => (c[0] as Record<string, unknown>).create).map((c: Record<string, unknown>) => c.templateKey);
    expect(templateKeys).toContain("ccs_assist");
    expect(templateKeys).toContain("how_to_enrol");
    expect(templateKeys).toContain("nudge_1");
  });

  // ── Stage: nurturing ───────────────────────────────────────

  it("creates 2 legacy steps for nurturing stage", async () => {
    setupEnquiry();

    await scheduleNurtureFromStageChange("enq-1", "nurturing");

    expect(prismaMock.parentNurtureStep.upsert).toHaveBeenCalledTimes(2);
  });

  // ── Stage: form_started ────────────────────────────────────

  it("creates 2 steps for form_started (support + abandonment)", async () => {
    setupEnquiry();

    await scheduleNurtureFromStageChange("enq-1", "form_started");

    expect(prismaMock.parentNurtureStep.upsert).toHaveBeenCalledTimes(2);
    const calls = prismaMock.parentNurtureStep.upsert.mock.calls;
    const templateKeys = calls.map((c: unknown[]) => ((c[0] as Record<string, unknown>).create as Record<string, unknown>).templateKey);
    expect(templateKeys).toContain("form_support");
    expect(templateKeys).toContain("form_abandonment");
  });

  it("cancels nudge steps when form_started is reached", async () => {
    setupEnquiry();

    await scheduleNurtureFromStageChange("enq-1", "form_started");

    expect(prismaMock.parentNurtureStep.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          contactId: "contact-1",
          enquiryId: "enq-1",
          templateKey: { in: ["nudge_1", "nudge_2", "final_nudge"] },
          status: "pending",
        }),
        data: { status: "cancelled" },
      }),
    );
  });

  // ── Stage: first_session ───────────────────────────────────

  it("creates 9 steps for first_session with future session date", async () => {
    const futureSession = new Date(NOW.getTime() + 7 * 86400000); // 7 days from now
    setupEnquiry({ firstSessionDate: futureSession });

    await scheduleNurtureFromStageChange("enq-1", "first_session");

    // session_reminder, what_to_bring, day1_checkin, day3_checkin, app_setup,
    // first_week, week2_feedback, nps_survey, month1_referral
    expect(prismaMock.parentNurtureStep.upsert).toHaveBeenCalledTimes(9);
  });

  it("skips session_reminder if reminder date is in the past", async () => {
    // Session is today — reminder would be yesterday → skipped
    setupEnquiry({ firstSessionDate: NOW });

    await scheduleNurtureFromStageChange("enq-1", "first_session");

    // 8 steps (session_reminder skipped)
    expect(prismaMock.parentNurtureStep.upsert).toHaveBeenCalledTimes(8);
    const templateKeys = prismaMock.parentNurtureStep.upsert.mock.calls.map(
      (c: unknown[]) => ((c[0] as Record<string, unknown>).create as Record<string, unknown>).templateKey,
    );
    expect(templateKeys).not.toContain("session_reminder");
  });

  it("uses current time as anchor when firstSessionDate is null", async () => {
    setupEnquiry({ firstSessionDate: null });

    await scheduleNurtureFromStageChange("enq-1", "first_session");

    // reminder = now - 1 day = past → skipped → 8 steps
    expect(prismaMock.parentNurtureStep.upsert).toHaveBeenCalledTimes(8);
  });

  it("cancels form_support and form_abandonment when first_session is reached", async () => {
    const futureSession = new Date(NOW.getTime() + 7 * 86400000);
    setupEnquiry({ firstSessionDate: futureSession });

    await scheduleNurtureFromStageChange("enq-1", "first_session");

    expect(prismaMock.parentNurtureStep.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          templateKey: { in: expect.arrayContaining(["form_support", "form_abandonment"]) },
          status: "pending",
        }),
        data: { status: "cancelled" },
      }),
    );
  });

  // ── Step ordering and scheduling ───────────────────────────

  it("schedules info_sent steps at correct intervals", async () => {
    setupEnquiry();

    await scheduleNurtureFromStageChange("enq-1", "info_sent");

    const calls = prismaMock.parentNurtureStep.upsert.mock.calls;
    const steps = calls.map((c: unknown[]) => {
      const create = (c[0] as Record<string, unknown>).create as Record<string, unknown>;
      return { key: create.templateKey, scheduledFor: create.scheduledFor as Date };
    });

    const ccsAssist = steps.find(s => s.key === "ccs_assist")!;
    const howToEnrol = steps.find(s => s.key === "how_to_enrol")!;
    const nudge1 = steps.find(s => s.key === "nudge_1")!;

    // ccs_assist at +24h, how_to_enrol at +48h, nudge_1 at +3d
    expect(ccsAssist.scheduledFor.getTime() - NOW.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(howToEnrol.scheduledFor.getTime() - NOW.getTime()).toBe(48 * 60 * 60 * 1000);
    expect(nudge1.scheduledFor.getTime() - NOW.getTime()).toBe(3 * 24 * 60 * 60 * 1000);
  });

  it("schedules first_session steps relative to session date, not now", async () => {
    const futureSession = new Date(NOW.getTime() + 7 * 86400000); // +7d
    setupEnquiry({ firstSessionDate: futureSession });

    await scheduleNurtureFromStageChange("enq-1", "first_session");

    const calls = prismaMock.parentNurtureStep.upsert.mock.calls;
    const steps = calls.map((c: unknown[]) => {
      const create = (c[0] as Record<string, unknown>).create as Record<string, unknown>;
      return { key: create.templateKey, scheduledFor: create.scheduledFor as Date };
    });

    const whatToBring = steps.find(s => s.key === "what_to_bring")!;
    const day1 = steps.find(s => s.key === "day1_checkin")!;
    const nps = steps.find(s => s.key === "nps_survey")!;

    // what_to_bring on session day, day1 = session+1d, nps = session+30d
    expect(whatToBring.scheduledFor.getTime()).toBe(futureSession.getTime());
    expect(day1.scheduledFor.getTime() - futureSession.getTime()).toBe(1 * 86400000);
    expect(nps.scheduledFor.getTime() - futureSession.getTime()).toBe(30 * 86400000);
  });

  // ── Full journey stress test ───────────────────────────────

  it("simulates full enquiry lifecycle without errors", async () => {
    const stages = ["new", "info_sent", "nurturing", "form_started", "first_session"];

    for (const stage of stages) {
      vi.clearAllMocks();
      const overrides: Record<string, unknown> = {};
      if (stage === "first_session") {
        overrides.firstSessionDate = new Date(NOW.getTime() + 14 * 86400000);
      }
      setupEnquiry(overrides);

      await expect(
        scheduleNurtureFromStageChange("enq-1", stage),
      ).resolves.toBeUndefined();

      // Every stage should create at least 1 step
      expect(prismaMock.parentNurtureStep.upsert.mock.calls.length).toBeGreaterThan(0);
    }
  });

  // ── Sequence enrolment (new system) ────────────────────────

  it("creates SequenceEnrolment for matching DB sequences", async () => {
    setupEnquiry();
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
    prismaMock.sequenceEnrolment.findFirst.mockResolvedValue(null);
    prismaMock.sequenceEnrolment.create.mockResolvedValue({ id: "enrol-1" });
    prismaMock.sequenceStepExecution.create.mockResolvedValue({});

    await scheduleNurtureFromStageChange("enq-1", "info_sent");

    expect(prismaMock.sequenceEnrolment.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.sequenceStepExecution.create).toHaveBeenCalledTimes(2);
  });

  it("skips sequence enrolment if already enrolled (P2002 unique constraint)", async () => {
    setupEnquiry();
    prismaMock.sequence.findMany.mockResolvedValue([
      { id: "seq-1", steps: [{ id: "step-1", stepNumber: 1, delayHours: 24 }] },
    ]);
    const p2002Error = new Error("Unique constraint failed");
    (p2002Error as unknown as Record<string, unknown>).code = "P2002";
    prismaMock.sequenceEnrolment.create.mockRejectedValue(p2002Error);

    // Should not throw
    await scheduleNurtureFromStageChange("enq-1", "info_sent");
  });

  it("logs error but does not throw if sequence creation fails", async () => {
    setupEnquiry();
    prismaMock.sequence.findMany.mockRejectedValue(new Error("DB error"));

    await expect(
      scheduleNurtureFromStageChange("enq-1", "info_sent"),
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      "Failed to create sequence enrolment",
      expect.objectContaining({ err: expect.any(Error) }),
    );
  });
});
