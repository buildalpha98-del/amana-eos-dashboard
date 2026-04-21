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

vi.mock("@/lib/document-indexer", () => ({
  indexDocument: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  generateRequestId: vi.fn(() => "test1234"),
}));

import { GET } from "@/app/api/documents/route";

describe("GET /api/documents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.document.findMany.mockResolvedValue([]);
    prismaMock.document.count.mockResolvedValue(0);
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("GET", "/api/documents");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("preserves text search when service-scoped staff filters by their own centreId", async () => {
    mockSession({
      id: "user-1",
      name: "Staff",
      role: "staff",
      serviceId: "svc-1",
    });

    const req = createRequest(
      "GET",
      "/api/documents?centreId=svc-1&search=safety",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);

    const callArgs = prismaMock.document.findMany.mock.calls[0][0];
    const where = callArgs.where;

    // The final where must constrain results by BOTH the search term and the centre.
    // Previously the code dropped the search clauses when staff filtered by centreId,
    // so "safety" never appeared anywhere in the query.
    const whereJson = JSON.stringify(where);
    expect(whereJson).toContain("safety");

    // The search should be expressed as an OR across title/description/tags,
    // combined (via AND) with the centre-scoping clause so both apply.
    const and = where.AND as Array<Record<string, unknown>> | undefined;
    expect(and).toBeDefined();
    const searchClause = and!.find((clause) => {
      const or = (clause as { OR?: Array<Record<string, unknown>> }).OR;
      return Array.isArray(or) && or.some((c) => "title" in c);
    }) as { OR: Array<Record<string, unknown>> } | undefined;
    expect(searchClause).toBeDefined();
    expect(searchClause!.OR).toHaveLength(3);
  });
});
