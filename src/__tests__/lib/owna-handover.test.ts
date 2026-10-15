/**
 * Stage 2 of the parent journey: the OWNA handover.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => ({ sent: ["x"], suppressed: [] })) }));
vi.mock("@/lib/notify-user", () => ({ notifyUsers: vi.fn(async () => 1) }));
vi.mock("@/lib/parent-journey", () => ({ syncParentJourney: vi.fn(async () => undefined) }));
vi.mock("@/lib/email-template-overrides", () => ({
  applyEmailTemplateOverride: async (o: { defaultSubject: string; defaultBody: string; vars: Record<string, string>; wrap: (b: string) => string }) => {
    const fill = (t: string) => t.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in o.vars ? o.vars[k] : m));
    return { subject: fill(o.defaultSubject), html: o.wrap(fill(o.defaultBody)) };
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  generateRequestId: () => "req",
}));

import { sendEmail } from "@/lib/email";
import { notifyUsers } from "@/lib/notify-user";
import { syncParentJourney } from "@/lib/parent-journey";
import { onHandoffStepCompleted, runOwnaNudges } from "@/lib/owna-handover";
import { rescheduleFirstSession } from "@/lib/nurture-scheduler";
import { handoffPatchSchema } from "@/lib/owna-handoff";

const NOW = new Date("2026-10-16T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const sent = () => vi.mocked(sendEmail).mock.calls.map((c) => c[0] as { to: string; subject: string; html: string });

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.enrolmentSubmission.findUnique.mockResolvedValue({
    serviceId: "svc-ga",
    primaryParent: { email: "sarah@example.test", firstName: "Sarah" },
    childRecords: [{ firstName: "Yusuf" }],
  });
  prismaMock.service.findUnique.mockResolvedValue({
    name: "Amana OSHC MFIS Greenacre",
    code: "MFIS-GA",
    phone: "0494 379 929",
    email: "mfisgreenacre@amanaoshc.com.au",
    sessionTimes: null,
    content: {},
    managerId: null,
  });
  prismaMock.programActivity.findMany.mockResolvedValue([]);
  prismaMock.user.findMany.mockResolvedValue([{ id: "coord" }]);
});

describe("ticking the OWNA checklist emails the family", () => {
  it("invitation sent → the step-by-step guide, with their own email filled in", async () => {
    await onHandoffStepCompleted("e1", "invitation", { at: "2026-10-16T01:00:00Z", mode: "sent" });
    const [m] = sent();
    expect(m.to).toBe("sarah@example.test");
    expect(m.subject).toBe("Your OWNA invitation is on its way, Sarah");
    expect(m.html).toContain("sarah@example.test");
    expect(m.html).not.toContain("{{");
    expect(vi.mocked(sendEmail).mock.calls[0][1]).toEqual({ idempotencyKey: "owna-invitation-e1-2026-10-16T01:00:00Z" });
  });

  it("existing access → you're all set", async () => {
    await onHandoffStepCompleted("e1", "invitation", { at: "t", mode: "existing" });
    expect(sent()[0].subject).toBe("Yusuf is now in your OWNA account");
  });

  it("first sessions confirmed → the date, and the first-session emails re-timed to it", async () => {
    await onHandoffStepCompleted("e1", "sessions", { at: "t", firstDay: "2026-10-21" });
    expect(sent()[0].subject).toBe("You're booked in! Yusuf's first day is Wednesday 21 October");
    expect(vi.mocked(syncParentJourney)).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "first_session", firstSessionDate: new Date("2026-10-21T00:00:00Z"), serviceId: "svc-ga" }),
    );
  });

  it("other steps send nothing", async () => {
    await onHandoffStepCompleted("e1", "children", { at: "t" });
    await onHandoffStepCompleted("e1", "access", { at: "t" });
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });

  it("first sessions can't be ticked without the date", () => {
    const r = handoffPatchSchema.safeParse({ revision: 1, action: "complete", step: "sessions", evidence: "Booked in OWNA" });
    expect(r.success).toBe(false);
    expect(handoffPatchSchema.safeParse({ revision: 1, action: "complete", step: "sessions", evidence: "x", firstDay: "2026-10-21" }).success).toBe(true);
  });
});

describe("invitation not accepted after 3 days", () => {
  const row = (over: Record<string, unknown> = {}, steps: Record<string, unknown> = {}) => ({
    enrolmentId: "e1",
    inviteNudgedAt: null,
    enrolment: { serviceId: "svc-ga", children: [{ firstName: "Yusuf" }] },
    state: {
      placement: "p",
      owner: null,
      note: "",
      steps: { invitation: { at: daysAgo(4).toISOString(), by: { id: "u", name: "U" }, evidence: "sent", mode: "sent" }, ...steps },
    },
    ...over,
  });

  it("nudges the family and alerts the centre, once", async () => {
    prismaMock.enrolmentOwnaHandoff.findMany.mockResolvedValue([row()]);
    prismaMock.enrolmentOwnaHandoff.updateMany.mockResolvedValue({ count: 1 });
    expect(await runOwnaNudges(NOW)).toEqual({ nudged: 1 });
    expect(sent()[0].subject).toBe("Did your OWNA invitation arrive, Sarah?");
    expect(vi.mocked(notifyUsers).mock.calls[0][2].title).toBe("Yusuf's family hasn't got into OWNA yet");
  });

  it("leaves alone: too soon, already in, existing access, already nudged", async () => {
    prismaMock.enrolmentOwnaHandoff.findMany.mockResolvedValue([
      row({}, { invitation: { at: daysAgo(1).toISOString(), by: { id: "u", name: "U" }, evidence: "x", mode: "sent" } }),
      row({}, { access: { at: NOW.toISOString(), by: { id: "u", name: "U" }, evidence: "in" } }),
      row({}, { invitation: { at: daysAgo(5).toISOString(), by: { id: "u", name: "U" }, evidence: "x", mode: "existing" } }),
      row({ inviteNudgedAt: daysAgo(1) }),
    ]);
    expect(await runOwnaNudges(NOW)).toEqual({ nudged: 0 });
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });
});

describe("re-timing first-session emails to the real first day", () => {
  it("moves pending steps, cancels ones now in the past, creates skipped future ones, leaves sent alone", async () => {
    const anchor = new Date(Date.now() + 5 * 86_400_000);
    prismaMock.sequenceEnrolment.findMany.mockResolvedValue([
      {
        id: "enr",
        sequence: {
          steps: [
            { id: "reminder", delayHours: -24 },
            { id: "day1", delayHours: 24 },
            { id: "past", delayHours: -24 * 30 },
            { id: "week2", delayHours: 336 },
          ],
        },
        executions: [
          { id: "x-rem", stepId: "reminder", status: "pending" },
          { id: "x-day1", stepId: "day1", status: "sent" },
          { id: "x-past", stepId: "past", status: "pending" },
        ],
      },
    ]);
    prismaMock.sequenceEnrolment.update.mockResolvedValue({});
    prismaMock.sequenceStepExecution.update.mockResolvedValue({});
    prismaMock.sequenceStepExecution.create.mockResolvedValue({});
    await rescheduleFirstSession("q1", anchor);
    const updates = prismaMock.sequenceStepExecution.update.mock.calls.map((c) => [c[0].where.id, c[0].data]);
    expect(updates).toEqual([
      ["x-rem", { scheduledFor: new Date(anchor.getTime() - 24 * 3_600_000) }],
      ["x-past", { status: "cancelled" }],
    ]);
    expect(prismaMock.sequenceStepExecution.create.mock.calls.map((c) => c[0].data.stepId)).toEqual(["week2"]);
  });
});
