/**
 * Quiz attempt API — start (GET) and submit (POST).
 *
 * Verifies: shuffled questions carry no correct answers; a passing submission
 * completes the module; a failing one does not; non-enrolled users are blocked;
 * a resubmitted attempt 409s.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";
import { deriveSeed, permutationFor } from "@/lib/quiz";

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

import { GET, POST } from "@/app/api/lms/modules/[moduleId]/quiz/route";

const paramsOf = (id: string) => ({ params: Promise.resolve({ moduleId: id }) });

const QUESTION = {
  id: "q1",
  question: "Where do you sign children in on OWNA?",
  options: ["The roll", "The kiosk", "Nowhere"],
  correctIndex: 1,
  explanation: "Use the kiosk.",
};

// The display position (what the learner clicks) that maps to the correct option.
function correctDisplayPos(enrollmentId: string, moduleId: string, attemptNumber: number) {
  const seed = deriveSeed(enrollmentId, moduleId, attemptNumber, QUESTION.id);
  const perm = permutationFor(QUESTION.options.length, seed);
  return perm.indexOf(QUESTION.correctIndex);
}

function baseMocks() {
  _clearUserActiveCache();
  vi.clearAllMocks();
  // server-auth active check + induction status reads (default cleared).
  prismaMock.user.findUnique.mockImplementation((args: unknown) => {
    const { select } = args as { select?: Record<string, boolean> };
    if (select && "active" in select) return Promise.resolve({ active: true });
    if (select && "inductionStatus" in select)
      return Promise.resolve({ inductionStatus: "cleared", inductionGraceUntil: null });
    return Promise.resolve({ active: true });
  });
  prismaMock.lMSModule.findUnique.mockResolvedValue({ id: "m1", courseId: "c1", type: "quiz" });
  prismaMock.lMSEnrollment.findUnique.mockResolvedValue({ id: "e1" });
  prismaMock.lMSQuizQuestion.findMany.mockResolvedValue([QUESTION]);
}

beforeEach(baseMocks);

describe("GET /api/lms/modules/[id]/quiz (start attempt)", () => {
  it("401 when unauthenticated", async () => {
    mockNoSession();
    const res = await GET(createRequest("GET", "/api/lms/modules/m1/quiz"), paramsOf("m1"));
    expect(res.status).toBe(401);
  });

  it("403 when the user is not enrolled", async () => {
    mockSession({ id: "u1", name: "New", role: "staff" });
    prismaMock.lMSEnrollment.findUnique.mockResolvedValue(null);
    const res = await GET(createRequest("GET", "/api/lms/modules/m1/quiz"), paramsOf("m1"));
    expect(res.status).toBe(403);
  });

  it("returns shuffled questions with NO correct answers", async () => {
    mockSession({ id: "u1", name: "New", role: "staff" });
    prismaMock.lMSQuizAttempt.count.mockResolvedValue(0);
    prismaMock.lMSQuizAttempt.create.mockResolvedValue({ id: "a1" });

    const res = await GET(createRequest("GET", "/api/lms/modules/m1/quiz"), paramsOf("m1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.attemptId).toBe("a1");
    expect(body.attemptNumber).toBe(1);
    expect(body.questions).toHaveLength(1);
    expect(body.questions[0]).not.toHaveProperty("correctIndex");
    expect(body.questions[0]).not.toHaveProperty("explanation");
    expect([...body.questions[0].options].sort()).toEqual([...QUESTION.options].sort());
  });
});

describe("POST /api/lms/modules/[id]/quiz (submit)", () => {
  function attemptRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "a1", enrollmentId: "e1", moduleId: "m1", attemptNumber: 1, submittedAt: null, ...overrides,
    };
  }

  it("passes, completes the module, and reveals explanations", async () => {
    mockSession({ id: "u1", name: "New", role: "staff" });
    prismaMock.lMSQuizAttempt.findUnique.mockResolvedValue(attemptRow());
    // recalcEnrollmentStatus lookup.
    prismaMock.lMSEnrollment.findUnique
      .mockResolvedValueOnce({ id: "e1" }) // resolveEnrollment
      .mockResolvedValueOnce({
        id: "e1", startedAt: null,
        course: { modules: [{ id: "m1" }] },
        moduleProgress: [{ moduleId: "m1", completed: true }],
      });

    const res = await POST(
      createRequest("POST", "/api/lms/modules/m1/quiz", {
        body: { attemptId: "a1", answers: [{ questionId: "q1", selectedIndex: correctDisplayPos("e1", "m1", 1) }] },
      }),
      paramsOf("m1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.passed).toBe(true);
    expect(body.score).toBe(100);
    expect(body.explanations[0]).toMatchObject({ questionId: "q1", correctIndex: 1 });
    expect(prismaMock.lMSModuleProgress.upsert).toHaveBeenCalled();
  });

  it("fails and does NOT complete the module", async () => {
    mockSession({ id: "u1", name: "New", role: "staff" });
    prismaMock.lMSQuizAttempt.findUnique.mockResolvedValue(attemptRow());
    const wrong = correctDisplayPos("e1", "m1", 1) === 0 ? 1 : 0;

    const res = await POST(
      createRequest("POST", "/api/lms/modules/m1/quiz", {
        body: { attemptId: "a1", answers: [{ questionId: "q1", selectedIndex: wrong }] },
      }),
      paramsOf("m1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.passed).toBe(false);
    expect(prismaMock.lMSModuleProgress.upsert).not.toHaveBeenCalled();
  });

  it("409 when the attempt was already submitted", async () => {
    mockSession({ id: "u1", name: "New", role: "staff" });
    prismaMock.lMSQuizAttempt.findUnique.mockResolvedValue(
      attemptRow({ submittedAt: new Date() }),
    );
    const res = await POST(
      createRequest("POST", "/api/lms/modules/m1/quiz", {
        body: { attemptId: "a1", answers: [] },
      }),
      paramsOf("m1"),
    );
    expect(res.status).toBe(409);
  });

  it("404 when the attempt belongs to a different enrollment", async () => {
    mockSession({ id: "u1", name: "New", role: "staff" });
    prismaMock.lMSQuizAttempt.findUnique.mockResolvedValue(
      attemptRow({ enrollmentId: "someone-else" }),
    );
    const res = await POST(
      createRequest("POST", "/api/lms/modules/m1/quiz", {
        body: { attemptId: "a1", answers: [] },
      }),
      paramsOf("m1"),
    );
    expect(res.status).toBe(404);
  });
});
