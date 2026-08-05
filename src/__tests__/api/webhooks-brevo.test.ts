import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

import { POST } from "@/app/api/webhooks/brevo/route";

function postBody(body: Record<string, unknown>, secret = "s3cret") {
  return createRequest("POST", `/api/webhooks/brevo?secret=${secret}`, { body });
}

describe("POST /api/webhooks/brevo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("auth", () => {
    it("returns 401 when the secret is missing", async () => {
      vi.stubEnv("BREVO_WEBHOOK_SECRET", "s3cret");
      const req = createRequest("POST", "/api/webhooks/brevo", {
        body: { event: "delivered", email: "a@b.c", "message-id": "<m1>" },
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
      expect(prismaMock.emailEvent.create).not.toHaveBeenCalled();
    });

    it("returns 401 when the secret is wrong", async () => {
      vi.stubEnv("BREVO_WEBHOOK_SECRET", "s3cret");
      const req = postBody(
        { event: "delivered", email: "a@b.c", "message-id": "<m1>" },
        "wrong-secret",
      );
      const res = await POST(req);
      expect(res.status).toBe(401);
      expect(prismaMock.emailEvent.create).not.toHaveBeenCalled();
    });

    it("returns 500 when BREVO_WEBHOOK_SECRET is unset", async () => {
      vi.stubEnv("BREVO_WEBHOOK_SECRET", "");
      const req = postBody({ event: "delivered", email: "a@b.c", "message-id": "<m1>" });
      const res = await POST(req);
      expect(res.status).toBe(500);
    });
  });

  describe("event handling", () => {
    beforeEach(() => {
      vi.stubEnv("BREVO_WEBHOOK_SECRET", "s3cret");
    });

    it("acks an ignorable event with 200 and writes nothing", async () => {
      const req = postBody({ event: "soft_bounce", email: "a@b.c", "message-id": "<m1>" });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ received: true });
      expect(prismaMock.emailEvent.create).not.toHaveBeenCalled();
      expect(prismaMock.deliveryLog.findFirst).not.toHaveBeenCalled();
    });

    it("correlates a transactional click event to its DeliveryLog via brevo_message", async () => {
      prismaMock.deliveryLog.findFirst.mockResolvedValue({ id: "dl1" });
      prismaMock.emailEvent.findFirst.mockResolvedValue(null);

      const req = postBody({
        event: "click",
        email: "Parent@Example.com",
        "message-id": "<msg-1@smtp-relay.brevo.com>",
        link: "https://amanaoshc.company/book",
      });
      const res = await POST(req);
      expect(res.status).toBe(200);

      expect(prismaMock.deliveryLog.findFirst).toHaveBeenCalledWith({
        where: { externalId: "<msg-1@smtp-relay.brevo.com>", externalIdType: "brevo_message" },
        select: { id: true },
      });
      expect(prismaMock.emailEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          messageId: "<msg-1@smtp-relay.brevo.com>",
          type: "clicked",
          email: "parent@example.com",
          deliveryLogId: "dl1",
        }),
      });
    });

    it("correlates a campaign opened event to its DeliveryLog via brevo_campaign", async () => {
      prismaMock.deliveryLog.findFirst.mockResolvedValue({ id: "dl-camp" });
      prismaMock.emailEvent.findFirst.mockResolvedValue(null);

      const req = postBody({ event: "opened", email: "parent@example.com", camp_id: 42 });
      const res = await POST(req);
      expect(res.status).toBe(200);

      expect(prismaMock.deliveryLog.findFirst).toHaveBeenCalledWith({
        where: { externalId: "42", externalIdType: "brevo_campaign" },
        select: { id: true },
      });
      expect(prismaMock.emailEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          messageId: "camp:42",
          type: "opened",
          email: "parent@example.com",
          deliveryLogId: "dl-camp",
        }),
      });
    });

    it("writes the event with deliveryLogId null when no DeliveryLog matches", async () => {
      prismaMock.deliveryLog.findFirst.mockResolvedValue(null);
      prismaMock.emailEvent.findFirst.mockResolvedValue(null);

      const req = postBody({
        event: "delivered",
        email: "parent@example.com",
        "message-id": "<unmatched-1>",
      });
      const res = await POST(req);
      expect(res.status).toBe(200);

      expect(prismaMock.emailEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          messageId: "<unmatched-1>",
          type: "delivered",
          email: "parent@example.com",
          deliveryLogId: null,
        }),
      });
    });

    it("dedupes an identical event already recorded — no create", async () => {
      prismaMock.deliveryLog.findFirst.mockResolvedValue({ id: "dl1" });
      prismaMock.emailEvent.findFirst.mockResolvedValue({ id: "existing-event" });

      const req = postBody({
        event: "click",
        email: "parent@example.com",
        "message-id": "<msg-dupe>",
        link: "https://amanaoshc.company/book",
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ received: true });
      expect(prismaMock.emailEvent.create).not.toHaveBeenCalled();
    });

    it("suppresses the address on hard_bounce AND still writes the event", async () => {
      prismaMock.deliveryLog.findFirst.mockResolvedValue(null);
      prismaMock.emailEvent.findFirst.mockResolvedValue(null);

      const req = postBody({
        event: "hard_bounce",
        email: "Bounced@Example.com",
        "message-id": "<msg-bounce>",
        reason: "mailbox does not exist",
      });
      const res = await POST(req);
      expect(res.status).toBe(200);

      expect(prismaMock.emailEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          messageId: "<msg-bounce>",
          type: "bounced",
          email: "bounced@example.com",
        }),
      });
      expect(prismaMock.emailSuppression.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { email: "bounced@example.com" },
          create: expect.objectContaining({ email: "bounced@example.com", reason: "bounced" }),
        }),
      );
    });
  });
});
