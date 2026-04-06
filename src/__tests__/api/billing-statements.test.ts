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

import { GET, POST } from "@/app/api/billing/statements/route";
import { POST as ISSUE } from "@/app/api/billing/statements/[id]/issue/route";
import { POST as VOID } from "@/app/api/billing/statements/[id]/void/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const validLineItem = {
  childId: "child-1",
  date: "2026-03-01",
  sessionType: "bsc",
  description: "Before school care",
  grossFee: 30,
  ccsHours: 10,
  ccsRate: 1.2,
  ccsAmount: 12,
  gapAmount: 18,
};

const validCreateBody = {
  contactId: "contact-1",
  serviceId: "svc-1",
  periodStart: "2026-03-01",
  periodEnd: "2026-03-31",
  lineItems: [validLineItem],
};

/* ------------------------------------------------------------------ */
/*  GET /api/billing/statements                                       */
/* ------------------------------------------------------------------ */

describe("GET /api/billing/statements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("GET", "/api/billing/statements");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 200 with statements array when authenticated", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.$transaction.mockResolvedValue([
      [
        {
          id: "stmt-1",
          contactId: "contact-1",
          serviceId: "svc-1",
          status: "draft",
          periodStart: new Date("2026-03-01"),
          periodEnd: new Date("2026-03-31"),
          totalFees: 30,
          totalCcs: 12,
          gapFee: 18,
          balance: 18,
          contact: { id: "contact-1", firstName: "Jane", lastName: "Doe", email: "jane@test.com" },
          service: { id: "svc-1", name: "Amana OSHC" },
          _count: { lineItems: 1, payments: 0 },
        },
      ],
      1,
    ]);

    const req = createRequest("GET", "/api/billing/statements");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.statements).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.statements[0].id).toBe("stmt-1");
  });
});

/* ------------------------------------------------------------------ */
/*  POST /api/billing/statements                                      */
/* ------------------------------------------------------------------ */

describe("POST /api/billing/statements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("POST", "/api/billing/statements", { body: validCreateBody });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 with invalid body (missing required fields)", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    const req = createRequest("POST", "/api/billing/statements", {
      body: { contactId: "contact-1" }, // missing serviceId, periodStart, periodEnd, lineItems
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Validation failed");
  });

  it("returns 409 when duplicate non-void statement exists for same period", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.statement.findFirst.mockResolvedValue({ id: "existing-stmt" });

    const req = createRequest("POST", "/api/billing/statements", { body: validCreateBody });
    const res = await POST(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("already exists");
  });

  it("returns 201 with valid body, creates statement + line items via $transaction", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });

    prismaMock.statement.findFirst.mockResolvedValue(null); // no duplicate

    const createdStatement = {
      id: "stmt-1",
      contactId: "contact-1",
      serviceId: "svc-1",
      periodStart: new Date("2026-03-01"),
      periodEnd: new Date("2026-03-31"),
      totalFees: 30,
      totalCcs: 12,
      gapFee: 18,
      balance: 18,
      status: "draft",
      contact: { id: "contact-1", firstName: "Jane", lastName: "Doe", email: "jane@test.com" },
      service: { id: "svc-1", name: "Amana OSHC" },
      lineItems: [{ id: "li-1", ...validLineItem }],
    };

    // The POST route calls prisma.$transaction(async (tx) => { ... })
    prismaMock.$transaction.mockImplementation(async (fn: unknown) => {
      if (typeof fn === "function") return fn(prismaMock);
      return Promise.all(fn as Promise<unknown>[]);
    });
    prismaMock.statement.create.mockResolvedValue(createdStatement);

    const req = createRequest("POST", "/api/billing/statements", { body: validCreateBody });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("stmt-1");
    expect(body.gapFee).toBe(18);
    expect(body.lineItems).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
/*  POST /api/billing/statements/[id]/issue                           */
/* ------------------------------------------------------------------ */

describe("POST /api/billing/statements/[id]/issue", () => {
  const context = { params: Promise.resolve({ id: "stmt-1" }) };

  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 404 when statement not found", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.statement.findUnique.mockResolvedValue(null);

    const req = createRequest("POST", "/api/billing/statements/stmt-1/issue");
    const res = await ISSUE(req, context);
    expect(res.status).toBe(404);
  });

  it("returns 400 when statement is not draft", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.statement.findUnique.mockResolvedValue({ id: "stmt-1", status: "issued" });

    const req = createRequest("POST", "/api/billing/statements/stmt-1/issue");
    const res = await ISSUE(req, context);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("draft");
  });

  it("returns 200 and updates to issued status", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.statement.findUnique.mockResolvedValue({ id: "stmt-1", status: "draft" });
    prismaMock.statement.update.mockResolvedValue({
      id: "stmt-1",
      status: "issued",
      issuedAt: new Date(),
      contact: { id: "contact-1", firstName: "Jane", lastName: "Doe", email: "jane@test.com" },
      service: { id: "svc-1", name: "Amana OSHC" },
    });

    const req = createRequest("POST", "/api/billing/statements/stmt-1/issue");
    const res = await ISSUE(req, context);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("issued");
  });
});

/* ------------------------------------------------------------------ */
/*  POST /api/billing/statements/[id]/void                            */
/* ------------------------------------------------------------------ */

describe("POST /api/billing/statements/[id]/void", () => {
  const context = { params: Promise.resolve({ id: "stmt-1" }) };

  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 404 when statement not found", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.statement.findUnique.mockResolvedValue(null);

    const req = createRequest("POST", "/api/billing/statements/stmt-1/void");
    const res = await VOID(req, context);
    expect(res.status).toBe(404);
  });

  it("returns 400 when statement is paid", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.statement.findUnique.mockResolvedValue({ id: "stmt-1", status: "paid" });

    const req = createRequest("POST", "/api/billing/statements/stmt-1/void");
    const res = await VOID(req, context);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("draft or issued");
  });

  it("returns 200 for draft statement", async () => {
    mockSession({ id: "user-1", name: "Test", role: "admin" });
    prismaMock.statement.findUnique.mockResolvedValue({ id: "stmt-1", status: "draft" });
    prismaMock.statement.update.mockResolvedValue({
      id: "stmt-1",
      status: "void",
      contact: { id: "contact-1", firstName: "Jane", lastName: "Doe", email: "jane@test.com" },
      service: { id: "svc-1", name: "Amana OSHC" },
    });

    const req = createRequest("POST", "/api/billing/statements/stmt-1/void");
    const res = await VOID(req, context);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("void");
  });
});
