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

import {
  isBrevoConfigured,
  sendTransactionalEmail,
  sendCampaignEmail,
} from "@/lib/brevo";
import { getSuppressedEmails } from "@/lib/email-suppression";

const mockedIsBrevoConfigured = vi.mocked(isBrevoConfigured);
const mockedSendTransactional = vi.mocked(sendTransactionalEmail);
const mockedSendCampaign = vi.mocked(sendCampaignEmail);
const mockedGetSuppressedEmails = vi.mocked(getSuppressedEmails);

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
    mockedSendTransactional.mockResolvedValue({ messageId: "msg-123" });
    mockedSendCampaign.mockResolvedValue({ campaignId: 456 });
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

    expect(mockedSendTransactional).toHaveBeenCalledTimes(1);
    const sentTo = mockedSendTransactional.mock.calls[0][0].to;
    expect(sentTo).toHaveLength(2);
    expect(sentTo.map((r: { email: string }) => r.email).sort()).toEqual([
      "a@example.com",
      "b@example.com",
    ]);

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

  it("stores externalIdType 'brevo_message' on the transactional (<50 recipient) path", async () => {
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
      contact("b@example.com"),
      contact("c@example.com"),
    ]);
    mockedGetSuppressedEmails.mockResolvedValue(new Set());

    const res = await sendCampaign(postBody({}));
    expect(res.status).toBe(200);

    expect(mockedSendTransactional).toHaveBeenCalledTimes(1);
    expect(mockedSendCampaign).not.toHaveBeenCalled();

    const createArgs = prismaMock.deliveryLog.create.mock.calls[0][0];
    expect(createArgs.data.externalIdType).toBe("brevo_message");
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
});

describe("POST /api/email/campaign/send — audienceId resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    setupActiveUserMock();
    mockSession({ id: "user-1", name: "Owner", role: "owner" });
    mockedIsBrevoConfigured.mockReturnValue(true);
    mockedGetSuppressedEmails.mockResolvedValue(new Set());
    mockedSendTransactional.mockResolvedValue({ messageId: "msg-123" });
    mockedSendCampaign.mockResolvedValue({ campaignId: 456 });
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
    expect(mockedSendTransactional).toHaveBeenCalledTimes(1);
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
    mockedSendTransactional.mockResolvedValue({ messageId: "msg-123" });
    mockedSendCampaign.mockResolvedValue({ campaignId: 456 });
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
});
