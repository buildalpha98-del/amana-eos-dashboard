import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "test-req-id",
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

vi.mock("@/lib/document-indexer", () => ({
  indexDocument: vi.fn(() => Promise.resolve()),
}));

import { GET, POST } from "@/app/api/documents/route";
import { PATCH } from "@/app/api/documents/[id]/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

describe("GET /api/documents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const res = await GET(createRequest("GET", "/api/documents"));
    expect(res.status).toBe(401);
  });

  it("returns all docs for admin (no scoping)", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.document.findMany.mockResolvedValue([
      { id: "d-1", title: "A", centreId: "svc-1", allServices: false },
      { id: "d-2", title: "B", centreId: null, allServices: false },
    ]);
    prismaMock.document.count.mockResolvedValue(2);

    const res = await GET(createRequest("GET", "/api/documents"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.documents).toHaveLength(2);
  });

  it("for staff: findMany where clause includes {allServices: true} in its OR branch", async () => {
    mockSession({ id: "u-1", name: "Staff", role: "staff", serviceId: "svc-1" });
    prismaMock.document.findMany.mockResolvedValue([
      { id: "d-1", title: "Own", centreId: "svc-1", allServices: false },
      { id: "d-2", title: "Org-wide flagged", centreId: "svc-99", allServices: true },
    ]);
    prismaMock.document.count.mockResolvedValue(2);

    const res = await GET(createRequest("GET", "/api/documents"));
    expect(res.status).toBe(200);

    // Tight assertion: the OR array must contain the allServices branch
    const callArgs = prismaMock.document.findMany.mock.calls[0][0];
    expect(callArgs.where.OR).toEqual(
      expect.arrayContaining([{ allServices: true }]),
    );
    // And the scoped branch
    expect(callArgs.where.OR).toEqual(
      expect.arrayContaining([{ centreId: "svc-1" }, { centreId: null }]),
    );
  });

  it("for staff filtering by centreId: unions that centre with allServices=true", async () => {
    mockSession({ id: "u-1", name: "Staff", role: "staff", serviceId: "svc-1" });
    prismaMock.document.findMany.mockResolvedValue([]);
    prismaMock.document.count.mockResolvedValue(0);

    const res = await GET(createRequest("GET", "/api/documents?centreId=svc-1"));
    expect(res.status).toBe(200);

    const callArgs = prismaMock.document.findMany.mock.calls[0][0];
    expect(callArgs.where.OR).toEqual(
      expect.arrayContaining([{ centreId: "svc-1" }, { allServices: true }]),
    );
  });

  it("preserves text search when staff filters by their own centreId", async () => {
    mockSession({ id: "u-1", name: "Staff", role: "staff", serviceId: "svc-1" });
    prismaMock.document.findMany.mockResolvedValue([]);
    prismaMock.document.count.mockResolvedValue(0);

    const res = await GET(
      createRequest("GET", "/api/documents?centreId=svc-1&search=safety"),
    );
    expect(res.status).toBe(200);

    const callArgs = prismaMock.document.findMany.mock.calls[0][0];
    const where = callArgs.where as Record<string, unknown>;

    // The final where must constrain by BOTH the search term and the centre
    // scope. The old code overwrote where.OR with the centre scope alone, so
    // "safety" disappeared from the query entirely.
    expect(JSON.stringify(where)).toContain("safety");

    const and = where.AND as Array<Record<string, unknown>> | undefined;
    expect(and).toBeDefined();
    expect(and).toEqual(
      expect.arrayContaining([
        { OR: [{ centreId: "svc-1" }, { allServices: true }] },
      ]),
    );
    const searchClause = and!.find((c) => {
      const or = (c as { OR?: Array<Record<string, unknown>> }).OR;
      return Array.isArray(or) && or.some((x) => "title" in x);
    }) as { OR: Array<Record<string, unknown>> } | undefined;
    expect(searchClause).toBeDefined();
    expect(searchClause!.OR).toHaveLength(3);
  });
});

describe("POST /api/documents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const res = await POST(
      createRequest("POST", "/api/documents", {
        body: { title: "X", fileName: "x.pdf", fileUrl: "https://blob/x.pdf" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("creates a doc with allServices=true and null centreId", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.document.create.mockResolvedValue({
      id: "d-new",
      title: "Org Policy",
      allServices: true,
      centreId: null,
    });

    const res = await POST(
      createRequest("POST", "/api/documents", {
        body: {
          title: "Org Policy",
          fileName: "policy.pdf",
          fileUrl: "https://blob/policy.pdf",
          allServices: true,
          centreId: null,
        },
      }),
    );
    expect(res.status).toBe(201);
    const createCall = prismaMock.document.create.mock.calls[0][0];
    expect(createCall.data.allServices).toBe(true);
  });

  it("defaults allServices to false when omitted", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.document.create.mockResolvedValue({
      id: "d-new",
      title: "Service Doc",
      allServices: false,
      centreId: "svc-1",
    });

    const res = await POST(
      createRequest("POST", "/api/documents", {
        body: {
          title: "Service Doc",
          fileName: "doc.pdf",
          fileUrl: "https://blob/doc.pdf",
          centreId: "svc-1",
        },
      }),
    );
    expect(res.status).toBe(201);
    const createCall = prismaMock.document.create.mock.calls[0][0];
    expect(createCall.data.allServices).toBe(false);
  });

  it("coerces centreId to null when allServices=true is set alongside centreId", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.document.create.mockResolvedValue({
      id: "d-new",
      title: "Mixed",
      allServices: true,
      centreId: null,
    });

    await POST(
      createRequest("POST", "/api/documents", {
        body: {
          title: "Mixed",
          fileName: "x.pdf",
          fileUrl: "https://blob/x.pdf",
          centreId: "svc-1",
          allServices: true,
        },
      }),
    );

    const createCall = prismaMock.document.create.mock.calls[0][0];
    expect(createCall.data.allServices).toBe(true);
    expect(createCall.data.centreId).toBeNull();
  });
});

describe("PATCH /api/documents/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("allows admin to toggle allServices", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.document.findUnique.mockResolvedValue({ id: "d-1", uploadedById: "admin-1" });
    prismaMock.document.update.mockResolvedValue({ id: "d-1", allServices: true });

    const req = createRequest("PATCH", "/api/documents/d-1", {
      body: { allServices: true },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "d-1" }) });
    expect(res.status).toBe(200);
    const updateCall = prismaMock.document.update.mock.calls[0][0];
    expect(updateCall.data.allServices).toBe(true);
  });

  it("PATCH with allServices=true AND centreId clears the centre (disconnect)", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.document.update.mockResolvedValue({ id: "d-1", allServices: true, centreId: null });

    const req = createRequest("PATCH", "/api/documents/d-1", {
      body: { allServices: true, centreId: "svc-1" },
    });
    await PATCH(req, { params: Promise.resolve({ id: "d-1" }) });

    const updateCall = prismaMock.document.update.mock.calls[0][0];
    expect(updateCall.data.allServices).toBe(true);
    expect(updateCall.data.centre).toEqual({ disconnect: true });
  });
});
