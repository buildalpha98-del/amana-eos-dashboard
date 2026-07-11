/**
 * Quiz-question admin CRUD + module-progress endpoint.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 59, resetIn: 60_000 })),
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "test-req-id",
}));

import { GET, POST } from "@/app/api/lms/quiz-questions/route";
import { POST as PROGRESS_POST } from "@/app/api/lms/module-progress/route";

function baseMocks() {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockImplementation((args: unknown) => {
    const { select } = args as { select?: Record<string, boolean> };
    if (select && "active" in select) return Promise.resolve({ active: true });
    if (select && "inductionStatus" in select)
      return Promise.resolve({ inductionStatus: "cleared", inductionGraceUntil: null });
    return Promise.resolve({ active: true });
  });
}
beforeEach(baseMocks);

describe("quiz-questions CRUD", () => {
  const valid = {
    moduleId: "m1",
    question: "Q?",
    options: ["a", "b", "c"],
    correctIndex: 1,
  };

  it("401 when unauthenticated", async () => {
    mockNoSession();
    const res = await POST(createRequest("POST", "/api/lms/quiz-questions", { body: valid }));
    expect(res.status).toBe(401);
  });

  it("403 for a non-admin role (staff)", async () => {
    mockSession({ id: "s1", name: "Staff", role: "staff" });
    const res = await POST(createRequest("POST", "/api/lms/quiz-questions", { body: valid }));
    expect(res.status).toBe(403);
  });

  it("400 when correctIndex is out of range", async () => {
    mockSession({ id: "a1", name: "Admin", role: "admin" });
    const res = await POST(
      createRequest("POST", "/api/lms/quiz-questions", {
        body: { ...valid, correctIndex: 9 },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("201 on happy path", async () => {
    mockSession({ id: "a1", name: "Admin", role: "admin" });
    prismaMock.lMSQuizQuestion.create.mockResolvedValue({ id: "qq1", ...valid });
    const res = await POST(createRequest("POST", "/api/lms/quiz-questions", { body: valid }));
    expect(res.status).toBe(201);
  });

  it("GET lists questions for a module (admin)", async () => {
    mockSession({ id: "a1", name: "Admin", role: "admin" });
    prismaMock.lMSQuizQuestion.findMany.mockResolvedValue([{ id: "qq1", ...valid }]);
    const res = await GET(createRequest("GET", "/api/lms/quiz-questions?moduleId=m1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });
});

describe("module-progress endpoint", () => {
  it("403 when the enrollment belongs to someone else", async () => {
    mockSession({ id: "u1", name: "U", role: "staff" });
    prismaMock.lMSEnrollment.findUnique.mockResolvedValue({
      id: "e1", userId: "other", startedAt: null,
    });
    const res = await PROGRESS_POST(
      createRequest("POST", "/api/lms/module-progress", {
        body: { enrollmentId: "e1", moduleId: "m1", completed: true },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("completes a module for the owner and recomputes status", async () => {
    mockSession({ id: "u1", name: "U", role: "staff" });
    prismaMock.lMSEnrollment.findUnique
      .mockResolvedValueOnce({ id: "e1", userId: "u1", startedAt: null }) // ownership
      .mockResolvedValueOnce({
        id: "e1", startedAt: null,
        course: { modules: [{ id: "m1" }] },
        moduleProgress: [{ moduleId: "m1", completed: true }],
      });
    const res = await PROGRESS_POST(
      createRequest("POST", "/api/lms/module-progress", {
        body: { enrollmentId: "e1", moduleId: "m1", completed: true, timeSpent: 120 },
      }),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.lMSModuleProgress.upsert).toHaveBeenCalled();
    // enrollment.update called to flip status to completed.
    expect(prismaMock.lMSEnrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "completed" }) }),
    );
  });
});
