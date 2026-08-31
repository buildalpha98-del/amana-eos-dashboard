/**
 * PATCH /api/enquiries/[id] — waitlist confirmation email records a
 * "lifecycle" row in the marketing frequency-cap ledger (Phase 7).
 *
 * Recorded, NEVER blocked: the confirmation counts toward the parent's
 * weekly marketing-email volume so bulk sends see it, but the lifecycle
 * send itself is never cap-gated. Only actually-sent recipients are
 * recorded (suppressed → sent: [] → no row), and a ledger failure must
 * never fail the PATCH (the send is fire-and-forget here anyway).
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

// Post-response side effects (runAfter falls back to inline in tests).
vi.mock("@/lib/enquiry-stage-events", () => ({
  logEnquiryStageEvent: vi.fn(async () => {}),
}));
vi.mock("@/lib/nurture-scheduler", () => ({
  scheduleNurtureFromStageChange: vi.fn(async () => {}),
}));

vi.mock("@/lib/email-templates", () => ({
  waitlistConfirmationEmail: vi.fn(async () => ({
    subject: "You're on the waitlist",
    html: "<p>waitlist</p>",
  })),
}));

type SendResult = { messageId?: string; suppressed: string[]; sent: string[] };
const sendEmailMock = vi.fn<(p: { to: string | string[] }) => Promise<SendResult>>();
vi.mock("@/lib/email", () => ({
  sendEmail: (p: { to: string | string[] }) => sendEmailMock(p),
  FROM_EMAIL: "Amana OSHC <test@amanaoshc.com.au>",
}));

import { PATCH } from "@/app/api/enquiries/[id]/route";

const ctx = (id = "enq-1") => ({ params: Promise.resolve({ id }) }) as never;

/** Flush the fire-and-forget send chain (microtasks + a macrotask). */
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("PATCH /api/enquiries/[id] — waitlist ledger write", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    mockSession({ id: "user-1", name: "Admin", role: "admin" });
    prismaMock.user.findUnique.mockResolvedValue({ active: true });

    prismaMock.parentEnquiry.findUnique.mockResolvedValue({
      stage: "engaged",
      stageChangedAt: new Date("2026-08-01T00:00:00Z"),
      serviceId: "svc-1",
      parentName: "Jane Doe",
      parentEmail: "Parent@Example.com",
    });
    prismaMock.$queryRaw.mockResolvedValue([{ pos: BigInt(3) }]);
    prismaMock.service.findUnique.mockResolvedValue({ name: "Test OSHC" });
    prismaMock.parentEnquiry.update.mockResolvedValue({ id: "enq-1" });
    prismaMock.marketingSendRecipient.createMany.mockResolvedValue({ count: 1 });

    sendEmailMock.mockImplementation(async (p) => ({
      sent: [Array.isArray(p.to) ? p.to[0] : p.to],
      suppressed: [],
      messageId: "m-1",
    }));
  });

  it("records a lifecycle ledger row (lowercased) after a successful send", async () => {
    const res = await PATCH(
      createRequest("PATCH", "/api/enquiries/enq-1", { body: { stage: "waitlisted" } }),
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(sendEmailMock).toHaveBeenCalled();

    await vi.waitFor(() => {
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
  });

  it("records nothing when the recipient was suppressed (sent: [])", async () => {
    sendEmailMock.mockResolvedValue({ sent: [], suppressed: ["Parent@Example.com"] });

    const res = await PATCH(
      createRequest("PATCH", "/api/enquiries/enq-1", { body: { stage: "waitlisted" } }),
      ctx(),
    );
    expect(res.status).toBe(200);

    await flush();
    expect(prismaMock.marketingSendRecipient.createMany).not.toHaveBeenCalled();
  });

  it("records nothing when the send fails — and the PATCH still succeeds", async () => {
    sendEmailMock.mockRejectedValue(new Error("resend down"));

    const res = await PATCH(
      createRequest("PATCH", "/api/enquiries/enq-1", { body: { stage: "waitlisted" } }),
      ctx(),
    );
    expect(res.status).toBe(200); // fire-and-forget: the send never fails the update

    await flush();
    expect(prismaMock.marketingSendRecipient.createMany).not.toHaveBeenCalled();
  });

  it("a ledger-write failure never fails the PATCH", async () => {
    prismaMock.marketingSendRecipient.createMany.mockRejectedValue(new Error("db down"));

    const res = await PATCH(
      createRequest("PATCH", "/api/enquiries/enq-1", { body: { stage: "waitlisted" } }),
      ctx(),
    );
    expect(res.status).toBe(200);

    await flush();
    expect(prismaMock.marketingSendRecipient.createMany).toHaveBeenCalled();
  });
});
