import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => ({ limited: false })) }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "test-req-id",
}));

import { GET } from "@/app/api/documents/review/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

describe("GET /api/documents/review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it.each(["staff", "member", "marketing"])("403s for %s", async (role) => {
    mockSession({ id: "u", name: "X", role: role as never, serviceId: "svc-1" });
    const res = await GET(createRequest("GET", "/api/documents/review"));
    expect(res.status).toBe(403);
  });

  it("lists loose documents, personal-looking first, with a suggested owner", async () => {
    mockSession({ id: "a", name: "Admin", role: "admin" });
    prismaMock.document.findMany.mockResolvedValue([
      { id: "d1", title: "Sun safety", fileName: "sun.pdf", category: "policy", createdAt: new Date() },
      { id: "d2", title: "Akram contract", fileName: "c.pdf", category: "other", createdAt: new Date() },
    ]);
    prismaMock.user.findMany.mockResolvedValue([{ id: "u-akram", name: "Akram Haddad" }]);

    const res = await GET(createRequest("GET", "/api/documents/review"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.documents.map((d: { id: string }) => d.id)).toEqual(["d2", "d1"]);
    expect(body.documents[0].suggestedAssignee.id).toBe("u-akram");

    const where = prismaMock.document.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ centreId: null, allServices: false, assignedToId: null, deleted: false });
  });
});
