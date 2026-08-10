/**
 * POST /api/enrol/send-link — enrol-link email records a "lifecycle" row in
 * the marketing frequency-cap ledger (Phase 7).
 *
 * Recorded, NEVER blocked: only actually-sent recipients count (suppressed →
 * sent: [] → no row), and a ledger failure must never fail the request
 * (recordMarketingSends swallows its own errors).
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

vi.mock("@/lib/email-templates", () => ({
  enrolmentLinkEmail: vi.fn(async () => ({
    subject: "Complete your enrolment",
    html: "<p>enrol</p>",
  })),
}));

type SendResult = { messageId?: string; suppressed: string[]; sent: string[] };
const sendEmailMock = vi.fn<(p: { to: string | string[] }) => Promise<SendResult>>();
vi.mock("@/lib/email", () => ({
  sendEmail: (p: { to: string | string[] }) => sendEmailMock(p),
  FROM_EMAIL: "Amana OSHC <test@amanaoshc.com.au>",
}));

import { POST } from "@/app/api/enrol/send-link/route";

const body = {
  parentName: "Jane Doe",
  parentEmail: "Parent@Example.com",
  enquiryId: "enq-1",
};

describe("POST /api/enrol/send-link — lifecycle ledger write", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    mockSession({ id: "user-1", name: "Admin", role: "admin" });
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.marketingSendRecipient.createMany.mockResolvedValue({ count: 1 });

    sendEmailMock.mockImplementation(async (p) => ({
      sent: [Array.isArray(p.to) ? p.to[0] : p.to],
      suppressed: [],
      messageId: "m-1",
    }));
  });

  it("records a lifecycle ledger row (lowercased) after a successful send", async () => {
    const res = await POST(createRequest("POST", "/api/enrol/send-link", { body }));
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
    sendEmailMock.mockResolvedValue({ sent: [], suppressed: [body.parentEmail] });

    const res = await POST(createRequest("POST", "/api/enrol/send-link", { body }));
    expect(res.status).toBe(200);
    expect(prismaMock.marketingSendRecipient.createMany).not.toHaveBeenCalled();
  });

  it("records nothing when the send itself fails", async () => {
    sendEmailMock.mockRejectedValue(new Error("resend down"));

    const res = await POST(createRequest("POST", "/api/enrol/send-link", { body }));
    expect(res.status).toBe(500);
    expect(prismaMock.marketingSendRecipient.createMany).not.toHaveBeenCalled();
  });

  it("a ledger-write failure never fails the request", async () => {
    prismaMock.marketingSendRecipient.createMany.mockRejectedValue(new Error("db down"));

    const res = await POST(createRequest("POST", "/api/enrol/send-link", { body }));
    expect(res.status).toBe(200);
    expect(prismaMock.marketingSendRecipient.createMany).toHaveBeenCalled();
  });
});
