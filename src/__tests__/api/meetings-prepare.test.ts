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

const generateStructuredMock = vi.fn();
vi.mock("@/lib/ai-provider", () => ({
  generateStructured: (...args: unknown[]) => generateStructuredMock(...args),
}));

import { POST } from "@/app/api/meetings/[id]/prepare/route";

function makeRequest(id = "m-1") {
  return createRequest("POST", `/api/meetings/${id}/prepare`, { body: {} });
}

function ctx(id = "m-1") {
  return { params: Promise.resolve({ id }) };
}

function resetCommon() {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.issue.findMany.mockResolvedValue([]);
  prismaMock.rock.findMany.mockResolvedValue([]);
  prismaMock.measurable.findMany.mockResolvedValue([]);
  prismaMock.meeting.update.mockResolvedValue({});
}

describe("POST /api/meetings/[id]/prepare", () => {
  beforeEach(resetCommon);

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await POST(makeRequest(), ctx());
    expect(res.status).toBe(401);
  });

  it("returns 404 for an unknown meeting", async () => {
    mockSession({ id: "u-1", name: "Test", role: "owner" });
    prismaMock.meeting.findUnique.mockResolvedValue(null);
    const res = await POST(makeRequest(), ctx());
    expect(res.status).toBe(404);
  });

  it("returns 409 for a completed meeting", async () => {
    mockSession({ id: "u-1", name: "Test", role: "owner" });
    prismaMock.meeting.findUnique.mockResolvedValue({
      id: "m-1",
      title: "L10",
      status: "completed",
      serviceIds: [],
      rockIds: [],
    });
    const res = await POST(makeRequest(), ctx());
    expect(res.status).toBe(409);
  });

  it("drafts, filters hallucinated ids, and persists on the meeting", async () => {
    mockSession({ id: "u-1", name: "Test", role: "owner" });
    prismaMock.meeting.findUnique.mockResolvedValue({
      id: "m-1",
      title: "Leadership L10",
      status: "scheduled",
      serviceIds: ["svc-1"],
      rockIds: [],
    });
    prismaMock.issue.findMany.mockResolvedValue([
      {
        id: "i-real",
        title: "Ratio breach pattern",
        description: null,
        priority: "high",
        createdAt: new Date("2026-06-20"),
        owner: { name: "Tracie" },
      },
    ]);
    generateStructuredMock.mockResolvedValue({
      data: {
        summary: "Tight agenda today.",
        idsOrder: [
          { issueId: "i-real", title: "Ratio breach pattern", reason: "Compliance risk" },
          { issueId: "i-hallucinated", title: "Made up", reason: "n/a" },
        ],
        scorecardCommentary: "",
        rockSuggestions: [],
      },
    });

    const res = await POST(makeRequest(), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    // The hallucinated id was dropped before persisting.
    expect(body.draft.idsOrder).toHaveLength(1);
    expect(body.draft.idsOrder[0].issueId).toBe("i-real");

    const update = prismaMock.meeting.update.mock.calls[0][0];
    expect(update.where.id).toBe("m-1");
    expect(update.data.aiAgendaDraft.summary).toBe("Tight agenda today.");
    expect(update.data.aiAgendaDraftAt).toBeInstanceOf(Date);

    // Issue query was scoped to the meeting's services.
    const issueCall = prismaMock.issue.findMany.mock.calls[0][0];
    expect(issueCall.where.serviceId).toEqual({ in: ["svc-1"] });
  });
});
