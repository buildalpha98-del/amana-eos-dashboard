import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 }),
  ),
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
vi.mock("@/lib/notifications/messaging", () => ({
  sendBroadcastNotification: vi.fn(() => Promise.resolve()),
}));

import { POST } from "@/app/api/messaging/broadcasts/route";

const ctx = (params: Record<string, string>) => ({
  params: Promise.resolve(params),
});

describe("POST /api/messaging/broadcasts — channels & SMS gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.service.findUnique.mockResolvedValue({
      id: "svc-1",
      name: "Bankstown",
    });
    prismaMock.broadcast.create.mockResolvedValue({
      id: "b-1",
      serviceId: "svc-1",
      subject: "T",
      body: "B",
      channels: ["email"],
      sentById: "u1",
      sentByName: "Admin",
      recipientCount: 0,
      smsRecipientCount: 0,
      sentAt: new Date(),
      createdAt: new Date(),
      service: { id: "svc-1", name: "Bankstown" },
    } as never);
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const req = createRequest("POST", "/api/messaging/broadcasts", {
      body: { serviceId: "svc-1", subject: "Hi", body: "Hello" },
    });
    const res = await POST(req, ctx({}));
    expect(res.status).toBe(401);
  });

  it("rejects invalid channel value (400)", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin", serviceId: null });
    const req = createRequest("POST", "/api/messaging/broadcasts", {
      body: {
        serviceId: "svc-1",
        subject: "Hi",
        body: "Hello",
        channels: ["fax"], // not in enum
      },
    });
    const res = await POST(req, ctx({}));
    expect(res.status).toBe(400);
  });

  it("rejects empty channels array (400)", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin", serviceId: null });
    const req = createRequest("POST", "/api/messaging/broadcasts", {
      body: {
        serviceId: "svc-1",
        subject: "Hi",
        body: "Hello",
        channels: [],
      },
    });
    const res = await POST(req, ctx({}));
    expect(res.status).toBe(400);
  });

  it("defaults to email-only when channels omitted (legacy compat)", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin", serviceId: null });
    prismaMock.centreContact.findMany.mockResolvedValue([
      { id: "f1", smsOptIn: false, mobile: null },
      { id: "f2", smsOptIn: true, mobile: "0412345678" },
    ] as never);
    const req = createRequest("POST", "/api/messaging/broadcasts", {
      body: { serviceId: "svc-1", subject: "Hi", body: "Hello" },
    });
    const res = await POST(req, ctx({}));
    expect(res.status).toBe(201);
    const createCall = prismaMock.broadcast.create.mock.calls[0]?.[0];
    expect(createCall?.data?.channels).toEqual(["email"]);
    expect(createCall?.data?.smsRecipientCount).toBe(0);
  });

  it("counts SMS-eligible recipients (opt-in + mobile present) when sms channel selected", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin", serviceId: null });
    prismaMock.centreContact.findMany.mockResolvedValue([
      { id: "f1", smsOptIn: false, mobile: "0412345678" }, // not opted in
      { id: "f2", smsOptIn: true, mobile: "0412345679" }, // ok
      { id: "f3", smsOptIn: true, mobile: null }, // no mobile
      { id: "f4", smsOptIn: true, mobile: "0412345680" }, // ok
    ] as never);
    const req = createRequest("POST", "/api/messaging/broadcasts", {
      body: {
        serviceId: "svc-1",
        subject: "Hi",
        body: "Hello",
        channels: ["email", "sms"],
      },
    });
    const res = await POST(req, ctx({}));
    expect(res.status).toBe(201);
    const createCall = prismaMock.broadcast.create.mock.calls[0]?.[0];
    expect(createCall?.data?.recipientCount).toBe(4);
    expect(createCall?.data?.smsRecipientCount).toBe(2);
    expect(createCall?.data?.channels).toEqual(["email", "sms"]);
  });

  it("returns 404 if service does not exist", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin", serviceId: null });
    prismaMock.service.findUnique.mockResolvedValue(null);
    const req = createRequest("POST", "/api/messaging/broadcasts", {
      body: { serviceId: "missing", subject: "Hi", body: "Hello" },
    });
    const res = await POST(req, ctx({}));
    expect(res.status).toBe(404);
  });
});
