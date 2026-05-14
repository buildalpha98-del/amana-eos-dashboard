import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
  generateRequestId: () => "test-req-id",
}));

vi.mock("@/lib/cron-guard", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cron-guard")>(
    "@/lib/cron-guard",
  );
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

const resendSendMock = vi.fn(async () => ({ data: { id: "msg-1" }, error: null }));
vi.mock("@/lib/email", () => ({
  getResend: () => ({ emails: { send: resendSendMock } }),
  FROM_EMAIL: "test@example.com",
}));

const sendSmsMock = vi.fn();
vi.mock("@/lib/sms", () => ({
  sendSms: (...args: unknown[]) => sendSmsMock(...args),
}));

// Stub the email templates — we don't care about their HTML in this test.
vi.mock("@/lib/email-templates", () => {
  const stub = (subject: string) => () => ({ subject, html: "<p>x</p>" });
  return {
    nurtureWelcomeEmail: stub("welcome"),
    nurtureHowToEnrolEmail: stub("how-to-enrol"),
    nurtureWhatToBringEmail: stub("what-to-bring"),
    nurtureAppSetupEmail: stub("app-setup"),
    nurtureFirstWeekEmail: stub("first-week"),
    nurtureNpsSurveyEmail: stub("nps"),
    nurtureCcsAssistEmail: stub("ccs"),
    nurtureNudge1Email: stub("nudge1"),
    nurtureFormSupportEmail: stub("form-support"),
    nurtureNudge2Email: stub("nudge2"),
    nurtureFinalNudgeEmail: stub("final-nudge"),
    nurtureDay1CheckinEmail: stub("day1"),
    nurtureDay3CheckinEmail: stub("day3"),
    nurtureWeek2FeedbackEmail: stub("week2"),
    nurtureMonth1ReferralEmail: stub("month1"),
    nurtureSessionReminderEmail: stub("reminder"),
    retentionCasualReengageEmail: stub("casual"),
    retentionDayChangeReminderEmail: stub("day-change"),
    retentionWithdrawalInterceptEmail: stub("withdrawal"),
    nurtureFormAbandonmentEmail: stub("abandon"),
  };
});

import { POST } from "@/app/api/cron/nurture-send/route";

function makeStep(overrides?: Partial<{
  templateKey: string;
  contact: { firstName: string; email: string; subscribed: boolean; mobile: string | null; smsOptIn: boolean };
}>) {
  return {
    id: "step-1",
    contactId: "c-1",
    templateKey: overrides?.templateKey ?? "day1_checkin",
    contact: {
      firstName: "Aysha",
      email: "aysha@example.com",
      subscribed: true,
      mobile: "+61412345678",
      smsOptIn: true,
      ...(overrides?.contact ?? {}),
    },
    service: {
      name: "Amana OSHC Minaret",
      code: "minaret",
      address: "1 Test St",
      suburb: "Sydney",
      state: "NSW",
      orientationVideoUrl: null,
    },
  };
}

describe("POST /api/cron/nurture-send — SMS fan-out for stage 7", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resendSendMock.mockClear();
    sendSmsMock.mockReset();
    // Defaults for unrelated calls
    prismaMock.parentNurtureStep.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.parentNurtureStep.update.mockResolvedValue({});
    prismaMock.deliveryLog.create.mockResolvedValue({});
    prismaMock.sequenceEnrolment.findMany.mockResolvedValue([]);
    prismaMock.sequenceStepExecution.findMany.mockResolvedValue([]);
  });

  it("sends SMS alongside email for day1_checkin when contact has mobile + smsOptIn", async () => {
    prismaMock.parentNurtureStep.findMany.mockResolvedValue([makeStep()]);
    sendSmsMock.mockResolvedValue({ ok: true, provider: "messagemedia", messageIds: ["sms-1"] });

    const res = await POST(createRequest("POST", "/api/cron/nurture-send"));
    expect(res.status).toBe(200);

    expect(resendSendMock).toHaveBeenCalledOnce();
    expect(sendSmsMock).toHaveBeenCalledOnce();
    const smsArg = sendSmsMock.mock.calls[0][0];
    expect(smsArg.to.number).toBe("+61412345678");
    expect(smsArg.body).toContain("Aysha");
    expect(smsArg.body).toContain("Amana OSHC Minaret");

    // DeliveryLog gets two entries — one email, one sms
    const channels = prismaMock.deliveryLog.create.mock.calls.map(
      (c: unknown[]) => (c[0] as { data: { channel: string } }).data.channel,
    );
    expect(channels).toContain("email");
    expect(channels).toContain("sms");
  });

  it("does NOT send SMS for non-augmented templates (e.g. welcome)", async () => {
    prismaMock.parentNurtureStep.findMany.mockResolvedValue([
      makeStep({ templateKey: "welcome" }),
    ]);

    const res = await POST(createRequest("POST", "/api/cron/nurture-send"));
    expect(res.status).toBe(200);

    expect(resendSendMock).toHaveBeenCalledOnce();
    expect(sendSmsMock).not.toHaveBeenCalled();
  });

  it("skips SMS when smsOptIn is false (even if mobile is on file)", async () => {
    prismaMock.parentNurtureStep.findMany.mockResolvedValue([
      makeStep({
        contact: {
          firstName: "Aysha",
          email: "aysha@example.com",
          subscribed: true,
          mobile: "+61412345678",
          smsOptIn: false,
        },
      }),
    ]);

    const res = await POST(createRequest("POST", "/api/cron/nurture-send"));
    expect(res.status).toBe(200);

    expect(resendSendMock).toHaveBeenCalledOnce();
    expect(sendSmsMock).not.toHaveBeenCalled();
  });

  it("skips SMS when mobile is null", async () => {
    prismaMock.parentNurtureStep.findMany.mockResolvedValue([
      makeStep({
        contact: {
          firstName: "Aysha",
          email: "aysha@example.com",
          subscribed: true,
          mobile: null,
          smsOptIn: true,
        },
      }),
    ]);

    const res = await POST(createRequest("POST", "/api/cron/nurture-send"));
    expect(res.status).toBe(200);

    expect(sendSmsMock).not.toHaveBeenCalled();
  });

  it("still marks step as sent even if SMS dispatch throws", async () => {
    prismaMock.parentNurtureStep.findMany.mockResolvedValue([makeStep()]);
    sendSmsMock.mockRejectedValue(new Error("SMS provider boom"));

    const res = await POST(createRequest("POST", "/api/cron/nurture-send"));
    expect(res.status).toBe(200);

    // Email sent, step row marked sent
    expect(resendSendMock).toHaveBeenCalledOnce();
    const updateCalls = prismaMock.parentNurtureStep.update.mock.calls;
    const sentCall = updateCalls.find(
      (c: unknown[]) => (c[0] as { data: { status: string } }).data.status === "sent",
    );
    expect(sentCall).toBeDefined();
  });
});
