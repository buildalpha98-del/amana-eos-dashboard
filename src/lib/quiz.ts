/**
 * Quiz engine — deterministic, server-side.
 *
 * Options are shuffled per attempt using a seed derived from the attempt
 * context (enrollmentId + moduleId + attemptNumber + questionId), so the exact
 * permutation shown at "start" is reproducible at "submit" WITHOUT storing it.
 * The correct answer index never leaves the server: the client sees shuffled
 * options and submits DISPLAY positions, which we map back through the same
 * permutation to score. Pass mark is 80%.
 */

export const PASS_MARK = 80;

export type QuizQuestion = {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string | null;
};

type AttemptCtx = {
  enrollmentId: string;
  moduleId: string;
  attemptNumber: number;
};

/** FNV-1a hash of the joined parts → unsigned 32-bit seed. Deterministic. */
export function deriveSeed(...parts: Array<string | number>): number {
  const s = parts.join(":");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 PRNG — small, fast, deterministic (not Math.random). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher–Yates permutation of [0, n). `result[displayPos] = originalIndex`.
 * Deterministic for a given (n, seed).
 */
export function permutationFor(n: number, seed: number): number[] {
  const rng = mulberry32(seed);
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function seedFor(ctx: AttemptCtx, questionId: string): number {
  return deriveSeed(ctx.enrollmentId, ctx.moduleId, ctx.attemptNumber, questionId);
}

/**
 * Build the client-facing question set for an attempt: shuffled options, no
 * correct index, no explanation.
 */
export function buildShuffledQuestions(
  params: AttemptCtx & { questions: QuizQuestion[] },
): Array<{ id: string; question: string; options: string[] }> {
  return params.questions.map((q) => {
    const perm = permutationFor(q.options.length, seedFor(params, q.id));
    return {
      id: q.id,
      question: q.question,
      options: perm.map((i) => q.options[i]),
    };
  });
}

export type SubmittedAnswer = { questionId: string; selectedIndex: number };

export type ScoreResult = {
  score: number; // 0–100
  passed: boolean;
  results: Array<{
    questionId: string;
    correct: boolean;
    correctIndex: number; // original index of the right answer (for explanations)
  }>;
};

/**
 * Score an attempt. `selectedIndex` is the DISPLAY position the learner chose;
 * we re-derive the same permutation and map it back to the original index
 * before comparing to `correctIndex`. A missing answer is incorrect.
 */
export function scoreAttempt(
  params: AttemptCtx & {
    questions: QuizQuestion[];
    answers: SubmittedAnswer[];
  },
): ScoreResult {
  const byId = new Map(params.answers.map((a) => [a.questionId, a.selectedIndex]));
  const results = params.questions.map((q) => {
    const perm = permutationFor(q.options.length, seedFor(params, q.id));
    const displayPos = byId.get(q.id);
    const originalPicked =
      displayPos != null && displayPos >= 0 && displayPos < perm.length
        ? perm[displayPos]
        : -1;
    return {
      questionId: q.id,
      correct: originalPicked === q.correctIndex,
      correctIndex: q.correctIndex,
    };
  });

  if (params.questions.length === 0) {
    // An empty quiz shouldn't permanently block completion.
    return { score: 100, passed: true, results };
  }

  const correct = results.filter((r) => r.correct).length;
  const score = Math.round((correct / params.questions.length) * 100);
  return { score, passed: score >= PASS_MARK, results };
}
