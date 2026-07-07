"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, RotateCcw, Loader2 } from "lucide-react";
import {
  useStartQuiz,
  useSubmitQuiz,
  type ShuffledQuizQuestion,
  type SubmitQuizResponse,
} from "@/hooks/useQuiz";

/**
 * Interactive quiz for a module. Fetches a shuffled attempt, collects answers,
 * submits for server-side scoring, then shows per-question feedback with
 * explanations. On a pass it calls onPassed so the player unlocks "Next".
 */
export function QuizPlayer({
  moduleId,
  alreadyPassed,
  onPassed,
}: {
  moduleId: string;
  alreadyPassed: boolean;
  onPassed: () => void;
}) {
  const start = useStartQuiz();
  const submit = useSubmitQuiz();
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ShuffledQuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<SubmitQuizResponse | null>(null);

  async function begin() {
    setResult(null);
    setAnswers({});
    const res = await start.mutateAsync(moduleId);
    setAttemptId(res.attemptId);
    setQuestions(res.questions);
  }

  async function handleSubmit() {
    if (!attemptId) return;
    const payload = questions.map((q) => ({
      questionId: q.id,
      selectedIndex: answers[q.id] ?? -1,
    }));
    const res = await submit.mutateAsync({ moduleId, attemptId, answers: payload });
    setResult(res);
    if (res.passed) onPassed();
  }

  if (alreadyPassed && !result) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
        <CheckCircle2 className="h-5 w-5" />
        You&apos;ve already passed this quiz.
      </div>
    );
  }

  if (!attemptId) {
    return (
      <div className="rounded-xl border border-border bg-surface/50 p-6 text-center">
        <p className="mb-4 text-sm text-muted">
          Ready to check what you&apos;ve learned? You need {80}% to pass — you can retake it as many times as you like.
        </p>
        <button
          onClick={begin}
          disabled={start.isPending}
          className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-60"
        >
          {start.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Start the quiz
        </button>
      </div>
    );
  }

  const allAnswered = questions.every((q) => answers[q.id] !== undefined);
  const resultById = new Map((result?.results ?? []).map((r) => [r.questionId, r]));
  const explById = new Map((result?.explanations ?? []).map((e) => [e.questionId, e]));

  return (
    <div className="space-y-6">
      {result && (
        <div
          className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
            result.passed
              ? "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400"
              : "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400"
          }`}
        >
          {result.passed ? <CheckCircle2 className="h-6 w-6" /> : <XCircle className="h-6 w-6" />}
          <div>
            <p className="font-semibold">
              {result.passed ? "Passed" : "Not quite"} — {result.score}%
            </p>
            <p className="text-xs opacity-80">
              {result.passed
                ? "Great work. You can move on to the next section."
                : "You need 80% to pass. Review the answers below and try again."}
            </p>
          </div>
        </div>
      )}

      {questions.map((q, qi) => {
        const picked = answers[q.id];
        const r = resultById.get(q.id);
        const expl = explById.get(q.id);
        return (
          <div key={q.id} className="rounded-xl border border-border bg-surface/50 p-4">
            <p className="mb-3 text-sm font-medium text-foreground">
              {qi + 1}. {q.question}
            </p>
            <div className="space-y-2">
              {q.options.map((opt, oi) => {
                const isPicked = picked === oi;
                const showCorrect = result && expl && expl.correctIndex === oi;
                const showWrong = result && isPicked && expl && expl.correctIndex !== oi;
                return (
                  <button
                    key={oi}
                    type="button"
                    disabled={!!result}
                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: oi }))}
                    className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      showCorrect
                        ? "border-green-500 bg-green-500/10"
                        : showWrong
                          ? "border-red-500 bg-red-500/10"
                          : isPicked
                            ? "border-brand bg-brand/10"
                            : "border-border hover:bg-surface"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${
                        isPicked ? "border-brand bg-brand text-white" : "border-border"
                      }`}
                    >
                      {String.fromCharCode(65 + oi)}
                    </span>
                    {opt}
                  </button>
                );
              })}
            </div>
            {result && expl?.explanation && (
              <p className="mt-3 rounded-lg bg-surface px-3 py-2 text-xs text-muted">
                {expl.explanation}
              </p>
            )}
            {result && r && (
              <p className={`mt-2 text-xs font-medium ${r.correct ? "text-green-600" : "text-red-600"}`}>
                {r.correct ? "Correct" : "Incorrect"}
              </p>
            )}
          </div>
        );
      })}

      {!result ? (
        <button
          onClick={handleSubmit}
          disabled={!allAnswered || submit.isPending}
          className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-60"
        >
          {submit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Submit answers
        </button>
      ) : !result.passed ? (
        <button
          onClick={begin}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:bg-surface/70"
        >
          <RotateCcw className="h-4 w-4" />
          Try again
        </button>
      ) : null}
    </div>
  );
}
