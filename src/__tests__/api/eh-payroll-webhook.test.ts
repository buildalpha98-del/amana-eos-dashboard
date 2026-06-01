/**
 * End-to-end tests for the EH Payroll webhook route + admin events
 * list. The lib-level HMAC verification has its own test file; this
 * test exercises the route wiring: persistence, idempotency, and the
 * admin-only audit list.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
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
  generateRequestId: () => "test-req",
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

import { POST } from "@/app/api/webhooks/eh-payroll/route";
import { GET as EVENTS_GET } from "@/app/api/eh-payroll/webhook-events/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const SECRET = "test-secret-eh";

function sign(body: string): string {
  return createHmac("sha256", SECRET).update(body).digest("hex");
}

function signedRequest(body: string): Request {
  const req = new Request("http://localhost/api/webhooks/eh-payroll", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-yourpayroll-signature": sign(body),
    },
    body,
  });
  return req as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  process.env.EH_PAYROLL_WEBHOOK_SECRET = SECRET;
  prismaMock.user.findUnique.mockResolvedValue({
    active: true,
    serviceId: "svc-1",
  });
});

describe("POST /api/webhooks/eh-payroll", () => {
  it("rejects unsigned requests with 401", async () => {
    const req = new Request("http://localhost/api/webhooks/eh-payroll", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"event_type":"test"}',
    });
    const res = await POST(req as never, { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
  });

  it("rejects requests with bad signature with 401", async () => {
    const req = new Request("http://localhost/api/webhooks/eh-payroll", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-yourpayroll-signature": "0".repeat(64),
      },
      body: '{"event_type":"test"}',
    });
    const res = await POST(req as never, { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
  });

  it("stores a signed event with providerEventId via upsert", async () => {
    const body = JSON.stringify({
      event_type: "leave_request.updated",
      event_id: "abc-123",
      data: { foo: "bar" },
    });
    prismaMock.ehWebhookEvent.upsert.mockResolvedValue({
      id: "stored-1",
      eventType: "leave_request.updated",
    });
    prismaMock.ehWebhookEvent.update.mockResolvedValue({});

    const res = await POST(signedRequest(body) as never, {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(200);

    const call = prismaMock.ehWebhookEvent.upsert.mock.calls[0]?.[0];
    expect(call?.where).toEqual({ providerEventId: "abc-123" });
    expect(call?.create).toMatchObject({
      eventType: "leave_request.updated",
      providerEventId: "abc-123",
    });
  });

  it("stores an event without providerEventId via create", async () => {
    const body = JSON.stringify({
      event_type: "leave_request.created",
      // no event_id
    });
    prismaMock.ehWebhookEvent.create.mockResolvedValue({
      id: "stored-2",
      eventType: "leave_request.created",
    });
    prismaMock.ehWebhookEvent.update.mockResolvedValue({});

    const res = await POST(signedRequest(body) as never, {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(200);
    expect(prismaMock.ehWebhookEvent.create).toHaveBeenCalled();
    expect(prismaMock.ehWebhookEvent.upsert).not.toHaveBeenCalled();
  });

  it("returns 500 when persistence fails (EH should retry)", async () => {
    const body = JSON.stringify({
      event_type: "leave_request.updated",
      event_id: "abc-456",
    });
    prismaMock.ehWebhookEvent.upsert.mockRejectedValue(
      new Error("DB unavailable"),
    );
    const res = await POST(signedRequest(body) as never, {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(500);
  });

  it("returns 400 for invalid JSON even with valid signature", async () => {
    const bad = "not-json-{";
    const req = new Request("http://localhost/api/webhooks/eh-payroll", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-yourpayroll-signature": sign(bad),
      },
      body: bad,
    });
    const res = await POST(req as never, { params: Promise.resolve({}) });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/eh-payroll/webhook-events — admin audit list", () => {
  it("rejects staff", async () => {
    mockSession({ id: "staff-1", name: "Staff", role: "staff" });
    const res = await EVENTS_GET(
      createRequest("GET", "/api/eh-payroll/webhook-events"),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(403);
  });

  it("admin gets the list + summary counts", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.ehWebhookEvent.findMany.mockResolvedValue([
      {
        id: "e-1",
        eventType: "leave_request.updated",
        providerEventId: "abc",
        receivedAt: new Date(),
        processedAt: new Date(),
        error: null,
      },
    ]);
    prismaMock.ehWebhookEvent.count.mockResolvedValue(5);
    const res = await EVENTS_GET(
      createRequest("GET", "/api/eh-payroll/webhook-events"),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toHaveLength(1);
    expect(body.summary.last24h).toBe(5);
    expect(body.summary.last7d).toBe(5);
  });

  it("clamps limit to 200", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.ehWebhookEvent.findMany.mockResolvedValue([]);
    prismaMock.ehWebhookEvent.count.mockResolvedValue(0);
    await EVENTS_GET(
      createRequest("GET", "/api/eh-payroll/webhook-events?limit=99999"),
      { params: Promise.resolve({}) },
    );
    const call = prismaMock.ehWebhookEvent.findMany.mock.calls[0]?.[0];
    expect(call?.take).toBe(200);
  });
});
