import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

// Mock rate-limit
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "test-req-id",
}));

// Mock billing notification and PDF modules
vi.mock("@/lib/notifications/billing", () => ({
  sendStatementIssuedNotification: vi.fn(),
  sendPaymentReceivedNotification: vi.fn(),
  sendOverdueStatementNotification: vi.fn(),
}));
vi.mock("@/lib/billing/statement-pdf", () => ({
  generateStatementPdf: vi.fn().mockResolvedValue("https://blob.example.com/test.pdf"),
}));

import { POST } from "@/app/api/billing/payments/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const validPaymentBody = {
  contactId: "contact-1",
  serviceId: "svc-1",
  amount: 50,
  method: "bank_transfer" as const,
  reference: "TXN-001",
};

describe("POST /api/billing/payments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("POST", "/api/billing/payments", { body: validPaymentBody });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 with invalid body (missing amount, invalid method)", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    const req = createRequest("POST", "/api/billing/payments", {
      body: { contactId: "contact-1", serviceId: "svc-1", method: "crypto" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Validation failed");
  });

  it("returns 201 with valid payment data (with statementId, recalculates balance)", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });

    const paymentWithStatement = { ...validPaymentBody, statementId: "stmt-1" };

    // Statement lookup for verification
    prismaMock.statement.findUnique.mockResolvedValue({ id: "stmt-1", contactId: "contact-1" });

    // Transaction mock
    prismaMock.$transaction.mockImplementation(async (fn: unknown) => {
      if (typeof fn === "function") return fn(prismaMock);
      return Promise.all(fn as Promise<unknown>[]);
    });

    prismaMock.payment.create.mockResolvedValue({
      id: "pay-1",
      statementId: "stmt-1",
      contactId: "contact-1",
      serviceId: "svc-1",
      amount: 50,
      method: "bank_transfer",
      reference: "TXN-001",
      receivedAt: new Date(),
      recordedById: "user-1",
      notes: null,
    });
    prismaMock.payment.aggregate.mockResolvedValue({ _sum: { amount: 50 } });
    prismaMock.statement.findUniqueOrThrow.mockResolvedValue({ id: "stmt-1", gapFee: 100 });
    prismaMock.statement.update.mockResolvedValue({
      id: "stmt-1",
      amountPaid: 50,
      balance: 50,
      status: "issued",
    });

    // Re-fetch after transaction
    prismaMock.payment.findUniqueOrThrow.mockResolvedValue({
      id: "pay-1",
      amount: 50,
      method: "bank_transfer",
      reference: "TXN-001",
      statement: { id: "stmt-1", balance: 50, status: "issued" },
      contact: { id: "contact-1", firstName: "Jane", lastName: "Doe" },
      service: { id: "svc-1", name: "Amana OSHC" },
    });

    const req = createRequest("POST", "/api/billing/payments", { body: paymentWithStatement });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("pay-1");
    expect(body.statement.balance).toBe(50);

    // Verify balance recalculation happened
    expect(prismaMock.payment.aggregate).toHaveBeenCalled();
    expect(prismaMock.statement.update).toHaveBeenCalled();
  });

  it("returns 201 for payment without statementId (unlinked)", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });

    prismaMock.$transaction.mockImplementation(async (fn: unknown) => {
      if (typeof fn === "function") return fn(prismaMock);
      return Promise.all(fn as Promise<unknown>[]);
    });

    prismaMock.payment.create.mockResolvedValue({
      id: "pay-2",
      statementId: null,
      contactId: "contact-1",
      serviceId: "svc-1",
      amount: 25,
      method: "cash",
      reference: null,
      receivedAt: new Date(),
      recordedById: "user-1",
      notes: null,
    });

    prismaMock.payment.findUniqueOrThrow.mockResolvedValue({
      id: "pay-2",
      amount: 25,
      method: "cash",
      statement: null,
      contact: { id: "contact-1", firstName: "Jane", lastName: "Doe" },
      service: { id: "svc-1", name: "Amana OSHC" },
    });

    const req = createRequest("POST", "/api/billing/payments", {
      body: { contactId: "contact-1", serviceId: "svc-1", amount: 25, method: "cash" },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("pay-2");
    expect(body.statement).toBeNull();

    // Verify no aggregate/update was called (no statement balance to recalculate)
    expect(prismaMock.payment.aggregate).not.toHaveBeenCalled();
    expect(prismaMock.statement.update).not.toHaveBeenCalled();
  });
});
