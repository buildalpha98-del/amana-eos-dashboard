import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
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
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })),
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

import {
  isBrevoConfigured,
  sendTransactionalEmail,
  sendCampaignEmail,
} from "@/lib/brevo";
import { getSuppressedEmails } from "@/lib/email-suppression";
import { getFrequencyCapped, recordMarketingSends } from "@/lib/frequency-cap";

const mockedIsBrevoConfigured = vi.mocked(isBrevoConfigured);
const mockedSendTransactional = vi.mocked(sendTransactionalEmail);
const mockedSendCampaign = vi.mocked(sendCampaignEmail);
const mockedGetSuppressedEmails = vi.mocked(getSuppressedEmails);
const mockedGetFrequencyCapped = vi.mocked(getFrequencyCapped);
const mockedRecordMarketingSends = vi.mocked(recordMarketingSends);

import { POST as sendCampaign } from "@/app/api/email/campaign/send/route";
import { GET as recipientCount } from "@/app/api/email/recipient-count/route";

function setupActiveUserMock() {
  prismaMock.user.findUnique.mockReset();
  prismaMock.user.findUnique.mockImplementation(
    async (args: { where?: { id?: string } } | undefined) => {
      if (args?.where?.id === "user-1") {
        return { active: true, id: "user-1", role: "owner" } as never;
      }
      return null;
    },
  );
}

function contact(email: string, firstName = "First", lastName = "Last") {
  return { email, firstName, lastName };
}

describe("POST /api/email/campaign/send — suppression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    setupActiveUserMock();
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    mockedIsBrevoConfigured.mockReturnValue(true);
    mockedGetSuppressedEmails.mockResolvedValue(new Set());
    mockedGetFrequencyCapped.mockResolvedValue(new Set());
    mockedRecordMarketingSends.mockResolvedValue(undefined);
    mockedSendTransactional.mockResolvedValue({ messageId: "msg-123" });
    mockedSendCampaign.mockResolvedValue({ campaignId: 456, listId: 789 });
    prismaMock.orgSettings.findUnique.mockResolvedValue(null);
    prismaMock.deliveryLog.create.mockImplementation(
      async (args: { data: Record<string, unknown> }) =>
        ({
          id: "log-1",
          ...args.data,
        }) as never,
    );
    prismaMock.activityLog.create.mockResolvedValue({});
  });

  function postBody(body: Record<string, unknown>) {
    return createRequest("POST", "/api/email/campaign/send", {
      body: { subject: "Hello", htmlContent: "<p>hi</p>", ...body },
    });
  }

  it("excludes suppressed recipients from the send and reports suppressedCount", async () => {
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
      contact("b@example.com"),
      contact("c@example.com"),
    ]);
    mockedGetSuppressedEmails.mockResolvedValue(new Set(["c@example.com"]));

    const res = await sendCampaign(postBody({}));
    expect(res.status).toBe(200);
    const json = await res.json();

    // Per-recipient dispatch: one call per (non-suppressed) recipient.
    expect(mockedSendTransactional).toHaveBeenCalledTimes(2);
    const sentEmails = mockedSendTransactional.mock.calls.map((c) => {
      expect(c[0].to).toHaveLength(1);
      return c[0].to[0].email;
    });
    expect(sentEmails.sort()).toEqual(["a@example.com", "b@example.com"]);

    expect(json.recipientCount).toBe(2);
    expect(json.suppressedCount).toBe(1);

    expect(prismaMock.deliveryLog.create).toHaveBeenCalledTimes(1);
    const createArgs = prismaMock.deliveryLog.create.mock.calls[0][0];
    expect(createArgs.data.recipientCount).toBe(2);
  });

  it("excludes a suppressed recipient regardless of email casing (lowercase compare regression pin)", async () => {
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
      contact("C@Example.com"),
    ]);
    // getSuppressedEmails always returns lowercased entries — a case-sensitive
    // `.has()` in the route would silently fail to match "C@Example.com".
    mockedGetSuppressedEmails.mockResolvedValue(new Set(["c@example.com"]));

    const res = await sendCampaign(postBody({}));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(mockedSendTransactional).toHaveBeenCalledTimes(1);
    const sentTo = mockedSendTransactional.mock.calls[0][0].to;
    expect(sentTo).toHaveLength(1);
    expect(sentTo[0].email).toBe("a@example.com");

    expect(json.recipientCount).toBe(1);
    expect(json.suppressedCount).toBe(1);

    const createArgs = prismaMock.deliveryLog.create.mock.calls[0][0];
    expect(
      (createArgs.data.payload as { _suppressedCount: number })._suppressedCount,
    ).toBe(1);
  });

  it("returns 400 with no send when all recipients are suppressed", async () => {
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
      contact("b@example.com"),
    ]);
    mockedGetSuppressedEmails.mockResolvedValue(
      new Set(["a@example.com", "b@example.com"]),
    );

    const res = await sendCampaign(postBody({}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/All recipients are suppressed or unsubscribed/i);

    expect(mockedSendTransactional).not.toHaveBeenCalled();
    expect(mockedSendCampaign).not.toHaveBeenCalled();
    expect(prismaMock.deliveryLog.create).not.toHaveBeenCalled();
  });

  it("returns 409 for the enquiry branch when the recipient is suppressed", async () => {
    prismaMock.parentEnquiry.findUnique.mockResolvedValue({
      id: "enq-1",
      parentEmail: "suppressed@example.com",
      parentName: "Parent",
      service: { name: "Test Service" },
    });
    mockedGetSuppressedEmails.mockResolvedValue(new Set(["suppressed@example.com"]));

    const res = await sendCampaign(postBody({ enquiryId: "enq-1" }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBeTruthy();
    expect(typeof json.error).toBe("string");

    expect(mockedSendTransactional).not.toHaveBeenCalled();
    expect(mockedSendCampaign).not.toHaveBeenCalled();
    expect(prismaMock.deliveryLog.create).not.toHaveBeenCalled();
  });

  it("stores externalIdType 'brevo_message_per_recipient' on the transactional (<50 recipient) path", async () => {
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
      contact("b@example.com"),
      contact("c@example.com"),
    ]);
    mockedGetSuppressedEmails.mockResolvedValue(new Set());

    const res = await sendCampaign(postBody({}));
    expect(res.status).toBe(200);

    expect(mockedSendTransactional).toHaveBeenCalledTimes(3);
    expect(mockedSendCampaign).not.toHaveBeenCalled();

    const createArgs = prismaMock.deliveryLog.create.mock.calls[0][0];
    expect(createArgs.data.externalIdType).toBe("brevo_message_per_recipient");
    expect(createArgs.data.externalId).toBeNull();
  });

  it("stores externalIdType 'brevo_campaign' on the campaign (>=50 recipient) path", async () => {
    const contacts = Array.from({ length: 60 }, (_, i) => contact(`p${i}@example.com`));
    prismaMock.centreContact.findMany.mockResolvedValue(contacts);
    mockedGetSuppressedEmails.mockResolvedValue(new Set());

    const res = await sendCampaign(postBody({}));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.recipientCount).toBe(60);

    expect(mockedSendCampaign).toHaveBeenCalledTimes(1);
    expect(mockedSendTransactional).not.toHaveBeenCalled();

    const createArgs = prismaMock.deliveryLog.create.mock.calls[0][0];
    expect(createArgs.data.externalIdType).toBe("brevo_campaign");
  });

  it("persists the Brevo temp list id as payload._brevoListId on the >=50 path (janitor cleanup input)", async () => {
    const contacts = Array.from({ length: 60 }, (_, i) => contact(`p${i}@example.com`));
    prismaMock.centreContact.findMany.mockResolvedValue(contacts);
    mockedGetSuppressedEmails.mockResolvedValue(new Set());

    const res = await sendCampaign(postBody({}));
    expect(res.status).toBe(200);

    const createArgs = prismaMock.deliveryLog.create.mock.calls[0][0];
    const payload = createArgs.data.payload as {
      _brevoListId: number;
      _suppressedCount: number;
    };
    expect(payload._brevoListId).toBe(789);
    expect(payload._suppressedCount).toBe(0);
  });
});

describe("POST /api/email/campaign/send — audienceId resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    setupActiveUserMock();
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    mockedIsBrevoConfigured.mockReturnValue(true);
    mockedGetSuppressedEmails.mockResolvedValue(new Set());
    mockedGetFrequencyCapped.mockResolvedValue(new Set());
    mockedRecordMarketingSends.mockResolvedValue(undefined);
    mockedSendTransactional.mockResolvedValue({ messageId: "msg-123" });
    mockedSendCampaign.mockResolvedValue({ campaignId: 456, listId: 789 });
    prismaMock.orgSettings.findUnique.mockResolvedValue(null);
    prismaMock.deliveryLog.create.mockImplementation(
      async (args: { data: Record<string, unknown> }) =>
        ({ id: "log-1", ...args.data }) as never,
    );
    prismaMock.activityLog.create.mockResolvedValue({});
  });

  function postBody(body: Record<string, unknown>) {
    return createRequest("POST", "/api/email/campaign/send", {
      body: { subject: "Hello", htmlContent: "<p>hi</p>", ...body },
    });
  }

  function mockAudience(overrides: Record<string, unknown> = {}) {
    prismaMock.emailAudience.findUnique.mockResolvedValue({
      id: "aud-1",
      name: "Active families",
      rules: { serviceIds: ["svc-1"], statuses: ["active"] },
      archived: false,
      ...overrides,
    });
  }

  it("resolves recipients from the audience rules via the shared compiler", async () => {
    mockAudience();
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
      contact("b@example.com"),
    ]);

    const res = await sendCampaign(postBody({ audienceId: "aud-1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.recipientCount).toBe(2);

    // The where clause must be the compiled rules — subscribed base + ANDed conditions
    const where = prismaMock.centreContact.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      subscribed: true,
      serviceId: { in: ["svc-1"] },
      status: { in: ["active"] },
    });
    // Per-recipient dispatch: one call per recipient.
    expect(mockedSendTransactional).toHaveBeenCalledTimes(2);
  });

  it("returns 404 for an unknown audienceId without sending", async () => {
    prismaMock.emailAudience.findUnique.mockResolvedValue(null);

    const res = await sendCampaign(postBody({ audienceId: "nope" }));
    expect(res.status).toBe(404);
    expect(mockedSendTransactional).not.toHaveBeenCalled();
    expect(mockedSendCampaign).not.toHaveBeenCalled();
    expect(prismaMock.deliveryLog.create).not.toHaveBeenCalled();
  });

  it("returns 409 for an archived audience without sending", async () => {
    mockAudience({ archived: true });

    const res = await sendCampaign(postBody({ audienceId: "aud-1" }));
    expect(res.status).toBe(409);
    expect(mockedSendTransactional).not.toHaveBeenCalled();
    expect(mockedSendCampaign).not.toHaveBeenCalled();
    expect(prismaMock.deliveryLog.create).not.toHaveBeenCalled();
  });

  it("rejects audienceId combined with a non-empty serviceIds with 400", async () => {
    const res = await sendCampaign(
      postBody({ audienceId: "aud-1", serviceIds: ["svc-2"] }),
    );
    expect(res.status).toBe(400);
    expect(mockedSendTransactional).not.toHaveBeenCalled();
  });

  it("rejects audienceId combined with allCentres: true with 400", async () => {
    const res = await sendCampaign(
      postBody({ audienceId: "aud-1", allCentres: true }),
    );
    expect(res.status).toBe(400);
    expect(mockedSendTransactional).not.toHaveBeenCalled();
  });

  it("tolerates the composer's legacy allCentres:false + serviceIds:[] alongside audienceId", async () => {
    // The composer always sends these two fields — falsy/empty values must
    // count as ABSENT for the mutual-exclusion refine.
    mockAudience();
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
    ]);

    const res = await sendCampaign(
      postBody({ audienceId: "aud-1", allCentres: false, serviceIds: [] }),
    );
    expect(res.status).toBe(200);
    expect(mockedSendTransactional).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/email/campaign/send — marketingCampaignId attribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    setupActiveUserMock();
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    mockedIsBrevoConfigured.mockReturnValue(true);
    mockedGetSuppressedEmails.mockResolvedValue(new Set());
    mockedGetFrequencyCapped.mockResolvedValue(new Set());
    mockedRecordMarketingSends.mockResolvedValue(undefined);
    mockedSendTransactional.mockResolvedValue({ messageId: "msg-123" });
    mockedSendCampaign.mockResolvedValue({ campaignId: 456, listId: 789 });
    prismaMock.orgSettings.findUnique.mockResolvedValue(null);
    prismaMock.deliveryLog.create.mockImplementation(
      async (args: { data: Record<string, unknown> }) =>
        ({ id: "log-1", ...args.data }) as never,
    );
    prismaMock.activityLog.create.mockResolvedValue({});
  });

  function postBody(body: Record<string, unknown>) {
    return createRequest("POST", "/api/email/campaign/send", {
      body: { subject: "Hello", htmlContent: "<p>hi</p>", ...body },
    });
  }

  it("stamps entityType MarketingCampaign + entityId when the campaign exists", async () => {
    prismaMock.marketingCampaign.findUnique.mockResolvedValue({ id: "camp-1" });
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
    ]);

    const res = await sendCampaign(postBody({ marketingCampaignId: "camp-1" }));
    expect(res.status).toBe(200);

    const createArgs = prismaMock.deliveryLog.create.mock.calls[0][0];
    expect(createArgs.data.entityType).toBe("MarketingCampaign");
    expect(createArgs.data.entityId).toBe("camp-1");
  });

  it("returns 404 for an unknown marketingCampaignId without sending", async () => {
    prismaMock.marketingCampaign.findUnique.mockResolvedValue(null);
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
    ]);

    const res = await sendCampaign(postBody({ marketingCampaignId: "nope" }));
    expect(res.status).toBe(404);
    expect(mockedSendTransactional).not.toHaveBeenCalled();
    expect(prismaMock.deliveryLog.create).not.toHaveBeenCalled();
  });

  it("rejects marketingCampaignId combined with enquiryId with 400", async () => {
    const res = await sendCampaign(
      postBody({ marketingCampaignId: "camp-1", enquiryId: "enq-1" }),
    );
    expect(res.status).toBe(400);
    expect(mockedSendTransactional).not.toHaveBeenCalled();
  });

  it("rejects marketingCampaignId combined with postId with 400", async () => {
    const res = await sendCampaign(
      postBody({ marketingCampaignId: "camp-1", postId: "post-1" }),
    );
    expect(res.status).toBe(400);
    expect(mockedSendTransactional).not.toHaveBeenCalled();
  });
});

describe("POST /api/email/campaign/send — per-recipient dispatch (<50)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    setupActiveUserMock();
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    mockedIsBrevoConfigured.mockReturnValue(true);
    mockedGetSuppressedEmails.mockResolvedValue(new Set());
    mockedGetFrequencyCapped.mockResolvedValue(new Set());
    mockedRecordMarketingSends.mockResolvedValue(undefined);
    mockedSendTransactional.mockResolvedValue({ messageId: "msg-123" });
    mockedSendCampaign.mockResolvedValue({ campaignId: 456, listId: 789 });
    prismaMock.orgSettings.findUnique.mockResolvedValue(null);
    prismaMock.deliveryLog.create.mockImplementation(
      async (args: { data: Record<string, unknown> }) =>
        ({ id: "log-1", ...args.data }) as never,
    );
    prismaMock.deliveryLog.update.mockResolvedValue({} as never);
    prismaMock.activityLog.create.mockResolvedValue({});
  });

  function postBody(body: Record<string, unknown>) {
    return createRequest("POST", "/api/email/campaign/send", {
      body: { subject: "Hello", htmlContent: "<p>hi</p>", ...body },
    });
  }

  it("pre-creates the DeliveryLog as 'sending' and tags every per-recipient call with dl:<logId>", async () => {
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
      contact("b@example.com"),
      contact("c@example.com"),
    ]);

    const res = await sendCampaign(postBody({}));
    expect(res.status).toBe(200);
    const json = await res.json();

    // Pre-create: sending, per-recipient marker, no externalId (correlation is via tag).
    expect(prismaMock.deliveryLog.create).toHaveBeenCalledTimes(1);
    const createArgs = prismaMock.deliveryLog.create.mock.calls[0][0];
    expect(createArgs.data).toEqual(
      expect.objectContaining({
        status: "sending",
        externalIdType: "brevo_message_per_recipient",
        externalId: null,
        recipientCount: 3,
      }),
    );

    // One send per recipient, each single-to, each tagged with the pre-created row's id.
    expect(mockedSendTransactional).toHaveBeenCalledTimes(3);
    for (const call of mockedSendTransactional.mock.calls) {
      expect(call[0].to).toHaveLength(1);
      expect(call[0].tags).toEqual(["dl:log-1"]);
    }
    const sentEmails = mockedSendTransactional.mock.calls
      .map((c) => c[0].to[0].email)
      .sort();
    expect(sentEmails).toEqual(["a@example.com", "b@example.com", "c@example.com"]);

    // Same row updated to the terminal status — no second create.
    expect(prismaMock.deliveryLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "log-1" },
        data: expect.objectContaining({ status: "sent" }),
      }),
    );

    expect(json).toEqual(
      expect.objectContaining({
        success: true,
        deliveryLogId: "log-1",
        recipientCount: 3,
        suppressedCount: 0,
        status: "sent",
        failedCount: 0,
      }),
    );
  });

  it("stamps sentAt on the terminal update when the row lands 'sent'", async () => {
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
    ]);

    const res = await sendCampaign(postBody({}));
    expect(res.status).toBe(200);

    const updateArgs = prismaMock.deliveryLog.update.mock.calls[0][0];
    expect(updateArgs.data.status).toBe("sent");
    expect(updateArgs.data.sentAt).toBeInstanceOf(Date);
  });

  it("marks the row 'scheduled' when scheduledAt is set and forwards it per call", async () => {
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
      contact("b@example.com"),
    ]);
    const scheduledAt = "2026-08-10T09:00:00.000Z";

    const res = await sendCampaign(postBody({ scheduledAt }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("scheduled");

    expect(mockedSendTransactional).toHaveBeenCalledTimes(2);
    for (const call of mockedSendTransactional.mock.calls) {
      expect(call[0].scheduledAt).toBe(scheduledAt);
    }
    expect(prismaMock.deliveryLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "log-1" },
        data: expect.objectContaining({ status: "scheduled" }),
      }),
    );
  });

  it("does NOT stamp sentAt when scheduledAt is set — dispatch hasn't happened yet", async () => {
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
    ]);

    const res = await sendCampaign(
      postBody({ scheduledAt: "2026-08-10T09:00:00.000Z" }),
    );
    expect(res.status).toBe(200);

    const updateArgs = prismaMock.deliveryLog.update.mock.calls[0][0];
    expect(updateArgs.data.status).toBe("scheduled");
    expect(updateArgs.data.sentAt).toBeFalsy();
  });

  it("partial failure → status 'partial', _failedRecipients recorded, 200 with failedCount", async () => {
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
      contact("b@example.com"),
      contact("c@example.com"),
    ]);
    mockedSendTransactional.mockImplementation(
      async (params: { to: Array<{ email: string }> }) => {
        if (params.to[0].email === "b@example.com") {
          throw new Error("Brevo transactional send failed (500): boom");
        }
        return { messageId: "msg-ok" };
      },
    );

    const res = await sendCampaign(postBody({}));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json).toEqual(
      expect.objectContaining({
        success: true,
        status: "partial",
        failedCount: 1,
        recipientCount: 3,
      }),
    );

    expect(prismaMock.deliveryLog.create).toHaveBeenCalledTimes(1);
    const updateArgs = prismaMock.deliveryLog.update.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: "log-1" });
    expect(updateArgs.data.status).toBe("partial");
    expect(
      (updateArgs.data.payload as { _failedRecipients: string[] })._failedRecipients,
    ).toEqual(["b@example.com"]);
    // Dispatch completed (some recipients were reached) — stamp sentAt.
    expect(updateArgs.data.sentAt).toBeInstanceOf(Date);

    // Activity log still records the (partial) send.
    expect(prismaMock.activityLog.create).toHaveBeenCalledTimes(1);
  });

  it("total failure → same row updated to 'failed', 502, create called exactly ONCE (no second row)", async () => {
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
      contact("b@example.com"),
    ]);
    mockedSendTransactional.mockRejectedValue(
      new Error("Brevo transactional send failed (500): down"),
    );

    const res = await sendCampaign(postBody({}));
    expect(res.status).toBe(502);
    const json = await res.json();

    expect(json).toEqual(
      expect.objectContaining({
        success: false,
        deliveryLogId: "log-1",
        status: "failed",
        failedCount: 2,
      }),
    );

    // Row-lifecycle ownership: the pre-create is the ONLY create.
    expect(prismaMock.deliveryLog.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.deliveryLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "log-1" },
        data: expect.objectContaining({ status: "failed" }),
      }),
    );
    // Nothing was actually delivered — sentAt stays unset.
    const failedUpdateArgs = prismaMock.deliveryLog.update.mock.calls[0][0];
    expect(failedUpdateArgs.data.sentAt).toBeFalsy();
    // A failed send is not an activity-worthy send.
    expect(prismaMock.activityLog.create).not.toHaveBeenCalled();
  });

  it("folds the enquiry single-recipient branch onto the same machinery", async () => {
    prismaMock.parentEnquiry.findUnique.mockResolvedValue({
      id: "enq-1",
      parentEmail: "parent@example.com",
      parentName: "Parent Name",
      service: { name: "Test Service" },
    });
    prismaMock.parentEnquiry.update.mockResolvedValue({});

    const res = await sendCampaign(postBody({ enquiryId: "enq-1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("sent");

    const createArgs = prismaMock.deliveryLog.create.mock.calls[0][0];
    expect(createArgs.data).toEqual(
      expect.objectContaining({
        messageType: "enquiry",
        status: "sending",
        externalIdType: "brevo_message_per_recipient",
        externalId: null,
        recipientCount: 1,
      }),
    );

    expect(mockedSendTransactional).toHaveBeenCalledTimes(1);
    const call = mockedSendTransactional.mock.calls[0][0];
    expect(call.to).toEqual([{ email: "parent@example.com", name: "Parent Name" }]);
    expect(call.tags).toEqual(["dl:log-1"]);

    expect(prismaMock.parentEnquiry.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "enq-1" } }),
    );
  });

  it("links MarketingPost.deliveryLogId from the pre-created row's id", async () => {
    prismaMock.marketingPost.findUnique.mockResolvedValue({ deliveryLogId: null });
    prismaMock.marketingPost.update.mockResolvedValue({});
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
    ]);

    const res = await sendCampaign(postBody({ postId: "post-1" }));
    expect(res.status).toBe(200);

    expect(prismaMock.marketingPost.update).toHaveBeenCalledWith({
      where: { id: "post-1" },
      data: { deliveryLogId: "log-1" },
    });
  });

  it("keeps suppressedCount in the pre-created payload", async () => {
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
      contact("b@example.com"),
    ]);
    mockedGetSuppressedEmails.mockResolvedValue(new Set(["b@example.com"]));

    const res = await sendCampaign(postBody({}));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.suppressedCount).toBe(1);

    const createArgs = prismaMock.deliveryLog.create.mock.calls[0][0];
    expect(
      (createArgs.data.payload as { _suppressedCount: number })._suppressedCount,
    ).toBe(1);
  });

  it("leaves the >=50 campaign path untouched — single create, no update, no per-recipient calls", async () => {
    const contacts = Array.from({ length: 55 }, (_, i) => contact(`p${i}@example.com`));
    prismaMock.centreContact.findMany.mockResolvedValue(contacts);

    const res = await sendCampaign(postBody({}));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.recipientCount).toBe(55);
    expect(json.status).toBe("sent");

    expect(mockedSendCampaign).toHaveBeenCalledTimes(1);
    expect(mockedSendTransactional).not.toHaveBeenCalled();

    expect(prismaMock.deliveryLog.create).toHaveBeenCalledTimes(1);
    const createArgs = prismaMock.deliveryLog.create.mock.calls[0][0];
    expect(createArgs.data.externalIdType).toBe("brevo_campaign");
    expect(createArgs.data.status).toBe("sent");
    expect(createArgs.data.sentAt).toBeInstanceOf(Date);
    expect(prismaMock.deliveryLog.update).not.toHaveBeenCalled();
  });

  it("does NOT stamp sentAt on the >=50 create when scheduledAt is set", async () => {
    const contacts = Array.from({ length: 55 }, (_, i) => contact(`p${i}@example.com`));
    prismaMock.centreContact.findMany.mockResolvedValue(contacts);

    const res = await sendCampaign(
      postBody({ scheduledAt: "2026-08-10T09:00:00.000Z" }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("scheduled");

    const createArgs = prismaMock.deliveryLog.create.mock.calls[0][0];
    expect(createArgs.data.status).toBe("scheduled");
    expect(createArgs.data.sentAt).toBeFalsy();
  });
});

describe("POST /api/email/campaign/send — frequency cap + send ledger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    setupActiveUserMock();
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    mockedIsBrevoConfigured.mockReturnValue(true);
    mockedGetSuppressedEmails.mockResolvedValue(new Set());
    mockedGetFrequencyCapped.mockResolvedValue(new Set());
    mockedRecordMarketingSends.mockResolvedValue(undefined);
    mockedSendTransactional.mockResolvedValue({ messageId: "msg-123" });
    mockedSendCampaign.mockResolvedValue({ campaignId: 456, listId: 789 });
    prismaMock.orgSettings.findUnique.mockResolvedValue(null);
    prismaMock.deliveryLog.create.mockImplementation(
      async (args: { data: Record<string, unknown> }) =>
        ({ id: "log-1", ...args.data }) as never,
    );
    prismaMock.deliveryLog.update.mockResolvedValue({} as never);
    prismaMock.activityLog.create.mockResolvedValue({});
  });

  function postBody(body: Record<string, unknown>) {
    return createRequest("POST", "/api/email/campaign/send", {
      body: { subject: "Hello", htmlContent: "<p>hi</p>", ...body },
    });
  }

  it("<50: filters capped recipients AFTER suppression, reports cappedCount + payload._cappedCount", async () => {
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
      contact("b@example.com"),
      contact("c@example.com"),
    ]);
    mockedGetFrequencyCapped.mockResolvedValue(new Set(["c@example.com"]));

    const res = await sendCampaign(postBody({}));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(mockedSendTransactional).toHaveBeenCalledTimes(2);
    const sentEmails = mockedSendTransactional.mock.calls
      .map((c) => c[0].to[0].email)
      .sort();
    expect(sentEmails).toEqual(["a@example.com", "b@example.com"]);

    expect(json.recipientCount).toBe(2);
    expect(json.cappedCount).toBe(1);

    const createArgs = prismaMock.deliveryLog.create.mock.calls[0][0];
    expect(createArgs.data.recipientCount).toBe(2);
    expect(
      (createArgs.data.payload as { _cappedCount: number })._cappedCount,
    ).toBe(1);
  });

  it("<50: cap filter runs on the POST-suppression list, not the raw one", async () => {
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
      contact("b@example.com"),
    ]);
    mockedGetSuppressedEmails.mockResolvedValue(new Set(["b@example.com"]));

    const res = await sendCampaign(postBody({}));
    expect(res.status).toBe(200);

    expect(mockedGetFrequencyCapped).toHaveBeenCalledTimes(1);
    // Second arg is prisma; the email list is the post-suppression survivors.
    expect(mockedGetFrequencyCapped.mock.calls[0][1]).toEqual(["a@example.com"]);
  });

  it("filters a capped recipient regardless of email casing (lowercase compare pin)", async () => {
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
      contact("C@Example.com"),
    ]);
    // getFrequencyCapped always returns lowercased entries — a case-sensitive
    // `.has()` in the route would silently fail to match "C@Example.com".
    mockedGetFrequencyCapped.mockResolvedValue(new Set(["c@example.com"]));

    const res = await sendCampaign(postBody({}));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(mockedSendTransactional).toHaveBeenCalledTimes(1);
    expect(mockedSendTransactional.mock.calls[0][0].to[0].email).toBe(
      "a@example.com",
    );
    expect(json.cappedCount).toBe(1);
  });

  it("returns 400 with no send when ALL recipients are at their weekly limit", async () => {
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
      contact("b@example.com"),
    ]);
    mockedGetFrequencyCapped.mockResolvedValue(
      new Set(["a@example.com", "b@example.com"]),
    );

    const res = await sendCampaign(postBody({}));
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

  it("ENQUIRY branch: never cap-filtered (1:1 human send) but the recipient IS recorded", async () => {
    prismaMock.parentEnquiry.findUnique.mockResolvedValue({
      id: "enq-1",
      parentEmail: "parent@example.com",
      parentName: "Parent",
      service: { name: "Test Service" },
    });
    prismaMock.parentEnquiry.update.mockResolvedValue({});
    // Even a capped parent must still receive the direct enquiry reply.
    mockedGetFrequencyCapped.mockResolvedValue(new Set(["parent@example.com"]));

    const res = await sendCampaign(postBody({ enquiryId: "enq-1" }));
    expect(res.status).toBe(200);

    expect(mockedGetFrequencyCapped).not.toHaveBeenCalled();
    expect(mockedSendTransactional).toHaveBeenCalledTimes(1);

    // …but the send still counts toward the parent's weekly volume.
    expect(mockedRecordMarketingSends).toHaveBeenCalledTimes(1);
    expect(mockedRecordMarketingSends).toHaveBeenCalledWith(
      expect.anything(),
      [{ email: "parent@example.com" }],
      { deliveryLogId: "log-1", source: "campaign" },
    );
  });

  it("<50: records the NON-FAILED subset in the ledger after dispatch (partial failure)", async () => {
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
      contact("b@example.com"),
      contact("c@example.com"),
    ]);
    mockedSendTransactional.mockImplementation(
      async (params: { to: Array<{ email: string }> }) => {
        if (params.to[0].email === "b@example.com") {
          throw new Error("Brevo transactional send failed (500): boom");
        }
        return { messageId: "msg-ok" };
      },
    );

    const res = await sendCampaign(postBody({}));
    expect(res.status).toBe(200);

    expect(mockedRecordMarketingSends).toHaveBeenCalledTimes(1);
    const [, entries, meta] = mockedRecordMarketingSends.mock.calls[0];
    expect(entries).toEqual([
      { email: "a@example.com" },
      { email: "c@example.com" },
    ]);
    expect(meta).toEqual({ deliveryLogId: "log-1", source: "campaign" });
  });

  it("<50: total failure records NO ledger rows (empty non-failed subset)", async () => {
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
      contact("b@example.com"),
    ]);
    mockedSendTransactional.mockRejectedValue(new Error("down"));

    const res = await sendCampaign(postBody({}));
    expect(res.status).toBe(502);

    // The route hands an EMPTY entries list to the lib (which no-ops).
    expect(mockedRecordMarketingSends).toHaveBeenCalledWith(
      expect.anything(),
      [],
      { deliveryLogId: "log-1", source: "campaign" },
    );
  });

  it("<50: a SCHEDULED send is recorded immediately (conservative — counts even if later cancelled)", async () => {
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
    ]);

    const res = await sendCampaign(
      postBody({ scheduledAt: "2026-08-10T09:00:00.000Z" }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("scheduled");

    expect(mockedRecordMarketingSends).toHaveBeenCalledWith(
      expect.anything(),
      [{ email: "a@example.com" }],
      { deliveryLogId: "log-1", source: "campaign" },
    );
  });

  it(">=50: cap filter applies before list creation and cappedCount is reported", async () => {
    const contacts = Array.from({ length: 60 }, (_, i) =>
      contact(`p${i}@example.com`),
    );
    prismaMock.centreContact.findMany.mockResolvedValue(contacts);
    mockedGetFrequencyCapped.mockResolvedValue(
      new Set(["p0@example.com", "p1@example.com", "p2@example.com"]),
    );

    const res = await sendCampaign(postBody({}));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(mockedSendCampaign).toHaveBeenCalledTimes(1);
    expect(mockedSendCampaign.mock.calls[0][0].recipients).toHaveLength(57);
    expect(json.recipientCount).toBe(57);
    expect(json.cappedCount).toBe(3);

    const createArgs = prismaMock.deliveryLog.create.mock.calls[0][0];
    expect(
      (createArgs.data.payload as { _cappedCount: number })._cappedCount,
    ).toBe(3);
  });

  it(">=50: records ALL recipients post-send — only place those emails are known locally", async () => {
    const contacts = Array.from({ length: 55 }, (_, i) =>
      contact(`p${i}@example.com`),
    );
    prismaMock.centreContact.findMany.mockResolvedValue(contacts);

    const res = await sendCampaign(postBody({}));
    expect(res.status).toBe(200);

    expect(mockedRecordMarketingSends).toHaveBeenCalledTimes(1);
    const [, entries, meta] = mockedRecordMarketingSends.mock.calls[0];
    expect(entries).toHaveLength(55);
    expect(entries[0]).toEqual({ email: "p0@example.com" });
    expect(meta).toEqual({ deliveryLogId: "log-1", source: "campaign" });
  });

  it(">=50: a failed Brevo campaign send records NOTHING in the ledger", async () => {
    const contacts = Array.from({ length: 55 }, (_, i) =>
      contact(`p${i}@example.com`),
    );
    prismaMock.centreContact.findMany.mockResolvedValue(contacts);
    mockedSendCampaign.mockRejectedValue(new Error("Brevo down"));

    const res = await sendCampaign(postBody({}));
    expect(res.status).toBe(502);
    expect(mockedRecordMarketingSends).not.toHaveBeenCalled();
  });
});

describe("POST /api/email/campaign/send — _sentMessageIds capture (<50)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    setupActiveUserMock();
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    mockedIsBrevoConfigured.mockReturnValue(true);
    mockedGetSuppressedEmails.mockResolvedValue(new Set());
    mockedGetFrequencyCapped.mockResolvedValue(new Set());
    mockedRecordMarketingSends.mockResolvedValue(undefined);
    mockedSendTransactional.mockResolvedValue({ messageId: "msg-123" });
    mockedSendCampaign.mockResolvedValue({ campaignId: 456, listId: 789 });
    prismaMock.orgSettings.findUnique.mockResolvedValue(null);
    prismaMock.deliveryLog.create.mockImplementation(
      async (args: { data: Record<string, unknown> }) =>
        ({ id: "log-1", ...args.data }) as never,
    );
    prismaMock.deliveryLog.update.mockResolvedValue({} as never);
    prismaMock.activityLog.create.mockResolvedValue({});
  });

  function postBody(body: Record<string, unknown>) {
    return createRequest("POST", "/api/email/campaign/send", {
      body: { subject: "Hello", htmlContent: "<p>hi</p>", ...body },
    });
  }

  it("captures per-recipient messageIds into payload._sentMessageIds on a fully-successful send (always-write, not failure-only)", async () => {
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
      contact("b@example.com"),
    ]);
    mockedSendTransactional.mockImplementation(
      async (params: { to: Array<{ email: string }> }) => ({
        messageId: `<id-${params.to[0].email}>`,
      }),
    );

    const res = await sendCampaign(postBody({}));
    expect(res.status).toBe(200);

    const updateArgs = prismaMock.deliveryLog.update.mock.calls[0][0];
    const payload = updateArgs.data.payload as {
      _sentMessageIds: Array<{ email: string; messageId: string }>;
      _suppressedCount: number;
      _cappedCount: number;
    };
    // The payload rewrite now ALWAYS happens (it used to be failure-only) so
    // the cancel route can find messageIds for scheduled sends.
    expect(payload).toBeDefined();
    expect(payload._suppressedCount).toBe(0);
    expect(payload._cappedCount).toBe(0);
    expect(
      [...payload._sentMessageIds].sort((x, y) => x.email.localeCompare(y.email)),
    ).toEqual([
      { email: "a@example.com", messageId: "<id-a@example.com>" },
      { email: "b@example.com", messageId: "<id-b@example.com>" },
    ]);
  });

  it("filters the 'unknown' messageId fallback out of _sentMessageIds", async () => {
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
      contact("b@example.com"),
      contact("c@example.com"),
    ]);
    mockedSendTransactional.mockImplementation(
      async (params: { to: Array<{ email: string }> }) => {
        // Brevo occasionally omits messageId — the wrapper falls back to
        // "unknown", which is useless for cancellation and must be dropped.
        if (params.to[0].email === "b@example.com") {
          return { messageId: "unknown" };
        }
        return { messageId: `<id-${params.to[0].email}>` };
      },
    );

    const res = await sendCampaign(postBody({}));
    expect(res.status).toBe(200);

    const updateArgs = prismaMock.deliveryLog.update.mock.calls[0][0];
    const payload = updateArgs.data.payload as {
      _sentMessageIds: Array<{ email: string; messageId: string }>;
    };
    expect(
      [...payload._sentMessageIds].sort((x, y) => x.email.localeCompare(y.email)),
    ).toEqual([
      { email: "a@example.com", messageId: "<id-a@example.com>" },
      { email: "c@example.com", messageId: "<id-c@example.com>" },
    ]);
  });

  it("records only the FULFILLED sends' ids alongside _failedRecipients on a partial failure", async () => {
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
      contact("b@example.com"),
    ]);
    mockedSendTransactional.mockImplementation(
      async (params: { to: Array<{ email: string }> }) => {
        if (params.to[0].email === "b@example.com") {
          throw new Error("Brevo transactional send failed (500): boom");
        }
        return { messageId: "<id-a>" };
      },
    );

    const res = await sendCampaign(postBody({}));
    expect(res.status).toBe(200);

    const updateArgs = prismaMock.deliveryLog.update.mock.calls[0][0];
    const payload = updateArgs.data.payload as {
      _sentMessageIds: Array<{ email: string; messageId: string }>;
      _failedRecipients: string[];
    };
    expect(payload._sentMessageIds).toEqual([
      { email: "a@example.com", messageId: "<id-a>" },
    ]);
    expect(payload._failedRecipients).toEqual(["b@example.com"]);
  });

  it("captures _sentMessageIds for a SCHEDULED send — the input to a later Brevo-side cancel", async () => {
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
    ]);
    mockedSendTransactional.mockResolvedValue({ messageId: "<id-sched>" });

    const res = await sendCampaign(
      postBody({ scheduledAt: "2026-08-10T09:00:00.000Z" }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("scheduled");

    const updateArgs = prismaMock.deliveryLog.update.mock.calls[0][0];
    const payload = updateArgs.data.payload as {
      _sentMessageIds: Array<{ email: string; messageId: string }>;
    };
    expect(payload._sentMessageIds).toEqual([
      { email: "a@example.com", messageId: "<id-sched>" },
    ]);
  });
});

describe("GET /api/email/recipient-count — post-suppression count", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    setupActiveUserMock();
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    mockedGetSuppressedEmails.mockResolvedValue(new Set());
  });

  it("returns the count minus suppressed recipients", async () => {
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
      contact("b@example.com"),
      contact("c@example.com"),
      contact("d@example.com"),
      contact("e@example.com"),
    ]);
    mockedGetSuppressedEmails.mockResolvedValue(
      new Set(["a@example.com", "b@example.com"]),
    );

    const req = createRequest("GET", "/api/email/recipient-count");
    const res = await recipientCount(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ count: 3 });
  });

  it("keeps the legacy serviceId filter working through the shared compiler", async () => {
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
    ]);

    const req = createRequest(
      "GET",
      "/api/email/recipient-count?serviceId=svc-1&serviceId=svc-2",
    );
    const res = await recipientCount(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ count: 1 });

    const where = prismaMock.centreContact.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      subscribed: true,
      serviceId: { in: ["svc-1", "svc-2"] },
    });
  });

  it("resolves ?audienceId= through the audience rules, post-suppression", async () => {
    prismaMock.emailAudience.findUnique.mockResolvedValue({
      id: "aud-1",
      rules: { statuses: ["active"] },
      archived: false,
    });
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
      contact("b@example.com"),
      contact("c@example.com"),
    ]);
    mockedGetSuppressedEmails.mockResolvedValue(new Set(["b@example.com"]));

    const req = createRequest(
      "GET",
      "/api/email/recipient-count?audienceId=aud-1",
    );
    const res = await recipientCount(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ count: 2 });

    const where = prismaMock.centreContact.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ subscribed: true, status: { in: ["active"] } });
  });

  it("returns 404 for an unknown audienceId", async () => {
    prismaMock.emailAudience.findUnique.mockResolvedValue(null);

    const req = createRequest(
      "GET",
      "/api/email/recipient-count?audienceId=nope",
    );
    const res = await recipientCount(req);
    expect(res.status).toBe(404);
    expect(prismaMock.centreContact.findMany).not.toHaveBeenCalled();
  });

  it("returns 409 for an archived audience", async () => {
    prismaMock.emailAudience.findUnique.mockResolvedValue({
      id: "aud-1",
      rules: {},
      archived: true,
    });

    const req = createRequest(
      "GET",
      "/api/email/recipient-count?audienceId=aud-1",
    );
    const res = await recipientCount(req);
    expect(res.status).toBe(409);
    expect(prismaMock.centreContact.findMany).not.toHaveBeenCalled();
  });

  it("rejects member role with 403", async () => {
    prismaMock.user.findUnique.mockReset();
    prismaMock.user.findUnique.mockImplementation(
      async (args: { where?: { id?: string } } | undefined) => {
        if (args?.where?.id === "user-1") {
          return { active: true, id: "user-1", role: "member" } as never;
        }
        return null;
      },
    );
    mockSession({ id: "user-1", name: "Member", role: "member" });

    const req = createRequest("GET", "/api/email/recipient-count");
    const res = await recipientCount(req);
    expect(res.status).toBe(403);
    expect(prismaMock.centreContact.findMany).not.toHaveBeenCalled();
  });
});
