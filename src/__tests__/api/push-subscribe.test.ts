/**
 * Route tests for POST/DELETE /api/push/subscribe (staff push subscriptions).
 *
 * Security contract (Task 3.3a): the route is session-authenticated and the
 * subscription is ALWAYS bound to the session user — a client-supplied
 * userId/familyId in the body must never influence the stored row. The
 * parent flow lives at /api/parent/push/subscription and is unaffected.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

import { POST, DELETE } from "@/app/api/push/subscribe/route";

const validSubscription = {
  endpoint: "https://push.example/staff-endpoint",
  keys: { p256dh: "pubkey", auth: "authkey" },
};

describe("POST /api/push/subscribe", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.pushSubscription.upsert.mockResolvedValue({});
  });

  it("returns 401 for an unauthenticated staff-shaped body", async () => {
    mockNoSession();
    const res = await POST(
      createRequest("POST", "/api/push/subscribe", {
        body: {
          subscription: validSubscription,
          userType: "staff",
          userId: "victim-user",
        },
      }),
    );
    expect(res.status).toBe(401);
    expect(prismaMock.pushSubscription.upsert).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid body", async () => {
    mockSession({ id: "u1", name: "Test", role: "staff" });
    const res = await POST(
      createRequest("POST", "/api/push/subscribe", {
        body: { subscription: { endpoint: "not-a-url", keys: {} } },
      }),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.pushSubscription.upsert).not.toHaveBeenCalled();
  });

  it("stores the subscription against the session user, ignoring body userId", async () => {
    mockSession({ id: "session-user", name: "Test", role: "staff" });

    const res = await POST(
      createRequest("POST", "/api/push/subscribe", {
        body: {
          subscription: validSubscription,
          userType: "staff",
          userId: "someone-else",
          familyId: "family-1",
        },
      }),
    );
    expect(res.status).toBe(200);

    const args = prismaMock.pushSubscription.upsert.mock.calls[0][0];
    expect(args.where).toEqual({ endpoint: validSubscription.endpoint });
    expect(args.create).toEqual({
      endpoint: validSubscription.endpoint,
      p256dh: "pubkey",
      auth: "authkey",
      userId: "session-user",
      familyId: null,
    });
    expect(args.update).toEqual({
      p256dh: "pubkey",
      auth: "authkey",
      userId: "session-user",
      familyId: null,
    });
  });

  it("works with the minimal body (no legacy fields)", async () => {
    mockSession({ id: "u1", name: "Test", role: "member" });
    const res = await POST(
      createRequest("POST", "/api/push/subscribe", {
        body: { subscription: validSubscription },
      }),
    );
    expect(res.status).toBe(200);
    const args = prismaMock.pushSubscription.upsert.mock.calls[0][0];
    expect(args.create.userId).toBe("u1");
  });
});

describe("DELETE /api/push/subscribe", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.pushSubscription.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await DELETE(
      createRequest("DELETE", "/api/push/subscribe", {
        body: { endpoint: validSubscription.endpoint },
      }),
    );
    expect(res.status).toBe(401);
    expect(prismaMock.pushSubscription.deleteMany).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid endpoint", async () => {
    mockSession({ id: "u1", name: "Test", role: "staff" });
    const res = await DELETE(
      createRequest("DELETE", "/api/push/subscribe", {
        body: { endpoint: "nope" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("only deletes rows belonging to the session user", async () => {
    mockSession({ id: "u1", name: "Test", role: "staff" });
    const res = await DELETE(
      createRequest("DELETE", "/api/push/subscribe", {
        body: { endpoint: validSubscription.endpoint },
      }),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { endpoint: validSubscription.endpoint, userId: "u1" },
    });
  });
});
