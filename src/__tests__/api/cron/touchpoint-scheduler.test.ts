/**
 * GET /api/cron/touchpoint-scheduler — CRM drip auto-emails record a
 * "lifecycle" row in the marketing frequency-cap ledger (Phase 7).
 *
 * Recorded, NEVER blocked: only actually-sent recipients count (suppressed →
 * sent: [] → no row), a send failure is collected into `errors` with no
 * ledger row, and a ledger failure must never fail the cron run
 * (recordMarketingSends swallows its own errors).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";
import { createRequest } from "../../helpers/request";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "test-req-id",
}));

type SendResult = { messageId?: string; suppressed: string[]; sent: string[] };
const sendEmailMock = vi.fn<(p: { to: string | string[] }) => Promise<SendResult>>();
vi.mock("@/lib/email", () => ({
  getResend: () => ({}),
  sendEmail: (p: { to: string | string[] }) => sendEmailMock(p),
  FROM_EMAIL: "Amana OSHC <test@amanaoshc.com.au>",
}));

import { GET } from "@/app/api/cron/touchpoint-scheduler/route";

const ORIGINAL_ENV = { ...process.env };

const authedRequest = () =>
  createRequest("GET", "/api/cron/touchpoint-scheduler", {
    headers: { authorization: "Bearer test-cron-secret" },
  });

describe("GET /api/cron/touchpoint-scheduler — lifecycle ledger write", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";

    prismaMock.cronRun.findUnique.mockResolvedValue(null);
    prismaMock.cronRun.create.mockResolvedValue({ id: "run-1" });
    prismaMock.cronRun.update.mockResolvedValue({ id: "run-1" });

    prismaMock.lead.findMany.mockResolvedValue([
      {
        id: "lead-1",
        schoolName: "Test Primary",
        contactName: "Sam",
        contactEmail: "Lead@School.edu.au",
        pipelineStage: "contact_made",
        source: "school",
        assignedToId: null,
        assignedTo: null,
      },
    ]);
    prismaMock.crmEmailTemplate.findFirst.mockResolvedValue({
      subject: "Hi {{contactName}}",
      body: "Hello from Amana",
      triggerStage: "contact_made",
      pipeline: null,
    });
    prismaMock.touchpointLog.create.mockResolvedValue({ id: "tp-1" });
    prismaMock.lead.update.mockResolvedValue({ id: "lead-1" });
    prismaMock.marketingSendRecipient.createMany.mockResolvedValue({ count: 1 });

    sendEmailMock.mockImplementation(async (p) => ({
      sent: [Array.isArray(p.to) ? p.to[0] : p.to],
      suppressed: [],
      messageId: "m-1",
    }));
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("rejects requests without the cron secret", async () => {
    const res = await GET(createRequest("GET", "/api/cron/touchpoint-scheduler"));
    expect(res.status).toBe(401);
    expect(prismaMock.marketingSendRecipient.createMany).not.toHaveBeenCalled();
  });

  it("records a lifecycle ledger row (lowercased) after a successful drip send", async () => {
    const res = await GET(authedRequest());
    expect(res.status).toBe(200);
    expect(sendEmailMock).toHaveBeenCalled();
    expect(prismaMock.marketingSendRecipient.createMany).toHaveBeenCalledWith({
      data: [
        {
          email: "lead@school.edu.au",
          contactId: null,
          deliveryLogId: null,
          source: "lifecycle",
        },
      ],
    });
  });

  it("records nothing when the recipient was suppressed (sent: [])", async () => {
    sendEmailMock.mockResolvedValue({ sent: [], suppressed: ["Lead@School.edu.au"] });

    const res = await GET(authedRequest());
    expect(res.status).toBe(200);
    expect(prismaMock.marketingSendRecipient.createMany).not.toHaveBeenCalled();
  });

  it("records nothing when the send fails — the cron still completes", async () => {
    sendEmailMock.mockRejectedValue(new Error("resend down"));

    const res = await GET(authedRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.errors?.length).toBe(1);
    expect(prismaMock.marketingSendRecipient.createMany).not.toHaveBeenCalled();
  });

  it("a ledger-write failure never fails the cron run", async () => {
    prismaMock.marketingSendRecipient.createMany.mockRejectedValue(new Error("db down"));

    const res = await GET(authedRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.errors).toBeUndefined();
    expect(prismaMock.marketingSendRecipient.createMany).toHaveBeenCalled();
  });
});
