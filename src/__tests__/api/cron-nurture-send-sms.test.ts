import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "test-req-id",
}));

vi.mock("@/lib/cron-guard", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cron-guard")>("@/lib/cron-guard");
  return {
    ...actual,
    verifyCronSecret: vi.fn(() => null),
    acquireCronLock: vi.fn(async () => ({
      acquired: true,
      complete: vi.fn(async () => {}),
      fail: vi.fn(async () => {}),
    })),
  };
});

// Suppression-aware send wrapper — the cutover routes all nurture sends through this.
type SendArgs = { to: string | string[]; subject: string; html: string };
type SendResult = { sent: string[]; suppressed: string[]; messageId?: string };
const sendEmailMock = vi.fn<(p: SendArgs) => Promise<SendResult>>(async (p) => ({
  sent: [Array.isArray(p.to) ? p.to[0] : p.to],
  suppressed: [],
  messageId: "m-1",
}));
vi.mock("@/lib/email", () => ({
  getResend: () => ({}),
  FROM_EMAIL: "test@example.com",
  sendEmail: (p: SendArgs) => sendEmailMock(p),
}));

const sendSmsMock = vi.fn();
vi.mock("@/lib/sms", () => ({ sendSms: (...args: unknown[]) => sendSmsMock(...args) }));

vi.mock("@/lib/email-marketing-layout", () => ({
  renderBlocksToHtml: (_b: unknown, vars: Record<string, string>) => `<blocks>${vars?.centreName ?? ""}</blocks>`,
  marketingLayout: (html: string) => `<ml>${html}</ml>`,
}));
vi.mock("@/lib/email-branding", () => ({
  getEmailBranding: async () => ({
    name: "Amana OSHC", primaryColor: "#004E64", websiteUrl: "https://x.test", websiteUrlLabel: "x",
  }),
}));

// Template stubs echo (firstName, centreName) so we can assert the centre name.
vi.mock("@/lib/email-templates", () => {
  const echo = (subject: string) => (firstName: string, centreName: string) => ({
    subject,
    html: `<p>${firstName} @ ${centreName}</p>`,
  });
  return {
    nurtureWelcomeEmail: echo("welcome"),
    nurtureHowToEnrolEmail: echo("how-to-enrol"),
    nurtureWhatToBringEmail: echo("what-to-bring"),
    nurtureAppSetupEmail: echo("app-setup"),
    nurtureFirstWeekEmail: echo("first-week"),
    nurtureNpsSurveyEmail: echo("nps"),
    nurtureCcsAssistEmail: echo("ccs"),
    nurtureNudge1Email: echo("nudge1"),
    nurtureFormSupportEmail: echo("form-support"),
    nurtureNudge2Email: echo("nudge2"),
    nurtureFinalNudgeEmail: echo("final-nudge"),
    nurtureDay1CheckinEmail: echo("day1"),
    nurtureDay3CheckinEmail: echo("day3"),
    nurtureWeek2FeedbackEmail: echo("week2"),
    nurtureMonth1ReferralEmail: echo("month1"),
    nurtureSessionReminderEmail: (firstName: string, centreName: string) => ({
      subject: "reminder", html: `<p>reminder ${centreName}</p>`,
    }),
    centreWebsiteUrl: () => undefined,
    retentionCasualReengageEmail: echo("casual"),
    retentionDayChangeReminderEmail: echo("day-change"),
    retentionWithdrawalInterceptEmail: echo("withdrawal"),
    nurtureFormAbandonmentEmail: echo("abandon"),
  };
});

import { POST } from "@/app/api/cron/nurture-send/route";

type ContactOverride = Partial<{
  email: string; firstName: string; subscribed: boolean; mobile: string | null; smsOptIn: boolean;
}>;

function makeExec(opts?: {
  templateKey?: string;
  attempts?: number;
  contact?: ContactOverride;
  sequenceType?: string;
}) {
  return {
    id: "exec-1",
    enrolmentId: "enrol-1",
    stepId: "step-1",
    status: "sending",
    attempts: opts?.attempts ?? 0,
    step: {
      templateKey: opts?.templateKey ?? "day1_checkin",
      name: "Day 1 Check-in",
      stepNumber: 2,
      emailTemplate: null,
      sequence: { type: opts?.sequenceType ?? "parent_nurture" },
    },
    enrolment: {
      contactId: "c-1",
      serviceId: "svc-1",
      leadId: null,
      contact: {
        email: "aysha@example.com",
        firstName: "Aysha",
        subscribed: true,
        mobile: "+61412345678",
        smsOptIn: true,
        service: {
          name: "Amana OSHC Minaret", code: "minaret",
          address: "1 Test St", suburb: "Sydney", state: "NSW", orientationVideoUrl: null,
        },
        ...(opts?.contact ?? {}),
      },
      lead: null,
      sequence: { name: "First Session Onboarding" },
    },
  };
}

function run() {
  return POST(createRequest("POST", "/api/cron/nurture-send"));
}

describe("POST /api/cron/nurture-send — sequence sender (post-cutover)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendEmailMock.mockReset();
    sendEmailMock.mockImplementation(async (p: { to: string | string[] }) => ({
      sent: [Array.isArray(p.to) ? p.to[0] : p.to], suppressed: [], messageId: "m-1",
    }));
    sendSmsMock.mockReset();
    // Sensible defaults
    prismaMock.sequenceStepExecution.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.sequenceStepExecution.update.mockResolvedValue({});
    prismaMock.sequenceStepExecution.count.mockResolvedValue(1); // not complete
    prismaMock.sequenceEnrolment.update.mockResolvedValue({});
    prismaMock.deliveryLog.create.mockResolvedValue({});
    prismaMock.touchpointLog.create.mockResolvedValue({});
    prismaMock.sequenceStepExecution.findMany.mockResolvedValue([]);
  });

  // ── Legacy table is no longer touched ──
  it("does not read or write the legacy ParentNurtureStep table", async () => {
    prismaMock.sequenceStepExecution.findMany.mockResolvedValue([makeExec({ templateKey: "welcome" })]);

    const res = await run();
    expect(res.status).toBe(200);
    expect(prismaMock.parentNurtureStep.findMany).not.toHaveBeenCalled();
    expect(prismaMock.parentNurtureStep.updateMany).not.toHaveBeenCalled();
  });

  // ── Suppression ──
  it("routes sends through the suppression-aware wrapper", async () => {
    prismaMock.sequenceStepExecution.findMany.mockResolvedValue([makeExec({ templateKey: "welcome" })]);
    await run();
    expect(sendEmailMock).toHaveBeenCalledOnce();
    expect(sendEmailMock.mock.calls[0][0]).toMatchObject({ to: "aysha@example.com" });
  });

  it("cancels the execution (no send recorded) when the address is suppressed", async () => {
    prismaMock.sequenceStepExecution.findMany.mockResolvedValue([makeExec({ templateKey: "welcome" })]);
    sendEmailMock.mockResolvedValue({ sent: [], suppressed: ["aysha@example.com"], messageId: undefined });

    await run();

    const cancel = prismaMock.sequenceStepExecution.update.mock.calls.find(
      (c: unknown[]) => (c[0] as { data: { status: string } }).data.status === "cancelled",
    );
    expect(cancel).toBeDefined();
    // not marked sent, and no SMS
    const sent = prismaMock.sequenceStepExecution.update.mock.calls.find(
      (c: unknown[]) => (c[0] as { data: { status: string } }).data.status === "sent",
    );
    expect(sent).toBeUndefined();
    expect(sendSmsMock).not.toHaveBeenCalled();
  });

  // ── Unsubscribe + centre-name correctness ──
  it("appends an unsubscribe footer and uses the real centre name (not the sequence name)", async () => {
    prismaMock.sequenceStepExecution.findMany.mockResolvedValue([makeExec({ templateKey: "welcome" })]);

    await run();

    const html = (sendEmailMock.mock.calls[0][0] as { html: string }).html;
    expect(html).toContain("Unsubscribe");
    expect(html).toContain("Amana OSHC Minaret"); // service name
    expect(html).not.toContain("First Session Onboarding"); // sequence name must NOT be the centre name
  });

  // ── session_reminder special-case (in the seed sequence, not in TEMPLATE_MAP) ──
  it("renders session_reminder via its dedicated template, not the generic fallback", async () => {
    prismaMock.sequenceStepExecution.findMany.mockResolvedValue([makeExec({ templateKey: "session_reminder" })]);

    await run();

    expect((sendEmailMock.mock.calls[0][0] as { subject: string }).subject).toBe("reminder");
  });

  // ── SMS fan-out (ported from legacy path) ──
  it("sends SMS alongside email for day1_checkin when mobile + smsOptIn present", async () => {
    prismaMock.sequenceStepExecution.findMany.mockResolvedValue([makeExec({ templateKey: "day1_checkin" })]);
    sendSmsMock.mockResolvedValue({ ok: true, messageIds: ["sms-1"] });

    await run();

    expect(sendSmsMock).toHaveBeenCalledOnce();
    const arg = sendSmsMock.mock.calls[0][0];
    expect(arg.to.number).toBe("+61412345678");
    expect(arg.body).toContain("Aysha");
    expect(arg.body).toContain("Amana OSHC Minaret");
    const channels = prismaMock.deliveryLog.create.mock.calls.map(
      (c: unknown[]) => (c[0] as { data: { channel: string } }).data.channel,
    );
    expect(channels).toContain("email");
    expect(channels).toContain("sms");
  });

  it("does NOT send SMS for non-augmented templates", async () => {
    prismaMock.sequenceStepExecution.findMany.mockResolvedValue([makeExec({ templateKey: "welcome" })]);
    await run();
    expect(sendSmsMock).not.toHaveBeenCalled();
  });

  it("skips SMS when smsOptIn is false", async () => {
    prismaMock.sequenceStepExecution.findMany.mockResolvedValue([
      makeExec({ templateKey: "day1_checkin", contact: { smsOptIn: false } }),
    ]);
    await run();
    expect(sendSmsMock).not.toHaveBeenCalled();
  });

  it("skips SMS when mobile is null", async () => {
    prismaMock.sequenceStepExecution.findMany.mockResolvedValue([
      makeExec({ templateKey: "day1_checkin", contact: { mobile: null } }),
    ]);
    await run();
    expect(sendSmsMock).not.toHaveBeenCalled();
  });

  it("still marks the execution sent even if SMS dispatch throws", async () => {
    prismaMock.sequenceStepExecution.findMany.mockResolvedValue([makeExec({ templateKey: "day1_checkin" })]);
    sendSmsMock.mockRejectedValue(new Error("SMS provider boom"));

    await run();

    const sent = prismaMock.sequenceStepExecution.update.mock.calls.find(
      (c: unknown[]) => (c[0] as { data: { status: string } }).data.status === "sent",
    );
    expect(sent).toBeDefined();
  });

  // ── Retry cap ──
  it("reverts to pending on the first send failure", async () => {
    prismaMock.sequenceStepExecution.findMany.mockResolvedValue([makeExec({ templateKey: "welcome", attempts: 0 })]);
    sendEmailMock.mockRejectedValue(new Error("Resend 500"));

    await run();

    const call = prismaMock.sequenceStepExecution.update.mock.calls.at(-1)?.[0] as {
      data: { status: string; attempts: unknown };
    };
    expect(call.data.status).toBe("pending");
    expect(call.data.attempts).toEqual({ increment: 1 });
  });

  it("marks the execution failed (terminal) once attempts hit the cap", async () => {
    prismaMock.sequenceStepExecution.findMany.mockResolvedValue([makeExec({ templateKey: "welcome", attempts: 2 })]);
    sendEmailMock.mockRejectedValue(new Error("Resend 500"));

    await run();

    const call = prismaMock.sequenceStepExecution.update.mock.calls.at(-1)?.[0] as {
      data: { status: string };
    };
    expect(call.data.status).toBe("failed");
  });
});
