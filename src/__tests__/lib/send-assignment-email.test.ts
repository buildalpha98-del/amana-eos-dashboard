import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "@/__tests__/helpers/prisma-mock";

vi.mock("@/lib/email", () => ({
  getResend: vi.fn(() => ({})),
  sendEmail: vi.fn(async () => ({ suppressed: [], sent: ["staff@amana.test"] })),
  FROM_EMAIL: "Amana Test <test@amana.test>",
}));
vi.mock("@/lib/email-templates", () => ({
  todoAssignedEmail: vi.fn(async () => ({ subject: "Todo assigned", html: "<p>todo</p>" })),
  rockAssignedEmail: vi.fn(async () => ({ subject: "Rock assigned", html: "<p>rock</p>" })),
  issueAssignedEmail: vi.fn(async () => ({ subject: "Issue assigned", html: "<p>issue</p>" })),
  creativeRequestAssignedEmail: vi.fn(async () => ({ subject: "Request assigned", html: "<p>request</p>" })),
  creativeRequestSubmittedEmail: vi.fn(async () => ({ subject: "New design request", html: "<p>submitted</p>" })),
}));

import {
  sendAssignmentEmail,
  sendCreativeRequestSubmittedEmails,
} from "@/lib/send-assignment-email";
import { sendEmail, getResend } from "@/lib/email";
import { creativeRequestSubmittedEmail } from "@/lib/email-templates";

const ASSIGNEE_ID = "assignee-1";
const ASSIGNER_ID = "assigner-1";

function mockAssignee(overrides: Record<string, unknown> = {}) {
  prismaMock.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
    if (where.id === ASSIGNEE_ID) {
      return Promise.resolve({
        name: "Cameron Ogilvie",
        email: "staff@amana.test",
        // 2026-07-24 nudge policy: non-leadership roles only receive
        // assignment emails when receivesNudges is opted in — the base
        // fixture is leadership so the prefs/suppression paths under
        // test aren't masked by the role gate.
        role: "admin",
        active: true,
        receivesNudges: false,
        notificationsMuted: false,
        notificationPrefs: null,
        ...overrides,
      });
    }
    if (where.id === ASSIGNER_ID) {
      return Promise.resolve({ name: "Jayden" });
    }
    return Promise.resolve(null);
  });
}

const params = {
  type: "issue" as const,
  assigneeId: ASSIGNEE_ID,
  assignerId: ASSIGNER_ID,
  entityTitle: "Review Q3 scorecard",
};

describe("sendAssignmentEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getResend).mockReturnValue({} as ReturnType<typeof getResend>);
    mockAssignee();
  });

  it("sends through the suppression-aware sendEmail() wrapper", async () => {
    await sendAssignmentEmail(params);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const call = vi.mocked(sendEmail).mock.calls[0][0];
    expect(call.to).toBe("staff@amana.test");
    expect(call.subject).toBe("Issue assigned");
  });

  it("skips sending when the assignee has notifications muted", async () => {
    mockAssignee({ notificationsMuted: true });
    await sendAssignmentEmail(params);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("skips sending when the newAssignments preference is off", async () => {
    mockAssignee({ notificationPrefs: { newAssignments: false } });
    await sendAssignmentEmail(params);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("skips sending when the emailNotifications master preference is off", async () => {
    mockAssignee({ notificationPrefs: { emailNotifications: false } });
    await sendAssignmentEmail(params);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sends when stored prefs enable assignments even with other keys off", async () => {
    mockAssignee({
      notificationPrefs: { newAssignments: true, emailNotifications: true, announcements: false },
    });
    await sendAssignmentEmail(params);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("skips non-leadership assignees without the receivesNudges opt-in", async () => {
    mockAssignee({ role: "staff", receivesNudges: false });
    await sendAssignmentEmail(params);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sends to non-leadership assignees who opted in via receivesNudges", async () => {
    mockAssignee({ role: "staff", receivesNudges: true });
    await sendAssignmentEmail(params);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("creative_request bypasses the leadership gate for marketing assignees", async () => {
    mockAssignee({ role: "marketing", receivesNudges: false });
    await sendAssignmentEmail({
      type: "creative_request",
      assigneeId: ASSIGNEE_ID,
      assignerId: ASSIGNER_ID,
      entityTitle: "Holiday program poster",
      entityId: "req-1",
      entityNumber: "REQ-2026-0042",
    });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("no-ops when Resend is not configured", async () => {
    vi.mocked(getResend).mockReturnValue(null);
    await sendAssignmentEmail(params);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("no-ops when the assignee has no email", async () => {
    mockAssignee({ email: null });
    await sendAssignmentEmail(params);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("never rejects — sendEmail failures are swallowed and logged", async () => {
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("resend down"));
    await expect(sendAssignmentEmail(params)).resolves.toBeUndefined();
  });
});

describe("sendCreativeRequestSubmittedEmails", () => {
  const REQUESTER_ID = "requester-1";

  const submittedParams = {
    requestId: "req-1",
    requestNumber: "REQ-2026-0042",
    requestTitle: "Holiday program poster",
    requesterId: REQUESTER_ID,
  };

  function marketer(overrides: Record<string, unknown> = {}) {
    return {
      id: "mkt-1",
      name: "Shahbaz",
      email: "shahbaz@amana.test",
      role: "marketing",
      notificationsMuted: false,
      notificationPrefs: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getResend).mockReturnValue({} as ReturnType<typeof getResend>);
    prismaMock.user.findMany.mockResolvedValue([marketer()]);
    prismaMock.user.findUnique.mockResolvedValue({ name: "Jayden" });
  });

  it("queries only ACTIVE marketing users, excluding the requester", async () => {
    await sendCreativeRequestSubmittedEmails(submittedParams);

    expect(prismaMock.user.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.user.findMany.mock.calls[0][0].where).toEqual({
      role: "marketing",
      active: true,
      id: { not: REQUESTER_ID },
    });
  });

  it("emails each marketing user with a deep link to the request", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      marketer(),
      marketer({ id: "mkt-2", name: "Akram", email: "akram@amana.test" }),
    ]);

    await sendCreativeRequestSubmittedEmails(submittedParams);

    expect(sendEmail).toHaveBeenCalledTimes(2);
    const recipients = vi.mocked(sendEmail).mock.calls.map((c) => c[0].to);
    expect(recipients).toEqual(
      expect.arrayContaining(["shahbaz@amana.test", "akram@amana.test"]),
    );
    // Deep link + requester name reach the template
    expect(vi.mocked(creativeRequestSubmittedEmail)).toHaveBeenCalledWith(
      "Shahbaz",
      "Holiday program poster",
      "REQ-2026-0042",
      "Jayden",
      expect.stringContaining("/requests?open=req-1"),
    );
  });

  it("skips muted marketers and those with emailNotifications off", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      marketer({ notificationsMuted: true }),
      marketer({
        id: "mkt-2",
        email: "prefs-off@amana.test",
        notificationPrefs: { emailNotifications: false },
      }),
      marketer({ id: "mkt-3", email: "gets-it@amana.test" }),
    ]);

    await sendCreativeRequestSubmittedEmails(submittedParams);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0][0].to).toBe("gets-it@amana.test");
  });

  it("no-ops when Resend is not configured", async () => {
    vi.mocked(getResend).mockReturnValue(null);
    await sendCreativeRequestSubmittedEmails(submittedParams);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });

  it("never rejects — failures are swallowed and logged", async () => {
    vi.mocked(sendEmail).mockRejectedValue(new Error("resend down"));
    await expect(
      sendCreativeRequestSubmittedEmails(submittedParams),
    ).resolves.toBeUndefined();
  });
});
