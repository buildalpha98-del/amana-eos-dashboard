import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
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

/**
 * Standard enquiry mock with an existing contact and one matching DB sequence
 * for the requested stage. The cutover means the scheduler now drives the
 * SequenceEnrolment system only — no legacy ParentNurtureStep writes.
 */
function setupEnquiry(
  overrides: Record<string, unknown> = {},
  sequences?: unknown[],
  opts: { staleExecutions?: { id: string }[]; priorTemplateKeys?: string[] } = {},
) {
  prismaMock.parentEnquiry.findUnique.mockResolvedValue({
    id: "enq-1",
    serviceId: "svc-1",
    parentEmail: "parent@test.com",
    parentName: "Jane Doe",
    firstSessionDate: null,
    channel: "phone",
    ...overrides,
  });
  prismaMock.centreContact.findFirst.mockResolvedValue({ id: "contact-1" });
  prismaMock.sequence.findMany.mockResolvedValue(
    sequences ?? [
      {
        id: "seq-1",
        type: "parent_nurture",
        triggerStage: "info_sent",
        isActive: true,
        steps: [
          { id: "step-1", stepNumber: 1, delayHours: 24, templateKey: "ccs_assist" },
          { id: "step-2", stepNumber: 2, delayHours: 72, templateKey: "nudge_1" },
        ],
      },
    ],
  );
  prismaMock.sequenceEnrolment.create.mockResolvedValue({ id: "enrol-1" });
  prismaMock.sequenceStepExecution.create.mockResolvedValue({});
  // Input-routed: the cancellation lookup filters on status: "pending"; the
  // dedupe lookup filters on status: { in: [...] } and selects templateKeys.
  prismaMock.sequenceStepExecution.findMany.mockImplementation(
    ((args: { where?: { status?: unknown } }) => {
      if (args?.where?.status === "pending") {
        return Promise.resolve(opts.staleExecutions ?? []);
      }
      return Promise.resolve(
        (opts.priorTemplateKeys ?? []).map((key) => ({ step: { templateKey: key } })),
      );
    }) as never,
  );
  prismaMock.sequenceStepExecution.updateMany.mockResolvedValue({ count: 0 });
}

describe("scheduleNurtureFromStageChange (sequence system)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(NOW);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  // ── Cutover guarantee: legacy system is no longer written ──

  it("never writes to the legacy ParentNurtureStep table", async () => {
    setupEnquiry();

    await scheduleNurtureFromStageChange("enq-1", "info_sent");

    expect(prismaMock.parentNurtureStep.upsert).not.toHaveBeenCalled();
    expect(prismaMock.parentNurtureStep.create).not.toHaveBeenCalled();
    expect(prismaMock.parentNurtureStep.updateMany).not.toHaveBeenCalled();
  });

  // ── Early returns ──────────────────────────────────────────

  it("returns early if enquiry not found", async () => {
    prismaMock.parentEnquiry.findUnique.mockResolvedValue(null);

    await scheduleNurtureFromStageChange("missing-id", "info_sent");

    expect(prismaMock.centreContact.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.sequenceEnrolment.create).not.toHaveBeenCalled();
  });

  it("returns early if enquiry has no parentEmail", async () => {
    prismaMock.parentEnquiry.findUnique.mockResolvedValue({
      id: "enq-1", serviceId: "svc-1", parentEmail: null, parentName: null, firstSessionDate: null,
    });

    await scheduleNurtureFromStageChange("enq-1", "info_sent");

    expect(prismaMock.centreContact.findFirst).not.toHaveBeenCalled();
  });

  it("creates no enrolment when no sequence matches the stage", async () => {
    setupEnquiry({}, []); // no sequences configured for this stage

    await scheduleNurtureFromStageChange("enq-1", "unknown_stage");

    expect(prismaMock.sequenceEnrolment.create).not.toHaveBeenCalled();
  });

  // ── Auto-contact creation ──────────────────────────────────

  it("auto-creates CentreContact when none exists", async () => {
    setupEnquiry({ parentEmail: "new-parent@test.com", parentName: "Sarah Johnson" });
    prismaMock.centreContact.findFirst.mockResolvedValue(null);
    prismaMock.centreContact.create.mockResolvedValue({ id: "new-contact-1" });

    await scheduleNurtureFromStageChange("enq-1", "info_sent");

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
    expect(prismaMock.sequenceEnrolment.create).toHaveBeenCalledTimes(1);
  });

  it("handles P2002 race condition on contact creation", async () => {
    setupEnquiry({ parentEmail: "race@test.com", parentName: "Race Condition" });
    prismaMock.centreContact.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "contact-from-race" });
    const p2002 = new Error("Unique constraint");
    (p2002 as unknown as Record<string, unknown>).code = "P2002";
    prismaMock.centreContact.create.mockRejectedValue(p2002);

    await scheduleNurtureFromStageChange("enq-1", "info_sent");

    expect(prismaMock.centreContact.findFirst).toHaveBeenCalledTimes(2);
    expect(prismaMock.sequenceEnrolment.create).toHaveBeenCalledTimes(1);
  });

  // ── Sequence enrolment creation ────────────────────────────

  it("creates a SequenceEnrolment + one execution per future step", async () => {
    setupEnquiry();

    await scheduleNurtureFromStageChange("enq-1", "info_sent");

    expect(prismaMock.sequenceEnrolment.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.sequenceStepExecution.create).toHaveBeenCalledTimes(2);
  });

  it("anchors first_session executions to the session date, not now", async () => {
    const futureSession = new Date(NOW.getTime() + 7 * 86400000);
    setupEnquiry({ firstSessionDate: futureSession }, [
      {
        id: "seq-fs", type: "parent_nurture", triggerStage: "first_session", isActive: true,
        steps: [
          { id: "s-reminder", stepNumber: 1, delayHours: -24, templateKey: "session_reminder" },
          { id: "s-day1", stepNumber: 2, delayHours: 24, templateKey: "day1_checkin" },
        ],
      },
    ]);

    await scheduleNurtureFromStageChange("enq-1", "first_session");

    const calls = prismaMock.sequenceStepExecution.create.mock.calls;
    const byStep: Record<string, Date> = {};
    for (const c of calls) {
      const data = (c[0] as Record<string, Record<string, unknown>>).data;
      byStep[data.stepId as string] = data.scheduledFor as Date;
    }
    // reminder = session - 24h, day1 = session + 24h
    expect(byStep["s-reminder"].getTime()).toBe(futureSession.getTime() - 24 * 3600_000);
    expect(byStep["s-day1"].getTime()).toBe(futureSession.getTime() + 24 * 3600_000);
  });

  it("skips sequence enrolment if already enrolled (P2002)", async () => {
    setupEnquiry();
    const p2002 = new Error("Unique constraint failed");
    (p2002 as unknown as Record<string, unknown>).code = "P2002";
    prismaMock.sequenceEnrolment.create.mockRejectedValue(p2002);

    await expect(scheduleNurtureFromStageChange("enq-1", "info_sent")).resolves.toBeUndefined();
    expect(prismaMock.sequenceStepExecution.create).not.toHaveBeenCalled();
  });

  it("logs error but does not throw if sequence creation fails", async () => {
    setupEnquiry();
    prismaMock.sequence.findMany.mockRejectedValue(new Error("DB error"));

    await expect(scheduleNurtureFromStageChange("enq-1", "info_sent")).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      "Failed to create sequence enrolment",
      expect.objectContaining({ err: expect.any(Error) }),
    );
  });

  // ── Cancellation of stale executions on forward transitions ──

  it("cancels pending nudge executions when form_started is reached", async () => {
    setupEnquiry(
      {},
      [
        {
          id: "seq-form", type: "parent_nurture", triggerStage: "form_started", isActive: true,
          steps: [{ id: "s-fs", stepNumber: 1, delayHours: 4, templateKey: "form_support" }],
        },
      ],
      // pending executions from earlier stages that should be cancelled
      { staleExecutions: [{ id: "exec-nudge-1" }, { id: "exec-final" }] },
    );

    await scheduleNurtureFromStageChange("enq-1", "form_started");

    // It looks up stale executions scoped to this contact + enquiry by templateKey
    expect(prismaMock.sequenceStepExecution.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "pending",
          enrolment: { contactId: "contact-1", enquiryId: "enq-1" },
          step: { templateKey: { in: ["nudge_1", "nudge_2", "final_nudge"] } },
        }),
      }),
    );
    // ...and cancels exactly those
    expect(prismaMock.sequenceStepExecution.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["exec-nudge-1", "exec-final"] } },
      data: { status: "cancelled" },
    });
  });

  it("cancels form_support + abandonment + nudges when first_session is reached", async () => {
    setupEnquiry({ firstSessionDate: new Date(NOW.getTime() + 7 * 86400000) }, [], {
      staleExecutions: [{ id: "exec-x" }],
    });

    await scheduleNurtureFromStageChange("enq-1", "first_session");

    expect(prismaMock.sequenceStepExecution.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          step: { templateKey: { in: expect.arrayContaining(["form_support", "form_abandonment", "nudge_1"]) } },
        }),
      }),
    );
  });

  it("cancels welcome + ccs_assist too once the family is enrolled", async () => {
    setupEnquiry({}, [], { staleExecutions: [{ id: "exec-welcome" }] });

    await scheduleNurtureFromStageChange("enq-1", "enrolled");

    expect(prismaMock.sequenceStepExecution.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "pending",
          step: { templateKey: { in: expect.arrayContaining(["welcome", "ccs_assist", "final_nudge"]) } },
        }),
      }),
    );
    expect(prismaMock.sequenceStepExecution.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["exec-welcome"] } },
      data: { status: "cancelled" },
    });
  });

  it("does not query for cancellations on stages with nothing to cancel", async () => {
    setupEnquiry(); // "new_enquiry" / "info_sent" have no cancel set

    await scheduleNurtureFromStageChange("enq-1", "info_sent");

    // The only findMany calls are the dedupe lookup (status: { in: [...] }) —
    // never the cancellation-shaped query (status: "pending").
    const pendingCalls = prismaMock.sequenceStepExecution.findMany.mock.calls.filter(
      (c) => (c[0] as { where?: { status?: unknown } })?.where?.status === "pending",
    );
    expect(pendingCalls).toHaveLength(0);
  });

  // ── New Enquiry Journey (automated from creation) ──────────

  it("enrols a new_enquiry into the journey immediately on creation", async () => {
    setupEnquiry({}, [
      {
        id: "seq-journey", type: "parent_nurture", triggerStage: "new_enquiry", isActive: true,
        steps: [
          { id: "s-welcome", stepNumber: 1, delayHours: 0, templateKey: "welcome" },
          { id: "s-ccs", stepNumber: 2, delayHours: 24, templateKey: "ccs_assist" },
          { id: "s-n1", stepNumber: 3, delayHours: 72, templateKey: "nudge_1" },
        ],
      },
    ]);

    await scheduleNurtureFromStageChange("enq-1", "new_enquiry");

    expect(prismaMock.sequenceEnrolment.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.sequenceStepExecution.create).toHaveBeenCalledTimes(3);
  });

  it("skips the 0h welcome for website-channel enquiries (site already auto-responds)", async () => {
    setupEnquiry({ channel: "website" }, [
      {
        id: "seq-journey", type: "parent_nurture", triggerStage: "new_enquiry", isActive: true,
        steps: [
          { id: "s-welcome", stepNumber: 1, delayHours: 0, templateKey: "welcome" },
          { id: "s-ccs", stepNumber: 2, delayHours: 24, templateKey: "ccs_assist" },
        ],
      },
    ]);

    await scheduleNurtureFromStageChange("enq-1", "new_enquiry");

    const scheduledStepIds = prismaMock.sequenceStepExecution.create.mock.calls.map(
      (c) => (c[0] as { data: { stepId: string } }).data.stepId,
    );
    expect(scheduledStepIds).toEqual(["s-ccs"]);
  });

  it("never schedules a templateKey the family already has pending or sent", async () => {
    // Family entered via the New Enquiry Journey; staff later drag the card to
    // info_sent, whose sequence re-covers ccs_assist + nudge_1.
    setupEnquiry({}, undefined, { priorTemplateKeys: ["ccs_assist", "nudge_1"] });

    await scheduleNurtureFromStageChange("enq-1", "info_sent");

    expect(prismaMock.sequenceEnrolment.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.sequenceStepExecution.create).not.toHaveBeenCalled();
  });

  // ── Full journey ───────────────────────────────────────────

  it("runs the full lifecycle without throwing", async () => {
    const stages = ["new_enquiry", "info_sent", "nurturing", "form_started", "first_session"];
    for (const stage of stages) {
      vi.clearAllMocks();
      const overrides: Record<string, unknown> = {};
      if (stage === "first_session") overrides.firstSessionDate = new Date(NOW.getTime() + 14 * 86400000);
      setupEnquiry(overrides);
      await expect(scheduleNurtureFromStageChange("enq-1", stage)).resolves.toBeUndefined();
    }
  });
});
