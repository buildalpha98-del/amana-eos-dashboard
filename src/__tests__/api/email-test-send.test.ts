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
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })),
}));

vi.mock("@/lib/brevo", () => ({
  isBrevoConfigured: vi.fn(() => true),
  sendTransactionalEmail: vi.fn(),
  sendCampaignEmail: vi.fn(),
}));

vi.mock("@/lib/email-suppression", () => ({
  isEmailSuppressed: vi.fn(),
}));

import { isBrevoConfigured, sendTransactionalEmail } from "@/lib/brevo";
import { isEmailSuppressed } from "@/lib/email-suppression";

const mockedIsBrevoConfigured = vi.mocked(isBrevoConfigured);
const mockedSendTransactional = vi.mocked(sendTransactionalEmail);
const mockedIsEmailSuppressed = vi.mocked(isEmailSuppressed);

import { POST as testSend } from "@/app/api/email/test-send/route";
import { _clearEmailBrandingCache } from "@/lib/email-branding";

const SESSION_EMAIL = "owner@amanaoshc.com.au";

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

function postBody(body: Record<string, unknown>) {
  return createRequest("POST", "/api/email/test-send", { body });
}

describe("POST /api/email/test-send", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    setupActiveUserMock();
    mockSession({
      id: "user-1",
      name: "Owner",
      email: SESSION_EMAIL,
      role: "owner",
    });
    mockedIsBrevoConfigured.mockReturnValue(true);
    mockedIsEmailSuppressed.mockResolvedValue(false);
    mockedSendTransactional.mockResolvedValue({ messageId: "msg-test-1" });
    prismaMock.orgSettings.findUnique.mockResolvedValue(null);
    prismaMock.deliveryLog.create.mockImplementation(
      async (args: { data: Record<string, unknown> }) =>
        ({ id: "log-1", ...args.data }) as never,
    );
  });

  it("returns 401 when unauthenticated and never sends", async () => {
    mockNoSession();

    const res = await testSend(postBody({ subject: "Hello", htmlContent: "<p>hi</p>" }));
    expect(res.status).toBe(401);
    expect(mockedSendTransactional).not.toHaveBeenCalled();
  });

  it("returns 503 when Brevo is not configured", async () => {
    mockedIsBrevoConfigured.mockReturnValue(false);

    const res = await testSend(postBody({ subject: "Hello", htmlContent: "<p>hi</p>" }));
    expect(res.status).toBe(503);
    expect(mockedSendTransactional).not.toHaveBeenCalled();
  });

  it("sends ONLY to the session user's email, ignoring any `to` in the body", async () => {
    const res = await testSend(
      postBody({
        subject: "Hello",
        htmlContent: "<p>hi</p>",
        to: [{ email: "attacker@example.com" }],
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.email).toBe(SESSION_EMAIL);

    expect(mockedSendTransactional).toHaveBeenCalledTimes(1);
    const call = mockedSendTransactional.mock.calls[0][0];
    expect(call.to).toHaveLength(1);
    expect(call.to[0].email).toBe(SESSION_EMAIL);
  });

  it("prefixes the subject with '[Test] ' and tags the send 'test-send'", async () => {
    const res = await testSend(postBody({ subject: "Hello", htmlContent: "<p>hi</p>" }));
    expect(res.status).toBe(200);

    const call = mockedSendTransactional.mock.calls[0][0];
    expect(call.subject).toBe("[Test] Hello");
    expect(call.tags).toEqual(["test-send"]);
  });

  it("renders blocks when provided (blocks win over htmlContent, same order as campaign/send)", async () => {
    const res = await testSend(
      postBody({
        subject: "Hello",
        blocks: [{ type: "text", content: "Block body text" }],
        htmlContent: "<p>raw html should lose</p>",
      }),
    );
    expect(res.status).toBe(200);

    const call = mockedSendTransactional.mock.calls[0][0];
    expect(call.htmlContent).toContain("Block body text");
    expect(call.htmlContent).not.toContain("raw html should lose");
  });

  it("renders htmlContent when no blocks are provided", async () => {
    const res = await testSend(
      postBody({ subject: "Hello", htmlContent: "<p>raw html body</p>" }),
    );
    expect(res.status).toBe(200);

    const call = mockedSendTransactional.mock.calls[0][0];
    expect(call.htmlContent).toContain("raw html body");
  });

  it("returns 400 when neither blocks, htmlContent nor templateId is provided", async () => {
    const res = await testSend(postBody({ subject: "Hello" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/no content/i);

    expect(mockedSendTransactional).not.toHaveBeenCalled();
    expect(prismaMock.deliveryLog.create).not.toHaveBeenCalled();
  });

  it("returns 400 when the session user has no email address", async () => {
    mockSession({ id: "user-1", name: "Owner", email: "", role: "owner" });

    const res = await testSend(postBody({ subject: "Hello", htmlContent: "<p>hi</p>" }));
    expect(res.status).toBe(400);
    expect(mockedSendTransactional).not.toHaveBeenCalled();
  });

  it("creates a DeliveryLog with messageType 'test', recipientCount 1, externalIdType 'brevo_message'", async () => {
    const res = await testSend(postBody({ subject: "Hello", htmlContent: "<p>hi</p>" }));
    expect(res.status).toBe(200);

    expect(prismaMock.deliveryLog.create).toHaveBeenCalledTimes(1);
    const createArgs = prismaMock.deliveryLog.create.mock.calls[0][0];
    expect(createArgs.data.messageType).toBe("test");
    expect(createArgs.data.recipientCount).toBe(1);
    expect(createArgs.data.externalIdType).toBe("brevo_message");
    expect(createArgs.data.externalId).toBe("msg-test-1");
  });

  it("never touches MarketingPost, even when a postId is smuggled into the body", async () => {
    const res = await testSend(
      postBody({ subject: "Hello", htmlContent: "<p>hi</p>", postId: "post-1" }),
    );
    expect(res.status).toBe(200);

    expect(prismaMock.marketingPost.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.marketingPost.update).not.toHaveBeenCalled();
  });

  it("still sends when the user's own address is suppressed, but includes a warning", async () => {
    mockedIsEmailSuppressed.mockResolvedValue(true);

    const res = await testSend(postBody({ subject: "Hello", htmlContent: "<p>hi</p>" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.warning).toMatch(/suppression/i);
    expect(json.email).toBe(SESSION_EMAIL);

    expect(mockedSendTransactional).toHaveBeenCalledTimes(1);
  });

  it("omits the warning field when the address is not suppressed", async () => {
    const res = await testSend(postBody({ subject: "Hello", htmlContent: "<p>hi</p>" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.warning).toBeUndefined();
  });
});

describe("POST /api/email/test-send — block-mode renders org branding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    _clearEmailBrandingCache();
    setupActiveUserMock();
    mockSession({
      id: "user-1",
      name: "Owner",
      email: SESSION_EMAIL,
      role: "owner",
    });
    mockedIsBrevoConfigured.mockReturnValue(true);
    mockedIsEmailSuppressed.mockResolvedValue(false);
    mockedSendTransactional.mockResolvedValue({ messageId: "msg-test-1" });
    // Branding differs from DEFAULT_LAYOUT so the assertion can tell the
    // branding-derived layoutOpts apart from the layout defaults.
    prismaMock.orgSettings.findUnique.mockResolvedValue({
      name: "Bright Futures OSHC",
      primaryColor: "#112233",
    });
    prismaMock.deliveryLog.create.mockImplementation(
      async (args: { data: Record<string, unknown> }) =>
        ({ id: "log-1", ...args.data }) as never,
    );
  });

  it("blocks-mode test send renders the branding header, not DEFAULT_LAYOUT (parity pin)", async () => {
    const res = await testSend(
      postBody({
        subject: "Hello",
        blocks: [{ type: "text", content: "Block body" }],
      }),
    );
    expect(res.status).toBe(200);

    const call = mockedSendTransactional.mock.calls[0][0];
    expect(call.htmlContent).toContain("Block body");
    expect(call.htmlContent).toContain("Bright Futures OSHC");
    expect(call.htmlContent).toContain("#112233");
  });

  it("template blocks-mode test send renders the branding header (templateId branch)", async () => {
    prismaMock.emailTemplate.findUnique.mockResolvedValue({
      id: "tpl-1",
      blocks: [{ type: "text", content: "Template block body" }],
      htmlContent: null,
    });

    const res = await testSend(postBody({ subject: "Hello", templateId: "tpl-1" }));
    expect(res.status).toBe(200);

    const call = mockedSendTransactional.mock.calls[0][0];
    expect(call.htmlContent).toContain("Template block body");
    expect(call.htmlContent).toContain("Bright Futures OSHC");
    expect(call.htmlContent).toContain("#112233");
  });

  it("htmlContent-mode test send renders the branding header (regression)", async () => {
    const res = await testSend(
      postBody({ subject: "Hello", htmlContent: "<p>raw body</p>" }),
    );
    expect(res.status).toBe(200);

    const call = mockedSendTransactional.mock.calls[0][0];
    expect(call.htmlContent).toContain("raw body");
    expect(call.htmlContent).toContain("Bright Futures OSHC");
    expect(call.htmlContent).toContain("#112233");
  });

  it("a user layoutOptions override wins over branding while untouched fields keep it", async () => {
    const res = await testSend(
      postBody({
        subject: "Hello",
        blocks: [{ type: "text", content: "Block body" }],
        layoutOptions: { headerText: "Winter Fair 2026" },
      }),
    );
    expect(res.status).toBe(200);

    const call = mockedSendTransactional.mock.calls[0][0];
    // Override wins in the header; headerColor + footerText still track
    // branding — the test send must look exactly like the real send would.
    expect(call.htmlContent).toContain("Winter Fair 2026");
    expect(call.htmlContent).toContain("#112233");
    expect(call.htmlContent).toContain("Bright Futures OSHC");
  });

  it("rejects invalid layoutOptions with 400 and never sends", async () => {
    const res = await testSend(
      postBody({
        subject: "Hello",
        htmlContent: "<p>hi</p>",
        layoutOptions: { headerColor: "red" },
      }),
    );
    expect(res.status).toBe(400);
    expect(mockedSendTransactional).not.toHaveBeenCalled();
    expect(prismaMock.deliveryLog.create).not.toHaveBeenCalled();
  });

  it("rejects unknown layoutOptions keys with 400 (strict schema)", async () => {
    const res = await testSend(
      postBody({
        subject: "Hello",
        htmlContent: "<p>hi</p>",
        layoutOptions: { sneaky: "nope" },
      }),
    );
    expect(res.status).toBe(400);
    expect(mockedSendTransactional).not.toHaveBeenCalled();
  });
});
