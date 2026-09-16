/**
 * POST/GET /api/recruitment/candidates/[id]/interviews.
 *
 * 2026-09-16. `interviewNotes` was one text box, so a second interview
 * overwrote the first and nothing said when it happened or who was there.
 * Each interview is now a row.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "test-req-id",
}));

import { GET, POST } from "@/app/api/recruitment/candidates/[id]/interviews/route";

const params = { params: Promise.resolve({ id: "c-1" }) };

function post(body: Record<string, unknown>) {
  return POST(
    createRequest("POST", "/api/recruitment/candidates/c-1/interviews", { body }),
    params,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.recruitmentCandidate.findUnique.mockResolvedValue({ id: "c-1" });
  prismaMock.candidateInterview.create.mockResolvedValue({ id: "i-1" });
  prismaMock.candidateInterview.findMany.mockResolvedValue([]);
  prismaMock.recruitmentCandidate.update.mockResolvedValue({ id: "c-1" });
  mockSession({ id: "hq-1", name: "State Manager", role: "head_office" });
});

describe("GET interviews", () => {
  it("requires authentication", async () => {
    mockNoSession();
    const res = await GET(
      createRequest("GET", "/api/recruitment/candidates/c-1/interviews"),
      params,
    );
    expect(res.status).toBe(401);
  });

  it("returns most recent first", async () => {
    await GET(
      createRequest("GET", "/api/recruitment/candidates/c-1/interviews"),
      params,
    );
    const call = prismaMock.candidateInterview.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ candidateId: "c-1" });
    expect(call.orderBy).toEqual({ heldAt: "desc" });
  });
});

describe("POST interview", () => {
  it("records one against the candidate", async () => {
    const res = await post({
      heldAt: "2026-09-10",
      mode: "in_person",
      notes: "Warm, good with the older kids. Can start after the holidays.",
      outcome: "progress",
    });
    expect(res.status).toBe(201);
    const data = prismaMock.candidateInterview.create.mock.calls[0][0].data;
    expect(data.candidateId).toBe("c-1");
    expect(data.notes).toMatch(/older kids/);
    expect(data.outcome).toBe("progress");
  });

  it("attributes it to whoever logged it when no interviewer is named", async () => {
    await post({ heldAt: "2026-09-10", notes: "Phone screen went well." });
    const data = prismaMock.candidateInterview.create.mock.calls[0][0].data;
    expect(data.conductedById).toBe("hq-1");
    expect(data.createdById).toBe("hq-1");
  });

  it("restarts the contact clock — an interview IS contact", async () => {
    await post({ heldAt: "2026-09-10", notes: "Met at the centre." });
    const update = prismaMock.recruitmentCandidate.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: "c-1" });
    expect(update.data.lastContactedAt).toBeInstanceOf(Date);
  });

  it("requires notes — an interview with no notes records nothing useful", async () => {
    const res = await post({ heldAt: "2026-09-10", notes: "   " });
    expect(res.status).toBe(400);
    expect(prismaMock.candidateInterview.create).not.toHaveBeenCalled();
  });

  it("rejects an unknown outcome", async () => {
    const res = await post({
      heldAt: "2026-09-10",
      notes: "Fine.",
      outcome: "maybe-ish",
    });
    expect(res.status).toBe(400);
  });

  it("404s for a candidate that doesn't exist, rather than a FK error", async () => {
    prismaMock.recruitmentCandidate.findUnique.mockResolvedValue(null);
    const res = await post({ heldAt: "2026-09-10", notes: "Met them." });
    expect(res.status).toBe(404);
    expect(prismaMock.candidateInterview.create).not.toHaveBeenCalled();
  });
});
