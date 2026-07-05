import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })
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

import { GET } from "@/app/api/search/route";

function makeRequest(q = "mira") {
  return createRequest("GET", `/api/search?q=${q}`);
}

function resetCommon() {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  for (const model of [
    "rock",
    "todo",
    "issue",
    "service",
    "project",
    "user",
    "child",
    "lead",
    "parentEnquiry",
  ] as const) {
    (prismaMock as never as Record<string, { findMany: ReturnType<typeof vi.fn> }>)[
      model
    ].findMany.mockResolvedValue([]);
  }
}

describe("GET /api/search — role scoping", () => {
  beforeEach(resetCommon);

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns [] for queries under 2 chars without touching the DB", async () => {
    mockSession({ id: "u-1", name: "Test", role: "owner" });
    const res = await GET(makeRequest("m"));
    expect(await res.json()).toEqual([]);
    expect(prismaMock.rock.findMany).not.toHaveBeenCalled();
  });

  it("admin searches everything including children, leads, and enquiries", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.child.findMany.mockResolvedValue([
      {
        id: "c-1",
        firstName: "Mira",
        surname: "Khan",
        status: "active",
        service: { name: "Greenacre" },
      },
    ]);
    prismaMock.user.findMany.mockResolvedValue([
      { id: "u-2", name: "Mirna", email: "mirna@amana.test", role: "member" },
    ]);

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(prismaMock.child.findMany).toHaveBeenCalled();
    expect(prismaMock.lead.findMany).toHaveBeenCalled();
    expect(prismaMock.parentEnquiry.findMany).toHaveBeenCalled();
    const child = body.find((r: { type: string }) => r.type === "child");
    expect(child.title).toBe("Mira Khan");
    // Admin sees emails in people subtitles.
    const person = body.find((r: { type: string }) => r.type === "person");
    expect(person.subtitle).toContain("mirna@amana.test");
  });

  it("member is scoped to their own service and gets no CRM", async () => {
    mockSession({
      id: "member-1",
      name: "Director",
      role: "member",
      serviceId: "svc-9",
    });
    await GET(makeRequest());

    expect(prismaMock.lead.findMany).not.toHaveBeenCalled();
    expect(prismaMock.parentEnquiry.findMany).not.toHaveBeenCalled();
    expect(prismaMock.child.findMany.mock.calls[0][0].where.serviceId).toBe("svc-9");
    expect(prismaMock.rock.findMany.mock.calls[0][0].where.serviceId).toBe("svc-9");
  });

  it("staff only search their own to-dos, no EOS/children/CRM, no emails", async () => {
    mockSession({ id: "staff-1", name: "Educator", role: "staff" });
    prismaMock.user.findMany.mockResolvedValue([
      { id: "u-2", name: "Mirna", email: "mirna@amana.test", role: "member" },
    ]);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(prismaMock.rock.findMany).not.toHaveBeenCalled();
    expect(prismaMock.issue.findMany).not.toHaveBeenCalled();
    expect(prismaMock.child.findMany).not.toHaveBeenCalled();
    expect(prismaMock.lead.findMany).not.toHaveBeenCalled();
    expect(prismaMock.todo.findMany.mock.calls[0][0].where.assigneeId).toBe("staff-1");
    // Email is masked for non-admin viewers, matching the directory.
    const person = body.find((r: { type: string }) => r.type === "person");
    expect(person.subtitle).not.toContain("@");
  });

  it("marketing gets CRM but no children", async () => {
    mockSession({ id: "mkt-1", name: "Akram", role: "marketing" });
    await GET(makeRequest());
    expect(prismaMock.lead.findMany).toHaveBeenCalled();
    expect(prismaMock.parentEnquiry.findMany).toHaveBeenCalled();
    expect(prismaMock.child.findMany).not.toHaveBeenCalled();
  });
});
