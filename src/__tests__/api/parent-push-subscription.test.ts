/**
 * Route tests for POST/DELETE /api/parent/push/subscription.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { NextResponse } from "next/server";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));
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
vi.mock("jose", () => ({ SignJWT: vi.fn(), jwtVerify: vi.fn() }));

const _parentSession = { current: null as any };
vi.mock("@/lib/parent-auth", () => ({
  getParentSession: vi.fn(() => Promise.resolve(_parentSession.current)),
  signParentJwt: vi.fn(),
  verifyParentJwt: vi.fn(),
  withParentAuth: (handler: Function) => {
    return async (req: any, routeCtx?: any) => {
      const parent = _parentSession.current;
      if (!parent) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const ctx = { ...routeCtx, parent };
      try {
        return await handler(req, ctx);
      } catch (err: any) {
        if (err?.name === "ApiError") {
          return NextResponse.json(
            { error: err.message, details: err.details },
            { status: err.status },
          );
        }
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
      }
    };
  },
}));

import {
  POST,
  DELETE,
} from "@/app/api/parent/push/subscription/route";

const parentPayload = {
  email: "parent@test.com",
  name: "Test Parent",
  enrolmentIds: ["enrol-1"],
};

const validBody = {
  endpoint: "https://push.example/abc",
  keys: { p256dh: "pubkey", auth: "authkey" },
  userAgent: "Mozilla/5.0 …",
};

describe("POST /api/parent/push/subscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _parentSession.current = parentPayload;
  });

  it("returns 401 with no session", async () => {
    _parentSession.current = null;
    const res = await POST(
      createRequest("POST", "/api/parent/push/subscription", { body: validBody }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid body (missing keys)", async () => {
    prismaMock.centreContact.findFirst.mockResolvedValue({ id: "contact-1" });
    const res = await POST(
      createRequest("POST", "/api/parent/push/subscription", {
        body: { endpoint: "x" } as any,
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when no CentreContact exists for the parent", async () => {
    prismaMock.centreContact.findFirst.mockResolvedValue(null);
    const res = await POST(
      createRequest("POST", "/api/parent/push/subscription", { body: validBody }),
    );
    expect(res.status).toBe(403);
  });

  it("upserts the subscription and returns { subscribed: true }", async () => {
    prismaMock.centreContact.findFirst.mockResolvedValue({ id: "contact-1" });
    prismaMock.pushSubscription.upsert.mockResolvedValue({ id: "sub-1" });

    const res = await POST(
      createRequest("POST", "/api/parent/push/subscription", { body: validBody }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ subscribed: true });

    const call = prismaMock.pushSubscription.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ endpoint: validBody.endpoint });
    expect(call.create).toMatchObject({
      familyId: "contact-1",
      endpoint: validBody.endpoint,
      p256dh: "pubkey",
      auth: "authkey",
      userAgent: "Mozilla/5.0 …",
    });
    expect(call.update).toMatchObject({
      familyId: "contact-1",
      p256dh: "pubkey",
      auth: "authkey",
      userAgent: "Mozilla/5.0 …",
    });
  });

  it("accepts a subscription without userAgent", async () => {
    prismaMock.centreContact.findFirst.mockResolvedValue({ id: "contact-1" });
    prismaMock.pushSubscription.upsert.mockResolvedValue({ id: "sub-1" });

    const res = await POST(
      createRequest("POST", "/api/parent/push/subscription", {
        body: {
          endpoint: validBody.endpoint,
          keys: validBody.keys,
        },
      }),
    );
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/parent/push/subscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _parentSession.current = parentPayload;
  });

  it("returns 401 with no session", async () => {
    _parentSession.current = null;
    const res = await DELETE(
      createRequest("DELETE", "/api/parent/push/subscription", {
        body: { endpoint: "x" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when endpoint is missing", async () => {
    const res = await DELETE(
      createRequest("DELETE", "/api/parent/push/subscription", {
        body: {} as any,
      }),
    );
    expect(res.status).toBe(400);
  });

  it("deletes the subscription scoped to the parent's contactIds", async () => {
    prismaMock.centreContact.findMany.mockResolvedValue([
      { id: "contact-1" },
      { id: "contact-2" },
    ]);
    prismaMock.pushSubscription.deleteMany.mockResolvedValue({ count: 1 });

    const res = await DELETE(
      createRequest("DELETE", "/api/parent/push/subscription", {
        body: { endpoint: "https://push.example/abc" },
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ subscribed: false });

    expect(prismaMock.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: {
        endpoint: "https://push.example/abc",
        familyId: { in: ["contact-1", "contact-2"] },
      },
    });
  });

  it("is idempotent when the subscription doesn't exist", async () => {
    prismaMock.centreContact.findMany.mockResolvedValue([{ id: "contact-1" }]);
    prismaMock.pushSubscription.deleteMany.mockResolvedValue({ count: 0 });

    const res = await DELETE(
      createRequest("DELETE", "/api/parent/push/subscription", {
        body: { endpoint: "https://push.example/unknown" },
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ subscribed: false });
  });
});
