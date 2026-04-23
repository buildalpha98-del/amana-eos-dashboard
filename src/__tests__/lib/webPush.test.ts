/**
 * Unit tests for the Web Push helper.
 *
 * Mocks `web-push` so we can inspect calls and simulate 410/404 errors
 * without touching real push endpoints.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

// Mock web-push before importing the helper so the module-load-time
// setVapidDetails call is captured.
const sendNotification = vi.fn();
const setVapidDetails = vi.fn();
vi.mock("web-push", () => ({
  default: {
    sendNotification: (...args: unknown[]) => sendNotification(...args),
    setVapidDetails: (...args: unknown[]) => setVapidDetails(...args),
  },
}));

// Stub VAPID config so the module initialises cleanly.
process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "test-public";
process.env.VAPID_PRIVATE_KEY = "test-private";
process.env.VAPID_SUBJECT = "mailto:test@example.com";

// Dynamic import so env vars are in place at module-load.
let sendPush: typeof import("@/lib/push/webPush").sendPush;
let sendPushToContact: typeof import("@/lib/push/webPush").sendPushToContact;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  const mod = await import("@/lib/push/webPush");
  sendPush = mod.sendPush;
  sendPushToContact = mod.sendPushToContact;
});

describe("sendPush", () => {
  it("calls web-push with the endpoint and JSON-stringified payload", async () => {
    sendNotification.mockResolvedValueOnce(undefined);
    await sendPush(
      { endpoint: "https://p.example/abc", keys: { p256dh: "k", auth: "a" } },
      { title: "Hi", body: "There", url: "/parent" },
    );
    expect(sendNotification).toHaveBeenCalledTimes(1);
    const [sub, body] = sendNotification.mock.calls[0];
    expect(sub.endpoint).toBe("https://p.example/abc");
    expect(sub.keys.p256dh).toBe("k");
    expect(JSON.parse(body as string)).toEqual({
      title: "Hi",
      body: "There",
      url: "/parent",
    });
  });

  it("re-throws so callers can react to 410 / 404 / other errors", async () => {
    const err = Object.assign(new Error("gone"), { statusCode: 410 });
    sendNotification.mockRejectedValueOnce(err);
    await expect(
      sendPush(
        { endpoint: "x", keys: { p256dh: "k", auth: "a" } },
        { title: "t", body: "b" },
      ),
    ).rejects.toThrow("gone");
  });
});

describe("sendPushToContact", () => {
  it("returns 0/0 immediately when the contact has no subscriptions", async () => {
    prismaMock.pushSubscription.findMany.mockResolvedValueOnce([]);
    const res = await sendPushToContact("contact-1", {
      title: "t",
      body: "b",
    });
    expect(res).toEqual({ sent: 0, removed: 0 });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("sends one push per subscription and returns sent count", async () => {
    prismaMock.pushSubscription.findMany.mockResolvedValueOnce([
      { id: "s1", endpoint: "e1", p256dh: "k1", auth: "a1" },
      { id: "s2", endpoint: "e2", p256dh: "k2", auth: "a2" },
    ]);
    sendNotification.mockResolvedValue(undefined);
    const res = await sendPushToContact("contact-1", {
      title: "t",
      body: "b",
    });
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(res).toEqual({ sent: 2, removed: 0 });
    expect(prismaMock.pushSubscription.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes a subscription when the push endpoint returns 410 Gone", async () => {
    prismaMock.pushSubscription.findMany.mockResolvedValueOnce([
      { id: "s-dead", endpoint: "e-dead", p256dh: "k", auth: "a" },
    ]);
    sendNotification.mockRejectedValueOnce(
      Object.assign(new Error("gone"), { statusCode: 410 }),
    );
    prismaMock.pushSubscription.deleteMany.mockResolvedValueOnce({ count: 1 });

    const res = await sendPushToContact("contact-1", {
      title: "t",
      body: "b",
    });
    expect(res).toEqual({ sent: 0, removed: 1 });
    expect(prismaMock.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["s-dead"] } },
    });
  });

  it("also deletes on 404 Not Found (endpoint expired or unknown)", async () => {
    prismaMock.pushSubscription.findMany.mockResolvedValueOnce([
      { id: "s-expired", endpoint: "e", p256dh: "k", auth: "a" },
    ]);
    sendNotification.mockRejectedValueOnce(
      Object.assign(new Error("not found"), { statusCode: 404 }),
    );
    prismaMock.pushSubscription.deleteMany.mockResolvedValueOnce({ count: 1 });

    const res = await sendPushToContact("contact-1", {
      title: "t",
      body: "b",
    });
    expect(res).toEqual({ sent: 0, removed: 1 });
  });

  it("leaves the subscription alone on transient 5xx errors", async () => {
    prismaMock.pushSubscription.findMany.mockResolvedValueOnce([
      { id: "s-alive", endpoint: "e", p256dh: "k", auth: "a" },
    ]);
    sendNotification.mockRejectedValueOnce(
      Object.assign(new Error("service unavailable"), { statusCode: 503 }),
    );

    const res = await sendPushToContact("contact-1", {
      title: "t",
      body: "b",
    });
    expect(res).toEqual({ sent: 0, removed: 0 });
    expect(prismaMock.pushSubscription.deleteMany).not.toHaveBeenCalled();
  });
});
