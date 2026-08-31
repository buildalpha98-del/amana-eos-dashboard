/**
 * POST /api/families/[id]/remind — enrolment reminder records a "lifecycle"
 * row in the marketing frequency-cap ledger (Phase 7).
 *
 * Recorded, NEVER blocked: only actually-sent recipients count (suppressed →
 * sent: [] → no row), a send failure surfaces as 502 (staff must know it
 * didn't go) with no ledger row, and a ledger failure must never fail the
 * request (recordMarketingSends swallows its own errors).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "test-req-id",
}));

vi.mock("@/lib/email-templates/parent-account", () => ({
  parentEnrolmentReminderEmail: vi.fn(async () => ({
    subject: "Finish your enrolment",
    html: "<p>remind</p>",
  })),
}));

vi.mock("@/lib/parent-account", () => ({
  findEnrolmentIdsForEmail: vi.fn(async () => ({ enrolmentIds: [] })),
}));

vi.mock("@/lib/parent-enrolment-state", () => ({
  getParentEnrolmentState: vi.fn(() => "needs_enrolment"),
}));

type SendResult = { messageId?: string; suppressed: string[]; sent: string[] };
const sendEmailMock = vi.fn<(p: { to: string | string[] }) => Promise<SendResult>>();
vi.mock("@/lib/email", () => ({
  sendEmail: (p: { to: string | string[] }) => sendEmailMock(p),
  FROM_EMAIL: "Amana OSHC <test@amanaoshc.com.au>",
}));

import { POST } from "@/app/api/families/[id]/remind/route";

const ctx = (id = "fam-1") => ({ params: Promise.resolve({ id }) }) as never;

describe("POST /api/families/[id]/remind — lifecycle ledger write", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    mockSession({ id: "user-1", name: "Admin", role: "admin" });
    prismaMock.user.findUnique.mockResolvedValue({ active: true });

    prismaMock.parentAccount.findUnique.mockResolvedValue({
      id: "fam-1",
      email: "Parent@Example.com",
      firstName: "Jane",
      enrolmentReminderSentAt: null,
      enrolmentDraft: null,
    });
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([]);
    prismaMock.parentAccount.update.mockResolvedValue({ id: "fam-1" });
    prismaMock.activityLog.create.mockResolvedValue({ id: "log-1" });
    prismaMock.marketingSendRecipient.createMany.mockResolvedValue({ count: 1 });

    sendEmailMock.mockImplementation(async (p) => ({
      sent: [Array.isArray(p.to) ? p.to[0] : p.to],
      suppressed: [],
      messageId: "m-1",
    }));
  });

  it("records a lifecycle ledger row (lowercased) after a successful send", async () => {
    const res = await POST(
      createRequest("POST", "/api/families/fam-1/remind", { body: {} }),
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(sendEmailMock).toHaveBeenCalled();
    expect(prismaMock.marketingSendRecipient.createMany).toHaveBeenCalledWith({
      data: [
        {
          email: "parent@example.com",
          contactId: null,
          deliveryLogId: null,
          source: "lifecycle",
        },
      ],
    });
  });

  it("records nothing when the recipient was suppressed (sent: [])", async () => {
    sendEmailMock.mockResolvedValue({ sent: [], suppressed: ["Parent@Example.com"] });

    const res = await POST(
      createRequest("POST", "/api/families/fam-1/remind", { body: {} }),
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.marketingSendRecipient.createMany).not.toHaveBeenCalled();
  });

  it("returns 502 and records nothing when the send fails", async () => {
    sendEmailMock.mockRejectedValue(new Error("resend down"));

    const res = await POST(
      createRequest("POST", "/api/families/fam-1/remind", { body: {} }),
      ctx(),
    );
    expect(res.status).toBe(502);
    expect(prismaMock.marketingSendRecipient.createMany).not.toHaveBeenCalled();
  });

  it("a ledger-write failure never fails the request", async () => {
    prismaMock.marketingSendRecipient.createMany.mockRejectedValue(new Error("db down"));

    const res = await POST(
      createRequest("POST", "/api/families/fam-1/remind", { body: {} }),
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.marketingSendRecipient.createMany).toHaveBeenCalled();
  });
});
