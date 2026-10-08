/**
 * Centre-scope sweep (2026-10-08). Each of these routes checked only that
 * SOMEONE was signed in — any educator at any centre could read any
 * child (with payment hints), open or process any enrolment, message every
 * family at another centre, or record payments. Each test pins one door.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 59, resetIn: 60_000 })),
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "test-req-id",
}));
vi.mock("@/lib/notifications/messaging", () => ({
  sendBroadcastNotification: vi.fn(() => Promise.resolve()),
  sendNewMessageNotification: vi.fn(() => Promise.resolve()),
}));

import { GET as getChild } from "@/app/api/children/[id]/route";
import { GET as getEnrolment, PATCH as patchEnrolment } from "@/app/api/enrolments/[id]/route";
import { POST as broadcast } from "@/app/api/messaging/broadcasts/route";
import { GET as getConversation } from "@/app/api/messaging/conversations/[id]/route";
import { POST as recordPayment } from "@/app/api/billing/payments/route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
});

describe("children/[id]", () => {
  const child = {
    id: "c1",
    serviceId: "svc-1",
    enrolment: { id: "e1", token: "tok", paymentMethod: "bank_account", paymentDetails: { bsbLastThree: "123" }, primaryParent: {} },
  };

  it("refuses a child at another centre", async () => {
    mockSession({ id: "u1", name: "E", role: "staff", serviceId: "svc-2" });
    prismaMock.child.findUnique.mockResolvedValue(child);
    const res = await getChild(createRequest("GET", "/api/children/c1"), ctx("c1"));
    expect(res.status).toBe(403);
  });

  it("hides payment hints and the enrolment token from non-admins", async () => {
    mockSession({ id: "u1", name: "E", role: "staff", serviceId: "svc-1" });
    prismaMock.child.findUnique.mockResolvedValue(child);
    const res = await getChild(createRequest("GET", "/api/children/c1"), ctx("c1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enrolment.paymentDetails).toBeUndefined();
    expect(body.enrolment.token).toBeUndefined();
  });
});

describe("enrolments/[id]", () => {
  it("refuses educators entirely", async () => {
    mockSession({ id: "u1", name: "E", role: "staff", serviceId: "svc-1" });
    prismaMock.enrolmentSubmission.findUnique.mockResolvedValue({ id: "es1", serviceId: "svc-1" });
    const res = await getEnrolment(createRequest("GET", "/api/enrolments/es1"), ctx("es1"));
    expect(res.status).toBe(403);
  });

  it("refuses a coordinator processing another centre's enrolment", async () => {
    mockSession({ id: "u1", name: "C", role: "member", serviceId: "svc-2" });
    prismaMock.enrolmentSubmission.findUnique.mockResolvedValue({ serviceId: "svc-1" });
    const res = await patchEnrolment(
      createRequest("PATCH", "/api/enrolments/es1", { body: { status: "processed" } }),
      ctx("es1"),
    );
    expect(res.status).toBe(403);
    expect(prismaMock.enrolmentSubmission.update).not.toHaveBeenCalled();
  });

  it("keeps unplaced enrolments with the office", async () => {
    mockSession({ id: "u1", name: "C", role: "member", serviceId: "svc-1" });
    prismaMock.enrolmentSubmission.findUnique.mockResolvedValue({ id: "es1", serviceId: null });
    const res = await getEnrolment(createRequest("GET", "/api/enrolments/es1"), ctx("es1"));
    expect(res.status).toBe(403);
  });
});

describe("messaging", () => {
  it("refuses an educator broadcasting to every family", async () => {
    mockSession({ id: "u1", name: "E", role: "staff", serviceId: "svc-1" });
    const res = await broadcast(createRequest("POST", "/api/messaging/broadcasts", {
      body: { serviceId: "svc-1", subject: "Hi", body: "Hello" },
    }));
    expect(res.status).toBe(403);
  });

  it("refuses a coordinator broadcasting to another centre", async () => {
    mockSession({ id: "u1", name: "C", role: "member", serviceId: "svc-2" });
    const res = await broadcast(createRequest("POST", "/api/messaging/broadcasts", {
      body: { serviceId: "svc-1", subject: "Hi", body: "Hello" },
    }));
    expect(res.status).toBe(403);
  });

  it("refuses reading another centre's conversation", async () => {
    mockSession({ id: "u1", name: "E", role: "staff", serviceId: "svc-2" });
    prismaMock.conversation.findUnique.mockResolvedValue({ id: "cv1", serviceId: "svc-1", messages: [] });
    const res = await getConversation(createRequest("GET", "/api/messaging/conversations/cv1"), ctx("cv1"));
    expect(res.status).toBe(403);
    expect(prismaMock.message.updateMany).not.toHaveBeenCalled();
  });
});

describe("billing", () => {
  it("refuses a coordinator recording a payment", async () => {
    mockSession({ id: "u1", name: "C", role: "member", serviceId: "svc-1" });
    const res = await recordPayment(createRequest("POST", "/api/billing/payments", {
      body: { serviceId: "svc-1", contactId: "f1", amount: 10, method: "cash" },
    }));
    expect(res.status).toBe(403);
  });
});
