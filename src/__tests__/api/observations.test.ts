import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/service-scope", () => ({
  getServiceScope: vi.fn(() => null),
  getStateScope: vi.fn(() => null),
}));
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

import { _clearUserActiveCache } from "@/lib/server-auth";
import { GET, POST } from "@/app/api/services/[id]/observations/route";

async function ctx(id = "s1") {
  return { params: Promise.resolve({ id }) };
}

describe("observations API (staff)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("GET 401 without session", async () => {
    mockNoSession();
    const res = await GET(
      createRequest("GET", "/api/services/s1/observations"),
      await ctx(),
    );
    expect(res.status).toBe(401);
  });

  it("GET 403 cross-service coordinator", async () => {
    mockSession({
      id: "u1",
      name: "C",
      role: "member",
      serviceId: "other",
    });
    const res = await GET(
      createRequest("GET", "/api/services/s1/observations"),
      await ctx(),
    );
    expect(res.status).toBe(403);
  });

  it("GET filters by mtop and childId", async () => {
    mockSession({ id: "u1", name: "C", role: "member", serviceId: "s1" });
    prismaMock.learningObservation.findMany.mockResolvedValue([
      {
        id: "o1",
        title: "Lego play",
        mtopOutcomes: ["Learners"],
        createdAt: new Date(),
        author: { id: "u1", name: "C", avatar: null },
        child: { id: "c1", firstName: "Mia", surname: "K" },
      },
    ]);
    const res = await GET(
      createRequest(
        "GET",
        "/api/services/s1/observations?mtop=Learners&childId=c1",
      ),
      await ctx(),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.learningObservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          serviceId: "s1",
          mtopOutcomes: { has: "Learners" },
          childId: "c1",
        }),
      }),
    );
  });

  it("POST 400 on invalid body", async () => {
    mockSession({ id: "u1", name: "C", role: "member", serviceId: "s1" });
    const res = await POST(
      createRequest("POST", "/api/services/s1/observations", {
        body: { title: "", narrative: "" },
      }),
      await ctx(),
    );
    expect(res.status).toBe(400);
  });

  it("POST rejects child not in service", async () => {
    mockSession({ id: "u1", name: "C", role: "member", serviceId: "s1" });
    prismaMock.child.findFirst.mockResolvedValue(null);
    const res = await POST(
      createRequest("POST", "/api/services/s1/observations", {
        body: {
          childId: "cjabcdefghijklmnopqrstuvw",
          title: "t",
          narrative: "n",
        },
      }),
      await ctx(),
    );
    expect(res.status).toBe(400);
  });

  it("POST creates an observation when child is in service", async () => {
    mockSession({ id: "u1", name: "C", role: "member", serviceId: "s1" });
    prismaMock.child.findFirst.mockResolvedValue({ id: "c1" });
    prismaMock.learningObservation.create.mockResolvedValue({
      id: "o1",
      title: "Block play",
      author: { id: "u1", name: "C", avatar: null },
      child: { id: "c1", firstName: "Mia", surname: "K" },
    });
    prismaMock.activityLog.create.mockResolvedValue({});

    const res = await POST(
      createRequest("POST", "/api/services/s1/observations", {
        body: {
          childId: "cjabcdefghijklmnopqrstuvw",
          title: "Block play",
          narrative: "Mia stacked 8 blocks.",
          mtopOutcomes: ["Learners", "Communicators"],
          visibleToParent: true,
        },
      }),
      await ctx(),
    );
    expect(res.status).toBe(201);
  });

  it("POST dedupes by clientMutationId", async () => {
    mockSession({ id: "u1", name: "C", role: "member", serviceId: "s1" });
    const cmid = "550e8400-e29b-41d4-a716-446655440000";
    prismaMock.learningObservation.findUnique.mockResolvedValue({
      id: "o-existing",
      clientMutationId: cmid,
      title: "Existing",
      author: { id: "u1", name: "C", avatar: null },
      child: { id: "c1", firstName: "Mia", surname: "K" },
    });
    const res = await POST(
      createRequest("POST", "/api/services/s1/observations", {
        body: {
          childId: "cjabcdefghijklmnopqrstuvw",
          title: "Replay",
          narrative: "n",
          clientMutationId: cmid,
        },
      }),
      await ctx(),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.learningObservation.create).not.toHaveBeenCalled();
  });
});
