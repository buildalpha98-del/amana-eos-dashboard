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
  cancelScheduledCampaign: vi.fn(),
  cancelScheduledMessage: vi.fn(),
}));

import { cancelScheduledCampaign, cancelScheduledMessage } from "@/lib/brevo";

const mockedCancelCampaign = vi.mocked(cancelScheduledCampaign);
const mockedCancelMessage = vi.mocked(cancelScheduledMessage);

import { POST } from "@/app/api/email/scheduled/[deliveryLogId]/cancel/route";

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

function logRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "dl-1",
    status: "scheduled",
    externalId: null,
    externalIdType: "brevo_message_per_recipient",
    payload: {
      _sentMessageIds: [
        { email: "a@x.com", messageId: "<id-a@smtp>" },
        { email: "b@x.com", messageId: "<id-b@smtp>" },
      ],
    },
    ...overrides,
  };
}

function cancel(id = "dl-1") {
  return POST(
    createRequest("POST", `/api/email/scheduled/${id}/cancel`),
    ctx(id),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  setupActiveUserMock();
  mockSession({ id: "user-1", name: "Owner", role: "owner" });
  mockedCancelCampaign.mockResolvedValue(undefined);
  mockedCancelMessage.mockResolvedValue(undefined);
  prismaMock.deliveryLog.findUnique.mockResolvedValue(logRow());
  prismaMock.deliveryLog.updateMany.mockResolvedValue({ count: 1 });
});

describe("POST /api/email/scheduled/[deliveryLogId]/cancel — auth + guards", () => {
  it("returns 401 when not authenticated", async () => {
    mockNoSession();

    const res = await cancel();
    expect(res.status).toBe(401);
    expect(prismaMock.deliveryLog.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.deliveryLog.updateMany).not.toHaveBeenCalled();
  });

  it("rejects member role with 403 without touching the DB", async () => {
    setupActiveUserMock("member");
    mockSession({ id: "user-1", name: "Member", role: "member" });

    const res = await cancel();
    expect(res.status).toBe(403);
    expect(prismaMock.deliveryLog.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.deliveryLog.updateMany).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown delivery log id", async () => {
    prismaMock.deliveryLog.findUnique.mockResolvedValue(null);

    const res = await cancel("nope");
    expect(res.status).toBe(404);
    expect(prismaMock.deliveryLog.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a legacy null-externalIdType row with 409 and leaves the status UNTOUCHED", async () => {
    prismaMock.deliveryLog.findUnique.mockResolvedValue(
      logRow({ externalIdType: null }),
    );

    const res = await cancel();
    expect(res.status).toBe(409);

    // The refusal happens BEFORE the claim — status stays "scheduled".
    expect(prismaMock.deliveryLog.updateMany).not.toHaveBeenCalled();
    expect(mockedCancelCampaign).not.toHaveBeenCalled();
    expect(mockedCancelMessage).not.toHaveBeenCalled();
  });

  it("returns 409 when the conditional claim matches nothing (already sent/cancelled — race-safe)", async () => {
    prismaMock.deliveryLog.updateMany.mockResolvedValue({ count: 0 });

    const res = await cancel();
    expect(res.status).toBe(409);
    expect(mockedCancelCampaign).not.toHaveBeenCalled();
    expect(mockedCancelMessage).not.toHaveBeenCalled();
  });

  it("claims the row with a status-guarded conditional update", async () => {
    const res = await cancel();
    expect(res.status).toBe(200);

    expect(prismaMock.deliveryLog.updateMany).toHaveBeenCalledWith({
      where: { id: "dl-1", status: "scheduled" },
      data: { status: "cancelled" },
    });
  });
});

describe("POST /api/email/scheduled/[deliveryLogId]/cancel — Brevo per type", () => {
  it("brevo_campaign: suspends the campaign by externalId", async () => {
    prismaMock.deliveryLog.findUnique.mockResolvedValue(
      logRow({ externalIdType: "brevo_campaign", externalId: "456", payload: {} }),
    );

    const res = await cancel();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ cancelled: true, brevoCancelled: true });

    expect(mockedCancelCampaign).toHaveBeenCalledTimes(1);
    expect(mockedCancelCampaign).toHaveBeenCalledWith("456");
    expect(mockedCancelMessage).not.toHaveBeenCalled();
  });

  it("brevo_message: deletes the single scheduled message by externalId", async () => {
    prismaMock.deliveryLog.findUnique.mockResolvedValue(
      logRow({
        externalIdType: "brevo_message",
        externalId: "<msg-1@smtp>",
        payload: {},
      }),
    );

    const res = await cancel();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ cancelled: true, brevoCancelled: true });

    expect(mockedCancelMessage).toHaveBeenCalledTimes(1);
    expect(mockedCancelMessage).toHaveBeenCalledWith("<msg-1@smtp>");
    expect(mockedCancelCampaign).not.toHaveBeenCalled();
  });

  it("brevo_message_per_recipient: deletes EVERY captured messageId", async () => {
    const res = await cancel();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ cancelled: true, brevoCancelled: true });

    expect(mockedCancelMessage).toHaveBeenCalledTimes(2);
    expect(mockedCancelMessage).toHaveBeenCalledWith("<id-a@smtp>");
    expect(mockedCancelMessage).toHaveBeenCalledWith("<id-b@smtp>");
    expect(mockedCancelCampaign).not.toHaveBeenCalled();
  });

  it("per-recipient WITHOUT _sentMessageIds: cancels locally only, brevoCancelled false + detail", async () => {
    // Rows scheduled before the _sentMessageIds capture shipped have no ids
    // to cancel on Brevo's side — local cancel still proceeds.
    prismaMock.deliveryLog.findUnique.mockResolvedValue(
      logRow({ payload: { subject: "old row" } }),
    );

    const res = await cancel();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cancelled).toBe(true);
    expect(body.brevoCancelled).toBe(false);
    expect(body.detail).toMatch(/cancel it in Brevo manually/i);

    expect(mockedCancelMessage).not.toHaveBeenCalled();
    // The local claim still happened.
    expect(prismaMock.deliveryLog.updateMany).toHaveBeenCalledTimes(1);
  });

  it("per-recipient with an EMPTY _sentMessageIds array behaves the same as missing", async () => {
    prismaMock.deliveryLog.findUnique.mockResolvedValue(
      logRow({ payload: { _sentMessageIds: [] } }),
    );

    const res = await cancel();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.brevoCancelled).toBe(false);
    expect(body.detail).toMatch(/cancel it in Brevo manually/i);
    expect(mockedCancelMessage).not.toHaveBeenCalled();
  });

  it("a Brevo error AFTER the claim still returns 200 { cancelled: true, brevoCancelled: false }", async () => {
    prismaMock.deliveryLog.findUnique.mockResolvedValue(
      logRow({ externalIdType: "brevo_campaign", externalId: "456", payload: {} }),
    );
    mockedCancelCampaign.mockRejectedValue(
      new Error("Brevo cancel campaign failed (500): down"),
    );

    const res = await cancel();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cancelled).toBe(true);
    expect(body.brevoCancelled).toBe(false);
    expect(typeof body.detail).toBe("string");

    // The local row was claimed and STAYS cancelled — no rollback.
    expect(prismaMock.deliveryLog.updateMany).toHaveBeenCalledTimes(1);
  });
});
