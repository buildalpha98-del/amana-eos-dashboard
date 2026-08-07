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
}));

import { sendAssignmentEmail } from "@/lib/send-assignment-email";
import { sendEmail, getResend } from "@/lib/email";

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
