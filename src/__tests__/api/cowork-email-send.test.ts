import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextResponse } from "next/server";
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

vi.mock("@/app/api/_lib/auth", () => ({
  authenticateCowork: vi.fn(() => null),
}));

vi.mock("@/app/api/cowork/_lib/cowork-activity-log", () => ({
  logCoworkActivity: vi.fn(),
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

import { authenticateCowork } from "@/app/api/_lib/auth";
import {
  isBrevoConfigured,
  sendTransactionalEmail,
  sendCampaignEmail,
} from "@/lib/brevo";
import { getSuppressedEmails } from "@/lib/email-suppression";
import { getFrequencyCapped, recordMarketingSends } from "@/lib/frequency-cap";
import { _clearOrgSettingsCache } from "@/lib/org-settings";
import { POST } from "@/app/api/cowork/email/send/route";

const mockedAuthenticateCowork = vi.mocked(authenticateCowork);
const mockedIsBrevoConfigured = vi.mocked(isBrevoConfigured);
const mockedSendTransactional = vi.mocked(sendTransactionalEmail);
const mockedSendCampaign = vi.mocked(sendCampaignEmail);
const mockedGetSuppressedEmails = vi.mocked(getSuppressedEmails);
const mockedGetFrequencyCapped = vi.mocked(getFrequencyCapped);
const mockedRecordMarketingSends = vi.mocked(recordMarketingSends);

function contact(email: string, firstName = "First", lastName = "Last") {
  return { email, firstName, lastName };
}

function postBody(body: Record<string, unknown>) {
  return createRequest("POST", "/api/cowork/email/send", {
    body: {
      serviceCode: "ALL",
      subject: "Newsletter",
      htmlContent: "<p>hi</p>",
      ...body,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  _clearOrgSettingsCache();
  mockedAuthenticateCowork.mockResolvedValue(null);
  mockedIsBrevoConfigured.mockReturnValue(true);
  mockedGetSuppressedEmails.mockResolvedValue(new Set());
  mockedGetFrequencyCapped.mockResolvedValue(new Set());
  mockedRecordMarketingSends.mockResolvedValue(undefined);
  mockedSendTransactional.mockResolvedValue({ messageId: "msg-1" });
  mockedSendCampaign.mockResolvedValue({ campaignId: 456, listId: 789 });
  prismaMock.deliveryLog.create.mockImplementation(
    async (args: { data: Record<string, unknown> }) =>
      ({ id: "log-1", ...args.data }) as never,
  );
});

describe("POST /api/cowork/email/send", () => {
  it("returns 401 when cowork auth fails, before any DB or Brevo work", async () => {
    mockedAuthenticateCowork.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const res = await POST(postBody({}));
    expect(res.status).toBe(401);
    expect(prismaMock.centreContact.findMany).not.toHaveBeenCalled();
    expect(mockedSendTransactional).not.toHaveBeenCalled();
    expect(mockedSendCampaign).not.toHaveBeenCalled();
  });

  it("happy path (<50): sends one transactional call, logs delivery, keeps the response shape", async () => {
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
      contact("b@example.com"),
    ]);

    const res = await POST(postBody({}));
    expect(res.status).toBe(200);
    const json = await res.json();

    // Cowork's <50 path sends ONE transactional call with all recipients.
    expect(mockedSendTransactional).toHaveBeenCalledTimes(1);
    expect(mockedSendTransactional.mock.calls[0][0].to).toHaveLength(2);

    expect(prismaMock.deliveryLog.create).toHaveBeenCalledTimes(1);

    expect(json).toEqual(
      expect.objectContaining({
        success: true,
        messageId: "msg-1",
        recipientCount: 2,
        serviceCode: "ALL",
        status: "sent",
        suppressedCount: 0,
        cappedCount: 0,
      }),
    );
  });

  it("filters suppressed recipients (closing the historic cowork hole) and reports suppressedCount", async () => {
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
      contact("B@Example.com"),
      contact("c@example.com"),
    ]);
    // Suppression set is lowercased — the filter must compare lowercase.
    mockedGetSuppressedEmails.mockResolvedValue(new Set(["b@example.com"]));

    const res = await POST(postBody({}));
    expect(res.status).toBe(200);
    const json = await res.json();

    const to = mockedSendTransactional.mock.calls[0][0].to as Array<{
      email: string;
    }>;
    expect(to.map((r) => r.email).sort()).toEqual([
      "a@example.com",
      "c@example.com",
    ]);
    expect(json.recipientCount).toBe(2);
    expect(json.suppressedCount).toBe(1);

    const createArgs = prismaMock.deliveryLog.create.mock.calls[0][0];
    expect(createArgs.data.recipientCount).toBe(2);
  });

  it("filters frequency-capped recipients and reports cappedCount", async () => {
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
      contact("b@example.com"),
      contact("c@example.com"),
    ]);
    mockedGetFrequencyCapped.mockResolvedValue(new Set(["c@example.com"]));

    const res = await POST(postBody({}));
    expect(res.status).toBe(200);
    const json = await res.json();

    const to = mockedSendTransactional.mock.calls[0][0].to as Array<{
      email: string;
    }>;
    expect(to.map((r) => r.email).sort()).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
    expect(json.recipientCount).toBe(2);
    expect(json.cappedCount).toBe(1);
  });

  it("cap filter runs on the POST-suppression survivors", async () => {
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
      contact("b@example.com"),
    ]);
    mockedGetSuppressedEmails.mockResolvedValue(new Set(["b@example.com"]));

    await POST(postBody({}));

    expect(mockedGetFrequencyCapped).toHaveBeenCalledTimes(1);
    expect(mockedGetFrequencyCapped.mock.calls[0][1]).toEqual(["a@example.com"]);
  });

  it("returns 400 with no send when everyone is suppressed or capped", async () => {
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
      contact("b@example.com"),
    ]);
    mockedGetSuppressedEmails.mockResolvedValue(new Set(["a@example.com"]));
    mockedGetFrequencyCapped.mockResolvedValue(new Set(["b@example.com"]));

    const res = await POST(postBody({}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(
      /suppressed, unsubscribed or at their weekly email limit/i,
    );

    expect(mockedSendTransactional).not.toHaveBeenCalled();
    expect(mockedSendCampaign).not.toHaveBeenCalled();
    expect(prismaMock.deliveryLog.create).not.toHaveBeenCalled();
    expect(mockedRecordMarketingSends).not.toHaveBeenCalled();
  });

  it("stamps sentAt on immediate sends (dispatch completion)", async () => {
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
    ]);

    const res = await POST(postBody({}));
    expect(res.status).toBe(200);

    const createArgs = prismaMock.deliveryLog.create.mock.calls[0][0];
    expect(createArgs.data.status).toBe("sent");
    expect(createArgs.data.sentAt).toBeInstanceOf(Date);
  });

  it("leaves sentAt unset on scheduled sends (the Brevo webhook flips it on first delivery)", async () => {
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
    ]);

    const res = await POST(
      postBody({ scheduledAt: "2026-08-10T09:00:00.000Z" }),
    );
    expect(res.status).toBe(200);

    const createArgs = prismaMock.deliveryLog.create.mock.calls[0][0];
    expect(createArgs.data.status).toBe("scheduled");
    expect(createArgs.data.sentAt).toBeUndefined();
  });

  it("records every dispatched recipient in the ledger (source cowork, deliveryLogId linked)", async () => {
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
      contact("b@example.com"),
    ]);

    const res = await POST(postBody({}));
    expect(res.status).toBe(200);

    expect(mockedRecordMarketingSends).toHaveBeenCalledTimes(1);
    const [, entries, meta] = mockedRecordMarketingSends.mock.calls[0];
    expect(entries).toEqual([
      { email: "a@example.com" },
      { email: "b@example.com" },
    ]);
    expect(meta).toEqual({ deliveryLogId: "log-1", source: "cowork" });
  });

  it(">=50 campaign path: filters still apply and the full recipient list is recorded", async () => {
    const contacts = Array.from({ length: 60 }, (_, i) =>
      contact(`p${i}@example.com`),
    );
    prismaMock.centreContact.findMany.mockResolvedValue(contacts);
    mockedGetFrequencyCapped.mockResolvedValue(
      new Set(["p0@example.com", "p1@example.com"]),
    );

    const res = await POST(postBody({}));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(mockedSendCampaign).toHaveBeenCalledTimes(1);
    expect(mockedSendCampaign.mock.calls[0][0].recipients).toHaveLength(58);
    expect(json.recipientCount).toBe(58);
    expect(json.cappedCount).toBe(2);

    const [, entries, meta] = mockedRecordMarketingSends.mock.calls[0];
    expect(entries).toHaveLength(58);
    expect(meta).toEqual({ deliveryLogId: "log-1", source: "cowork" });
  });

  it("does not record ledger rows when the Brevo send throws", async () => {
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
    ]);
    mockedSendTransactional.mockRejectedValue(new Error("Brevo down"));

    const res = await POST(postBody({}));
    expect(res.status).toBe(500);
    expect(mockedRecordMarketingSends).not.toHaveBeenCalled();
  });
});

describe("POST /api/cowork/email/send — org-configurable cap resolution", () => {
  it("resolves the cap from org settings and passes it to getFrequencyCapped", async () => {
    prismaMock.orgSettings.findUnique.mockImplementation(
      async (args: { select?: Record<string, unknown> } | undefined) =>
        args?.select?.config
          ? ({ config: { email: { marketingWeeklyCap: 5 } } } as never)
          : null,
    );
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
    ]);

    const res = await POST(postBody({}));
    expect(res.status).toBe(200);

    expect(mockedGetFrequencyCapped).toHaveBeenCalledTimes(1);
    expect(mockedGetFrequencyCapped.mock.calls[0][2]).toEqual({ cap: 5 });
  });

  it("falls back to the default cap (3) when no org settings row exists", async () => {
    prismaMock.orgSettings.findUnique.mockResolvedValue(null);
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
    ]);

    const res = await POST(postBody({}));
    expect(res.status).toBe(200);

    expect(mockedGetFrequencyCapped.mock.calls[0][2]).toEqual({ cap: 3 });
  });
});
