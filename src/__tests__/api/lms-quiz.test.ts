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
import { deriveSeed, permutationFor, questionsFingerprint } from "@/lib/quiz";

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
  // Ownership lookup (no include) vs recalcEnrollmentStatus lookup (include).
  prismaMock.lMSEnrollment.findUnique.mockImplementation((args: unknown) => {
    const { include } = args as { include?: unknown };
    if (include) {
      return Promise.resolve({
        id: "e1", startedAt: null,
        course: { modules: [{ id: "m1" }] },
        moduleProgress: [{ moduleId: "m1", completed: true, score: 100 }],
      });
    }
    return Promise.resolve({ id: "e1" });
  });
  prismaMock.lMSQuizQuestion.findMany.mockResolvedValue([QUESTION]);
  prismaMock.lMSQuizAttempt.findFirst.mockResolvedValue(null); // no in-progress attempt
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
    // The attempt records the served question-set fingerprint for the
    // mid-attempt-edit guard at submit.
    expect(prismaMock.lMSQuizAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          optionsFingerprint: questionsFingerprint([QUESTION]),
        }),
      }),
    );
  });

  it("reuses an in-progress attempt instead of creating a new row", async () => {
    mockSession({ id: "u1", name: "New", role: "staff" });
    prismaMock.lMSQuizAttempt.findFirst.mockResolvedValue({ id: "a-open", attemptNumber: 3 });
    prismaMock.lMSQuizAttempt.update.mockResolvedValue({ id: "a-open" });

    const res = await GET(createRequest("GET", "/api/lms/modules/m1/quiz"), paramsOf("m1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.attemptId).toBe("a-open");
    expect(body.attemptNumber).toBe(3);
    expect(prismaMock.lMSQuizAttempt.create).not.toHaveBeenCalled();
    // Fingerprint refreshed to match the freshly served questions.
    expect(prismaMock.lMSQuizAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "a-open" },
        data: { optionsFingerprint: questionsFingerprint([QUESTION]) },
      }),
    );
  });
});

describe("POST /api/lms/modules/[id]/quiz (submit)", () => {
  function attemptRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "a1", enrollmentId: "e1", moduleId: "m1", attemptNumber: 1, submittedAt: null,
      optionsFingerprint: questionsFingerprint([QUESTION]), ...overrides,
    };
  }

  it("passes, completes the module, and reveals explanations", async () => {
    mockSession({ id: "u1", name: "New", role: "staff" });
    prismaMock.lMSQuizAttempt.findUnique.mockResolvedValue(attemptRow());

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
    // results carries NO answer index — canonical indices must never share a
    // payload with display-space ones (the PR #202 trap).
    expect(body.results[0]).toEqual({ questionId: "q1", correct: true });
    // correctIndex is in DISPLAY space — the position the learner saw, so the
    // client can highlight the right option in the shuffled list directly.
    const displayPos = correctDisplayPos("e1", "m1", 1);
    expect(body.explanations[0]).toMatchObject({ questionId: "q1", correctIndex: displayPos });
    const perm = permutationFor(QUESTION.options.length, deriveSeed("e1", "m1", 1, QUESTION.id));
    const shuffledOptions = perm.map((i) => QUESTION.options[i]);
    expect(shuffledOptions[body.explanations[0].correctIndex]).toBe("The kiosk");
    expect(prismaMock.lMSModuleProgress.upsert).toHaveBeenCalled();
    // Completion writes the enrollment's course score (avg of module scores)
    // so the transcript shows a result instead of null.
    expect(prismaMock.lMSEnrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "e1" },
        data: expect.objectContaining({ status: "completed", score: 100 }),
      }),
    );
  });

  it("409 when the question set changed since the attempt started", async () => {
    mockSession({ id: "u1", name: "New", role: "staff" });
    prismaMock.lMSQuizAttempt.findUnique.mockResolvedValue(
      attemptRow({ optionsFingerprint: "stale-fingerprint" }),
    );
    const res = await POST(
      createRequest("POST", "/api/lms/modules/m1/quiz", {
        body: { attemptId: "a1", answers: [{ questionId: "q1", selectedIndex: 0 }] },
      }),
      paramsOf("m1"),
    );
    expect(res.status).toBe(409);
    expect(prismaMock.lMSQuizAttempt.update).not.toHaveBeenCalled();
    expect(prismaMock.lMSModuleProgress.upsert).not.toHaveBeenCalled();
  });

  it("legacy attempts without a fingerprint still submit", async () => {
    mockSession({ id: "u1", name: "New", role: "staff" });
    prismaMock.lMSQuizAttempt.findUnique.mockResolvedValue(
      attemptRow({ optionsFingerprint: null }),
    );
    const res = await POST(
      createRequest("POST", "/api/lms/modules/m1/quiz", {
        body: { attemptId: "a1", answers: [{ questionId: "q1", selectedIndex: correctDisplayPos("e1", "m1", 1) }] },
      }),
      paramsOf("m1"),
    );
    expect(res.status).toBe(200);
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
