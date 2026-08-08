import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

// ── Standard mock preamble ──────────────────────────────────────
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
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 }),
  ),
}));

vi.mock("@/lib/brevo", () => ({
  isBrevoConfigured: vi.fn(() => true),
  sendTransactionalEmail: vi.fn(),
  sendCampaignEmail: vi.fn(),
}));

vi.mock("@/lib/email-suppression", () => ({
  getSuppressedEmails: vi.fn(),
}));

vi.mock("@/lib/frequency-cap", async () => {
  const actual = await vi.importActual<typeof import("@/lib/frequency-cap")>(
    "@/lib/frequency-cap",
  );
  return {
    ...actual,
    getFrequencyCapped: vi.fn(),
    recordMarketingSends: vi.fn(),
  };
});

import { sendTransactionalEmail } from "@/lib/brevo";
import { getSuppressedEmails } from "@/lib/email-suppression";
import { getFrequencyCapped, recordMarketingSends } from "@/lib/frequency-cap";

const mockedSendTransactional = vi.mocked(sendTransactionalEmail);
const mockedGetSuppressedEmails = vi.mocked(getSuppressedEmails);
const mockedGetFrequencyCapped = vi.mocked(getFrequencyCapped);
const mockedRecordMarketingSends = vi.mocked(recordMarketingSends);

import { POST } from "@/app/api/email/reports/[deliveryLogId]/resend/route";

const ctx = (deliveryLogId: string) =>
  ({ params: Promise.resolve({ deliveryLogId }) }) as never;

function setupActiveUserMock(role = "owner") {
  prismaMock.user.findUnique.mockReset();
  prismaMock.user.findUnique.mockImplementation(
    async (args: { where?: { id?: string } } | undefined) => {
      if (args?.where?.id === "user-1") {
        return { active: true, id: "user-1", role } as never;
      }
      return null;
    },
  );
}

/** A partial <50 per-recipient row with two failed recipients — the resend input. */
function originalRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "dl-orig",
    status: "partial",
    channel: "email",
    serviceCode: "SVC1",
    messageType: "newsletter",
    subject: "Term 3 newsletter",
    renderedHtml: "<p>stored rendering</p>",
    payload: {
      subject: "Term 3 newsletter",
      htmlContent: "<p>original body</p>",
      _suppressedCount: 1,
      _cappedCount: 0,
      _sentMessageIds: [{ email: "ok@x.com", messageId: "<id-ok>" }],
      _failedRecipients: ["a@x.com", "b@x.com"],
    },
    ...overrides,
  };
}

function resend(id = "dl-orig") {
  return POST(
    createRequest("POST", `/api/email/reports/${id}/resend`),
    ctx(id),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  setupActiveUserMock();
  mockSession({ id: "user-1", name: "Owner", role: "owner" });
  mockedGetSuppressedEmails.mockResolvedValue(new Set());
  mockedGetFrequencyCapped.mockResolvedValue(new Set());
  mockedRecordMarketingSends.mockResolvedValue(undefined);
  mockedSendTransactional.mockResolvedValue({ messageId: "<msg-new>" });
  prismaMock.orgSettings.findUnique.mockResolvedValue(null);
  prismaMock.deliveryLog.findUnique.mockResolvedValue(originalRow());
  prismaMock.deliveryLog.create.mockImplementation(
    async (args: { data: Record<string, unknown> }) =>
      ({ id: "dl-new", ...args.data }) as never,
  );
  prismaMock.deliveryLog.update.mockResolvedValue({} as never);
});

describe("POST /api/email/reports/[deliveryLogId]/resend — auth", () => {
  it("rejects an unauthenticated request with 401", async () => {
    mockNoSession();

    const res = await resend();
    expect(res.status).toBe(401);
    expect(prismaMock.deliveryLog.findUnique).not.toHaveBeenCalled();
  });

  it.each(["owner", "head_office", "admin", "marketing"] as const)(
    "allows role %s",
    async (role) => {
      setupActiveUserMock(role);
      mockSession({ id: "user-1", name: "U", role });

      const res = await resend();
      expect(res.status).toBe(200);
    },
  );

  it("rejects member role with 403 without touching the DB", async () => {
    setupActiveUserMock("member");
    mockSession({ id: "user-1", name: "Member", role: "member" });

    const res = await resend();
    expect(res.status).toBe(403);
    expect(prismaMock.deliveryLog.findUnique).not.toHaveBeenCalled();
    expect(mockedSendTransactional).not.toHaveBeenCalled();
  });
});

describe("POST /api/email/reports/[deliveryLogId]/resend — guards", () => {
  it("returns 404 for an unknown delivery log id", async () => {
    prismaMock.deliveryLog.findUnique.mockResolvedValue(null);

    const res = await resend("nope");
    expect(res.status).toBe(404);
    expect(prismaMock.deliveryLog.create).not.toHaveBeenCalled();
    expect(mockedSendTransactional).not.toHaveBeenCalled();
  });

  it.each(["sent", "scheduled", "failed", "sending", "cancelled"])(
    "returns 409 when the original's status is %s (only partial sends are resendable)",
    async (status) => {
      prismaMock.deliveryLog.findUnique.mockResolvedValue(
        originalRow({ status }),
      );

      const res = await resend();
      expect(res.status).toBe(409);
      expect(prismaMock.deliveryLog.create).not.toHaveBeenCalled();
      expect(mockedSendTransactional).not.toHaveBeenCalled();
    },
  );

  it("returns 409 when _failedRecipients is missing", async () => {
    prismaMock.deliveryLog.findUnique.mockResolvedValue(
      originalRow({ payload: { subject: "x" } }),
    );

    const res = await resend();
    expect(res.status).toBe(409);
    expect(prismaMock.deliveryLog.create).not.toHaveBeenCalled();
  });

  it("returns 409 when _failedRecipients is empty", async () => {
    prismaMock.deliveryLog.findUnique.mockResolvedValue(
      originalRow({ payload: { _failedRecipients: [] } }),
    );

    const res = await resend();
    expect(res.status).toBe(409);
    expect(prismaMock.deliveryLog.create).not.toHaveBeenCalled();
  });

  it("returns 409 with a compose-fresh message when renderedHtml is null", async () => {
    prismaMock.deliveryLog.findUnique.mockResolvedValue(
      originalRow({ renderedHtml: null }),
    );

    const res = await resend();
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/predates stored content/i);
    expect(json.error).toMatch(/compose a fresh send/i);
    expect(prismaMock.deliveryLog.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/email/reports/[deliveryLogId]/resend — suppression re-check", () => {
  it("re-checks suppression over the FAILED list and skips since-suppressed addresses", async () => {
    // The original failure may have triggered an auto-suppression (bounce) —
    // the retry must not mail an address that has since been suppressed.
    mockedGetSuppressedEmails.mockResolvedValue(new Set(["b@x.com"]));

    const res = await resend();
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(mockedGetSuppressedEmails).toHaveBeenCalledWith([
      "a@x.com",
      "b@x.com",
    ]);
    expect(mockedSendTransactional).toHaveBeenCalledTimes(1);
    expect(mockedSendTransactional.mock.calls[0][0].to).toEqual([
      { email: "a@x.com" },
    ]);
    expect(json.suppressedCount).toBe(1);
    expect(json.sentCount).toBe(1);

    const createArgs = prismaMock.deliveryLog.create.mock.calls[0][0];
    expect(createArgs.data.recipientCount).toBe(1);
    expect(
      (createArgs.data.payload as { _suppressedCount: number })._suppressedCount,
    ).toBe(1);
  });

  it("compares suppression lowercase-to-lowercase (casing pin)", async () => {
    prismaMock.deliveryLog.findUnique.mockResolvedValue(
      originalRow({
        payload: { _failedRecipients: ["A@X.com", "b@x.com"] },
      }),
    );
    mockedGetSuppressedEmails.mockResolvedValue(new Set(["a@x.com"]));

    const res = await resend();
    expect(res.status).toBe(200);

    expect(mockedSendTransactional).toHaveBeenCalledTimes(1);
    expect(mockedSendTransactional.mock.calls[0][0].to).toEqual([
      { email: "b@x.com" },
    ]);
  });

  it("returns 409 (no new row) when ALL failed recipients have since been suppressed", async () => {
    mockedGetSuppressedEmails.mockResolvedValue(
      new Set(["a@x.com", "b@x.com"]),
    );

    const res = await resend();
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/suppressed/i);
    expect(prismaMock.deliveryLog.create).not.toHaveBeenCalled();
    expect(mockedSendTransactional).not.toHaveBeenCalled();
    expect(mockedRecordMarketingSends).not.toHaveBeenCalled();
  });

  it("NEVER consults the frequency cap — a resend is a retry of an already-attempted send", async () => {
    mockedGetFrequencyCapped.mockResolvedValue(new Set(["a@x.com", "b@x.com"]));

    const res = await resend();
    expect(res.status).toBe(200);

    expect(mockedGetFrequencyCapped).not.toHaveBeenCalled();
    expect(mockedSendTransactional).toHaveBeenCalledTimes(2);
  });
});

describe("POST /api/email/reports/[deliveryLogId]/resend — new-row lifecycle", () => {
  it("pre-creates the new DeliveryLog as 'sending' copying the original's identity fields", async () => {
    const res = await resend();
    expect(res.status).toBe(200);

    expect(prismaMock.deliveryLog.create).toHaveBeenCalledTimes(1);
    const createArgs = prismaMock.deliveryLog.create.mock.calls[0][0];
    expect(createArgs.data).toEqual(
      expect.objectContaining({
        channel: "email",
        status: "sending",
        externalIdType: "brevo_message_per_recipient",
        messageType: "newsletter",
        serviceCode: "SVC1",
        subject: "Term 3 newsletter",
        recipientCount: 2,
      }),
    );
    expect(createArgs.data.payload).toEqual({
      _resendOfDeliveryLogId: "dl-orig",
      _suppressedCount: 0,
    });
  });

  it("dispatches one send per failed recipient with the NEW row's dl: tag, stored HTML + subject column", async () => {
    const res = await resend();
    expect(res.status).toBe(200);

    expect(mockedSendTransactional).toHaveBeenCalledTimes(2);
    const emails = mockedSendTransactional.mock.calls
      .map((c) => c[0].to[0].email)
      .sort();
    expect(emails).toEqual(["a@x.com", "b@x.com"]);
    for (const call of mockedSendTransactional.mock.calls) {
      expect(call[0].to).toHaveLength(1);
      expect(call[0].tags).toEqual(["dl:dl-new"]);
      expect(call[0].subject).toBe("Term 3 newsletter");
      expect(call[0].htmlContent).toBe("<p>stored rendering</p>");
      expect(call[0].scheduledAt).toBeUndefined();
    }
  });

  it("terminal-updates the SAME row to 'sent' with sentAt + filtered _sentMessageIds", async () => {
    mockedSendTransactional.mockImplementation(
      async (params: { to: Array<{ email: string }> }) => {
        // One real id, one "unknown" fallback — the latter must be filtered.
        if (params.to[0].email === "b@x.com") return { messageId: "unknown" };
        return { messageId: `<id-${params.to[0].email}>` };
      },
    );

    const res = await resend();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      deliveryLogId: "dl-new",
      sentCount: 2,
      failedCount: 0,
      suppressedCount: 0,
    });

    // Terminal update targets the pre-created row — no second create.
    expect(prismaMock.deliveryLog.create).toHaveBeenCalledTimes(1);
    const terminal = prismaMock.deliveryLog.update.mock.calls.find(
      (c) => c[0].where.id === "dl-new",
    )![0];
    expect(terminal.data.status).toBe("sent");
    expect(terminal.data.sentAt).toBeInstanceOf(Date);
    const payload = terminal.data.payload as {
      _resendOfDeliveryLogId: string;
      _sentMessageIds: Array<{ email: string; messageId: string }>;
    };
    expect(payload._resendOfDeliveryLogId).toBe("dl-orig");
    expect(payload._sentMessageIds).toEqual([
      { email: "a@x.com", messageId: "<id-a@x.com>" },
    ]);
  });

  it("partial retry → status 'partial' with _failedRecipients + sentAt, 200 with counts", async () => {
    mockedSendTransactional.mockImplementation(
      async (params: { to: Array<{ email: string }> }) => {
        if (params.to[0].email === "b@x.com") {
          throw new Error("Brevo transactional send failed (500): boom");
        }
        return { messageId: "<id-a>" };
      },
    );

    const res = await resend();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      deliveryLogId: "dl-new",
      sentCount: 1,
      failedCount: 1,
      suppressedCount: 0,
    });

    const terminal = prismaMock.deliveryLog.update.mock.calls.find(
      (c) => c[0].where.id === "dl-new",
    )![0];
    expect(terminal.data.status).toBe("partial");
    expect(terminal.data.sentAt).toBeInstanceOf(Date);
    expect(
      (terminal.data.payload as { _failedRecipients: string[] })
        ._failedRecipients,
    ).toEqual(["b@x.com"]);
  });

  it("total failure → same row 'failed' (no sentAt), 502 with failedCount, original NOT stamped", async () => {
    mockedSendTransactional.mockRejectedValue(
      new Error("Brevo transactional send failed (500): down"),
    );

    const res = await resend();
    // Mirrors campaign/send: a dispatch where NOTHING went out is a 502 with
    // the row updated to "failed" on the same pre-created row.
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json).toEqual(
      expect.objectContaining({
        deliveryLogId: "dl-new",
        sentCount: 0,
        failedCount: 2,
        suppressedCount: 0,
      }),
    );

    expect(prismaMock.deliveryLog.create).toHaveBeenCalledTimes(1);
    const terminal = prismaMock.deliveryLog.update.mock.calls.find(
      (c) => c[0].where.id === "dl-new",
    )![0];
    expect(terminal.data.status).toBe("failed");
    expect(terminal.data.sentAt).toBeFalsy();

    // Nothing was delivered — the original stays unstamped so the user can
    // retry again once Brevo recovers.
    const origUpdates = prismaMock.deliveryLog.update.mock.calls.filter(
      (c) => c[0].where.id === "dl-orig",
    );
    expect(origUpdates).toHaveLength(0);
  });
});

describe("POST /api/email/reports/[deliveryLogId]/resend — original stamp + ledger", () => {
  it("stamps _resendDeliveryLogId onto the ORIGINAL's payload preserving all other keys", async () => {
    const res = await resend();
    expect(res.status).toBe(200);

    const origUpdate = prismaMock.deliveryLog.update.mock.calls.find(
      (c) => c[0].where.id === "dl-orig",
    )![0];
    expect(origUpdate.data.payload).toEqual({
      subject: "Term 3 newsletter",
      htmlContent: "<p>original body</p>",
      _suppressedCount: 1,
      _cappedCount: 0,
      _sentMessageIds: [{ email: "ok@x.com", messageId: "<id-ok>" }],
      _failedRecipients: ["a@x.com", "b@x.com"],
      _resendDeliveryLogId: "dl-new",
    });
    // Only the payload is touched — the original's status/counters are the
    // report denominators and must never change.
    expect(Object.keys(origUpdate.data)).toEqual(["payload"]);
  });

  it("records the retry's SUCCESSES in the send ledger with source 'resend' + the new row's id", async () => {
    mockedSendTransactional.mockImplementation(
      async (params: { to: Array<{ email: string }> }) => {
        if (params.to[0].email === "b@x.com") {
          throw new Error("boom");
        }
        return { messageId: "<id-a>" };
      },
    );

    const res = await resend();
    expect(res.status).toBe(200);

    expect(mockedRecordMarketingSends).toHaveBeenCalledTimes(1);
    expect(mockedRecordMarketingSends).toHaveBeenCalledWith(
      expect.anything(),
      [{ email: "a@x.com" }],
      { deliveryLogId: "dl-new", source: "resend" },
    );
  });

  it("hands the ledger an EMPTY list on total failure (lib no-ops)", async () => {
    mockedSendTransactional.mockRejectedValue(new Error("down"));

    const res = await resend();
    expect(res.status).toBe(502);

    expect(mockedRecordMarketingSends).toHaveBeenCalledWith(
      expect.anything(),
      [],
      { deliveryLogId: "dl-new", source: "resend" },
    );
  });
});
