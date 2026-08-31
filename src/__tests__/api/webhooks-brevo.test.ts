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

    it("correlates via a dl: tag using a PK existence check, never findFirst (string tag form)", async () => {
      prismaMock.deliveryLog.findUnique.mockResolvedValue({ id: "dl123" });
      prismaMock.emailEvent.findFirst.mockResolvedValue(null);

      const req = postBody({
        event: "opened",
        email: "parent@example.com",
        "message-id": "<msg-tagged>",
        tag: "dl:dl123",
      });
      const res = await POST(req);
      expect(res.status).toBe(200);

      expect(prismaMock.deliveryLog.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.deliveryLog.findUnique).toHaveBeenCalledWith({
        where: { id: "dl123" },
        select: { id: true },
      });
      expect(prismaMock.emailEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          messageId: "<msg-tagged>",
          type: "opened",
          email: "parent@example.com",
          deliveryLogId: "dl123",
        }),
      });
    });

    it("correlates via a dl: tag in the tags array form", async () => {
      prismaMock.deliveryLog.findUnique.mockResolvedValue({ id: "dl456" });
      prismaMock.emailEvent.findFirst.mockResolvedValue(null);

      const req = postBody({
        event: "click",
        email: "parent@example.com",
        "message-id": "<msg-tagged-2>",
        tags: ["dl:dl456"],
        link: "https://amanaoshc.company/book",
      });
      const res = await POST(req);
      expect(res.status).toBe(200);

      expect(prismaMock.deliveryLog.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.emailEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ deliveryLogId: "dl456" }),
      });
    });

    it("stores deliveryLogId null when a dl: tag names an id that doesn't exist (fabricated tags can't pollute reports)", async () => {
      prismaMock.deliveryLog.findUnique.mockResolvedValue(null);
      prismaMock.emailEvent.findFirst.mockResolvedValue(null);

      const req = postBody({
        event: "opened",
        email: "parent@example.com",
        "message-id": "<msg-forged>",
        tag: "dl:not-a-real-log",
      });
      const res = await POST(req);
      expect(res.status).toBe(200);

      expect(prismaMock.deliveryLog.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.emailEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          messageId: "<msg-forged>",
          deliveryLogId: null,
        }),
      });
    });

    it("falls through to externalId correlation when the tag is not a dl: tag", async () => {
      prismaMock.deliveryLog.findFirst.mockResolvedValue({ id: "dl-legacy" });
      prismaMock.emailEvent.findFirst.mockResolvedValue(null);

      const req = postBody({
        event: "delivered",
        email: "parent@example.com",
        "message-id": "<msg-untagged>",
        tag: "newsletter",
      });
      const res = await POST(req);
      expect(res.status).toBe(200);

      expect(prismaMock.deliveryLog.findFirst).toHaveBeenCalledWith({
        where: { externalId: "<msg-untagged>", externalIdType: "brevo_message" },
        select: { id: true },
      });
      expect(prismaMock.emailEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ deliveryLogId: "dl-legacy" }),
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

    describe("scheduled→sent sync", () => {
      it("flips a scheduled row to sent with sentAt stamped on a delivered event", async () => {
        prismaMock.deliveryLog.findUnique.mockResolvedValue({ id: "dl-sched" });
        prismaMock.deliveryLog.updateMany.mockResolvedValue({ count: 1 });
        prismaMock.emailEvent.findFirst.mockResolvedValue(null);

        const req = postBody({
          event: "delivered",
          email: "parent@example.com",
          "message-id": "<msg-sched-1>",
          tag: "dl:dl-sched",
        });
        const res = await POST(req);
        expect(res.status).toBe(200);

        expect(prismaMock.deliveryLog.updateMany).toHaveBeenCalledTimes(1);
        expect(prismaMock.deliveryLog.updateMany).toHaveBeenCalledWith({
          where: { id: "dl-sched", status: "scheduled" },
          data: { status: "sent", sentAt: expect.any(Date) },
        });
      });

      it("never resurrects a cancelled row — the status guard no-ops and the webhook still 200s", async () => {
        prismaMock.deliveryLog.findUnique.mockResolvedValue({ id: "dl-cancelled" });
        // Row is status "cancelled" → the WHERE { status: "scheduled" } matches 0.
        prismaMock.deliveryLog.updateMany.mockResolvedValue({ count: 0 });
        prismaMock.emailEvent.findFirst.mockResolvedValue(null);

        const req = postBody({
          event: "delivered",
          email: "parent@example.com",
          "message-id": "<msg-cancelled>",
          tag: "dl:dl-cancelled",
        });
        const res = await POST(req);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json).toEqual({ received: true });

        // The flip is a single conditional update — count 0 means untouched;
        // no unconditional write path may exist.
        expect(prismaMock.deliveryLog.updateMany).toHaveBeenCalledWith({
          where: { id: "dl-cancelled", status: "scheduled" },
          data: { status: "sent", sentAt: expect.any(Date) },
        });
        expect(prismaMock.deliveryLog.update).not.toHaveBeenCalled();
      });

      it("leaves partial rows untouched — the WHERE is status-guarded", async () => {
        prismaMock.deliveryLog.findUnique.mockResolvedValue({ id: "dl-partial" });
        prismaMock.deliveryLog.updateMany.mockResolvedValue({ count: 0 });
        prismaMock.emailEvent.findFirst.mockResolvedValue(null);

        const req = postBody({
          event: "delivered",
          email: "parent@example.com",
          "message-id": "<msg-partial>",
          tag: "dl:dl-partial",
        });
        const res = await POST(req);
        expect(res.status).toBe(200);

        // The updateMany fires, but its WHERE pins status "scheduled" so a
        // partial row can never be overwritten to plain "sent".
        const args = prismaMock.deliveryLog.updateMany.mock.calls[0][0];
        expect(args.where).toEqual({ id: "dl-partial", status: "scheduled" });
        expect(prismaMock.deliveryLog.update).not.toHaveBeenCalled();
      });

      it("duplicate delivered event: the event is deduped but the sync still fires as a no-op", async () => {
        prismaMock.deliveryLog.findUnique.mockResolvedValue({ id: "dl-sched" });
        // Second fire: row already flipped to "sent" → count 0.
        prismaMock.deliveryLog.updateMany.mockResolvedValue({ count: 0 });
        prismaMock.emailEvent.findFirst.mockResolvedValue({ id: "existing-event" });

        const req = postBody({
          event: "delivered",
          email: "parent@example.com",
          "message-id": "<msg-sched-dupe>",
          tag: "dl:dl-sched",
        });
        const res = await POST(req);
        expect(res.status).toBe(200);

        expect(prismaMock.emailEvent.create).not.toHaveBeenCalled();
        // The sync runs OUTSIDE the dedupe branch — a crash between the event
        // create and the flip must not strand the row at "scheduled".
        expect(prismaMock.deliveryLog.updateMany).toHaveBeenCalledTimes(1);
        expect(prismaMock.deliveryLog.updateMany).toHaveBeenCalledWith({
          where: { id: "dl-sched", status: "scheduled" },
          data: { status: "sent", sentAt: expect.any(Date) },
        });
      });

      it("does not attempt the sync on non-delivered event types", async () => {
        prismaMock.deliveryLog.findUnique.mockResolvedValue({ id: "dl-sent" });
        prismaMock.emailEvent.findFirst.mockResolvedValue(null);

        const req = postBody({
          event: "opened",
          email: "parent@example.com",
          "message-id": "<msg-open-nosync>",
          tag: "dl:dl-sent",
        });
        const res = await POST(req);
        expect(res.status).toBe(200);

        expect(prismaMock.deliveryLog.updateMany).not.toHaveBeenCalled();
        expect(prismaMock.emailEvent.create).toHaveBeenCalledTimes(1);
      });

      it("does not attempt the sync when no DeliveryLog correlates", async () => {
        prismaMock.deliveryLog.findFirst.mockResolvedValue(null);
        prismaMock.emailEvent.findFirst.mockResolvedValue(null);

        const req = postBody({
          event: "delivered",
          email: "parent@example.com",
          "message-id": "<msg-uncorrelated>",
        });
        const res = await POST(req);
        expect(res.status).toBe(200);

        expect(prismaMock.deliveryLog.updateMany).not.toHaveBeenCalled();
      });
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
