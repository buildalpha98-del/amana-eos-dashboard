/**
 * POST /api/enrol — public enrolment submission.
 *
 * Focus: the enquiry stage-event log. The route updates a linked
 * enquiry to `stage: "enrolled"` inside the submission transaction —
 * this covers that the resulting stage event is logged (Task 5's
 * attributed-enrolments count depends on it) without re-testing the
 * whole submission/validation surface.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "@/__tests__/helpers/prisma-mock";
import { createRequest } from "@/__tests__/helpers/request";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false })),
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  generateRequestId: () => "test-req-id",
}));
vi.mock("@/lib/teams-notify", () => ({
  sendTeamsNotification: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(() => Promise.resolve()),
  FROM_EMAIL: "noreply@amanaoshc.com.au",
}));
vi.mock("@/lib/email-templates", () => ({
  enrolmentConfirmationEmail: vi.fn(() =>
    Promise.resolve({ subject: "Welcome", html: "<p>Welcome</p>" }),
  ),
  schoolEnrolmentNotificationEmail: vi.fn(() => ({
    subject: "New enrolment",
    html: "<p>New enrolment</p>",
  })),
}));

const logStageEvent = vi.fn(() => Promise.resolve());
vi.mock("@/lib/enquiry-stage-events", () => ({
  logEnquiryStageEvent: (...a: unknown[]) => logStageEvent(...(a as [])),
}));

import { POST } from "@/app/api/enrol/route";

function validBody(overrides?: Record<string, unknown>) {
  return {
    children: [{ firstName: "Amy", surname: "Doe", dob: "2018-01-01", crn: "CRN1" }],
    primaryParent: {
      firstName: "Jane",
      surname: "Doe",
      email: "jane@example.com",
      mobile: "0400000000",
    },
    consents: {},
    payment: {
      method: "bank_account",
      bankAccountName: "Jane Doe",
      bankBsb: "123456",
      bankAccountNumber: "12345678",
    },
    termsAccepted: true,
    privacyAccepted: true,
    debitAgreement: true,
    signature: "sig-data",
    ...overrides,
  };
}

describe("POST /api/enrol — stage-event logging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.enrolmentSubmission.create.mockResolvedValue({ id: "sub-1", token: "tok-1" });
    prismaMock.child.create.mockResolvedValue({ id: "child-1" });
    prismaMock.parentEnquiry.update.mockResolvedValue({});
  });

  it("logs (enquiryId, priorStage, 'enrolled') when the submission enrols a linked enquiry", async () => {
    prismaMock.parentEnquiry.findFirst.mockResolvedValue({
      id: "enq-1",
      serviceId: "svc-1",
      stage: "form_started",
    });

    const res = await POST(
      createRequest("POST", "/api/enrol", {
        body: validBody({ prefillToken: "enq-1" }),
      }),
    );

    expect(res.status).toBe(200);
    expect(logStageEvent).toHaveBeenCalledWith("enq-1", "form_started", "enrolled");
  });

  it("does not log a stage event when the linked enquiry is already enrolled", async () => {
    prismaMock.parentEnquiry.findFirst.mockResolvedValue({
      id: "enq-1",
      serviceId: "svc-1",
      stage: "enrolled",
    });

    const res = await POST(
      createRequest("POST", "/api/enrol", {
        body: validBody({ prefillToken: "enq-1" }),
      }),
    );

    expect(res.status).toBe(200);
    expect(logStageEvent).not.toHaveBeenCalled();
  });

  it("does not log a stage event when there is no linked enquiry", async () => {
    const res = await POST(
      createRequest("POST", "/api/enrol", { body: validBody() }),
    );

    expect(res.status).toBe(200);
    expect(prismaMock.parentEnquiry.update).not.toHaveBeenCalled();
    expect(logStageEvent).not.toHaveBeenCalled();
  });
});
