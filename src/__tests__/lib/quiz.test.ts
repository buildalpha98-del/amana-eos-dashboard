/**
 * Quiz engine — deterministic seeded shuffle + server-side scoring.
 *
 * The correct answer index is never sent to the client; options are shuffled
 * per attempt and the client submits DISPLAY positions, which the server maps
 * back through the same permutation to score. These tests pin determinism and
 * the display→original mapping.
 */
import { describe, it, expect } from "vitest";
import {
  deriveSeed,
  permutationFor,
  buildShuffledQuestions,
  scoreAttempt,
  PASS_MARK,
} from "@/lib/quiz";

describe("deriveSeed", () => {
  it("is deterministic for the same parts", () => {
    expect(deriveSeed("e1", "m1", 1, "q1")).toBe(deriveSeed("e1", "m1", 1, "q1"));
  });
  it("differs when any part changes", () => {
    const base = deriveSeed("e1", "m1", 1, "q1");
    expect(deriveSeed("e1", "m1", 2, "q1")).not.toBe(base);
    expect(deriveSeed("e1", "m1", 1, "q2")).not.toBe(base);
    expect(deriveSeed("e2", "m1", 1, "q1")).not.toBe(base);
  });
});

describe("permutationFor", () => {
  it("returns a valid permutation of 0..n-1", () => {
    const perm = permutationFor(4, 12345);
    expect([...perm].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });
  it("is deterministic for the same seed", () => {
    expect(permutationFor(5, 999)).toEqual(permutationFor(5, 999));
  });
});

const CTX = { enrollmentId: "e1", moduleId: "m1", attemptNumber: 1 };
const QUESTIONS = [
  { id: "q1", question: "1+1?", options: ["1", "2", "3", "4"], correctIndex: 1 },
  { id: "q2", question: "Cap of AU?", options: ["Sydney", "Canberra", "Perth"], correctIndex: 1 },
  { id: "q3", question: "Sky colour?", options: ["Blue", "Green"], correctIndex: 0 },
  { id: "q4", question: "2*2?", options: ["3", "4", "5"], correctIndex: 1 },
  { id: "q5", question: "First letter?", options: ["A", "B"], correctIndex: 0 },
];

// Helper: for a question, find the DISPLAY position that maps to the correct
// original index, given the attempt context (mirrors what a correct learner clicks).
function correctDisplayPos(q: (typeof QUESTIONS)[number]) {
  const seed = deriveSeed(CTX.enrollmentId, CTX.moduleId, CTX.attemptNumber, q.id);
  const perm = permutationFor(q.options.length, seed); // perm[displayPos] = originalIndex
  return perm.indexOf(q.correctIndex);
}

describe("buildShuffledQuestions", () => {
  it("strips correctIndex/explanation and shuffles options", () => {
    const built = buildShuffledQuestions({ ...CTX, questions: QUESTIONS });
    expect(built).toHaveLength(5);
    for (const b of built) {
      expect(b).not.toHaveProperty("correctIndex");
      expect(b).not.toHaveProperty("explanation");
      expect(b).toHaveProperty("options");
    }
  });
  it("shuffled options are a permutation of the originals", () => {
    const built = buildShuffledQuestions({ ...CTX, questions: QUESTIONS });
    expect([...built[0].options].sort()).toEqual([...QUESTIONS[0].options].sort());
  });
});

describe("scoreAttempt", () => {
  it("scores 100 and passes when every display answer maps to the correct option", () => {
    const answers = QUESTIONS.map((q) => ({
      questionId: q.id,
      selectedIndex: correctDisplayPos(q),
    }));
    const r = scoreAttempt({ ...CTX, questions: QUESTIONS, answers });
    expect(r.score).toBe(100);
    expect(r.passed).toBe(true);
  });

  it("exactly 80% passes (4 of 5 correct)", () => {
    const answers = QUESTIONS.map((q, i) => ({
      questionId: q.id,
      // q5 (index 4) answered wrong on purpose.
      selectedIndex: i === 4 ? (correctDisplayPos(q) === 0 ? 1 : 0) : correctDisplayPos(q),
    }));
    const r = scoreAttempt({ ...CTX, questions: QUESTIONS, answers });
    expect(r.score).toBe(80);
    expect(r.passed).toBe(true);
    expect(r.passed).toBe(r.score >= PASS_MARK);
  });

  it("below 80% fails (3 of 5 correct)", () => {
    const answers = QUESTIONS.map((q, i) => ({
      questionId: q.id,
      selectedIndex:
        i >= 3 ? (correctDisplayPos(q) === 0 ? 1 : 0) : correctDisplayPos(q),
    }));
    const r = scoreAttempt({ ...CTX, questions: QUESTIONS, answers });
    expect(r.score).toBe(60);
    expect(r.passed).toBe(false);
  });

  it("a missing answer counts as incorrect", () => {
    const answers = [{ questionId: "q1", selectedIndex: correctDisplayPos(QUESTIONS[0]) }];
    const r = scoreAttempt({ ...CTX, questions: QUESTIONS, answers });
    expect(r.score).toBe(20);
    expect(r.passed).toBe(false);
  });

  it("empty question set passes (nothing to fail — avoids a permanent block)", () => {
    const r = scoreAttempt({ ...CTX, questions: [], answers: [] });
    expect(r.passed).toBe(true);
  });

  it("returns per-question results with the correct original index", () => {
    const answers = QUESTIONS.map((q) => ({
      questionId: q.id,
      selectedIndex: correctDisplayPos(q),
    }));
    const r = scoreAttempt({ ...CTX, questions: QUESTIONS, answers });
    expect(r.results).toHaveLength(5);
    expect(r.results[0]).toMatchObject({ questionId: "q1", correct: true, correctIndex: 1 });
  });
});
