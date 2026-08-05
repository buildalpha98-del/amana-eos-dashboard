import { describe, it, expect } from "vitest";
import {
  normalizeBrevoEvent,
  parseBrevoWebhookBody,
  SUPPRESSION_EVENTS,
} from "@/lib/brevo-events";

describe("normalizeBrevoEvent", () => {
  it("maps Brevo names onto the canonical EmailEvent vocabulary", () => {
    expect(normalizeBrevoEvent("delivered")).toBe("delivered");
    expect(normalizeBrevoEvent("opened")).toBe("opened");
    expect(normalizeBrevoEvent("unique_opened")).toBe("opened");
    expect(normalizeBrevoEvent("click")).toBe("clicked");
    expect(normalizeBrevoEvent("hard_bounce")).toBe("bounced");
    expect(normalizeBrevoEvent("spam")).toBe("complained");
    expect(normalizeBrevoEvent("unsubscribed")).toBe("unsubscribed");
    expect(normalizeBrevoEvent("blocked")).toBe("blocked");
  });
  it("returns null for ignorable events", () => {
    for (const e of ["soft_bounce", "deferred", "request", "loaded_by_proxy", "whatever"]) {
      expect(normalizeBrevoEvent(e)).toBeNull();
    }
  });
});

describe("SUPPRESSION_EVENTS", () => {
  it("suppresses hard bounces, spam, unsubscribes and blocks — not opens/clicks", () => {
    expect(SUPPRESSION_EVENTS.has("bounced")).toBe(true);
    expect(SUPPRESSION_EVENTS.has("complained")).toBe(true);
    expect(SUPPRESSION_EVENTS.has("unsubscribed")).toBe(true);
    expect(SUPPRESSION_EVENTS.has("blocked")).toBe(true);
    expect(SUPPRESSION_EVENTS.has("opened")).toBe(false);
    expect(SUPPRESSION_EVENTS.has("clicked")).toBe(false);
    expect(SUPPRESSION_EVENTS.has("delivered")).toBe(false);
  });
});

describe("parseBrevoWebhookBody", () => {
  it("extracts a transactional event", () => {
    const parsed = parseBrevoWebhookBody({
      event: "click",
      email: "Parent@Example.com",
      "message-id": "<msg-1@smtp-relay.brevo.com>",
      link: "https://amanaoshc.company/book",
      ts: 1754500000,
    });
    expect(parsed).toEqual({
      type: "clicked",
      email: "parent@example.com",
      messageId: "<msg-1@smtp-relay.brevo.com>",
      campId: null,
    });
  });
  it("extracts a campaign event (camp_id, no per-recipient message-id)", () => {
    const parsed = parseBrevoWebhookBody({
      event: "opened",
      email: "parent@example.com",
      camp_id: 42,
    });
    expect(parsed).toEqual({
      type: "opened",
      email: "parent@example.com",
      messageId: "camp:42",
      campId: "42",
    });
  });
  it("returns null when the event is ignorable or fields are missing", () => {
    expect(parseBrevoWebhookBody({ event: "deferred", email: "a@b.c" })).toBeNull();
    expect(parseBrevoWebhookBody({ event: "click" })).toBeNull(); // no email
    expect(parseBrevoWebhookBody("not-an-object")).toBeNull();
  });
});
