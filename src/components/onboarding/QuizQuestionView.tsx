"use client";

import { useState } from "react";
import { Check, X, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { QuizQuestion } from "@/lib/quiz-parser";

/**
 * Renders a single quiz question.
 *
 * - **Multi-choice format** (`question.options.length > 0`) — radio buttons,
 *   Submit reveals correct/incorrect feedback + explanation. Once submitted,
 *   the chosen option is locked. "Try again" resets state.
 *
 * - **Legacy Q/A format** (no options, has `legacyAnswer`) — current
 *   "Show Answer" toggle, kept for backward-compat with quizzes seeded
 *   before 2026-04-29.
 */
export function QuizQuestionView({
  question,
  questionKey,
  /// Persistence is per-component-instance for now; future enhancement is
  /// to lift selected/submitted state to the parent so we can persist
  /// quiz attempts to the server (LMSCourseAttempt model TBD).
}: {
  question: QuizQuestion;
  questionKey: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [legacyRevealed, setLegacyRevealed] = useState(false);

  const correctOption = question.options.find((o) => o.isCorrect);
  const isCorrect = submitted && selected === correctOption?.letter;

  // ── Multi-choice rendering ────────────────────────────────
  if (question.options.length > 0) {
    return (
      <div className="space-y-2.5">
        <p className="text-sm font-medium text-foreground">{question.question}</p>
        <div className="space-y-1.5">
          {question.options.map((opt) => {
            const isSelected = selected === opt.letter;
            const showCorrect = submitted && opt.isCorrect;
            const showWrong =
              submitted && isSelected && !opt.isCorrect;
            return (
              <label
                key={`${questionKey}-${opt.letter}`}
                className={cn(
                  "flex items-start gap-2.5 p-2.5 rounded-md border cursor-pointer transition-colors",
                  !submitted && "border-border hover:bg-surface",
                  showCorrect && "border-green-400 bg-green-50",
                  showWrong && "border-red-400 bg-red-50",
                  !submitted && isSelected && "border-brand bg-brand/5",
                  submitted && !showCorrect && !showWrong && "opacity-60",
                )}
              >
                <input
                  type="radio"
                  name={questionKey}
                  value={opt.letter}
                  checked={isSelected}
                  disabled={submitted}
                  onChange={() => setSelected(opt.letter)}
                  className="mt-0.5 h-4 w-4 rounded-full border-border text-brand focus:ring-brand"
                />
                <span className="text-sm text-foreground flex-1">
                  <span className="font-semibold mr-1.5">{opt.letter})</span>
                  {opt.text}
                </span>
                {showCorrect && (
                  <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                )}
                {showWrong && (
                  <X className="w-4 h-4 text-red-600 flex-shrink-0" />
                )}
              </label>
            );
          })}
        </div>
        <div className="flex items-center gap-2 pt-1">
          {!submitted ? (
            <button
              type="button"
              onClick={() => setSubmitted(true)}
              disabled={!selected}
              className="text-xs px-3 py-1.5 rounded-md bg-brand text-white hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Submit
            </button>
          ) : (
            <>
              <span
                className={cn(
                  "text-xs font-medium",
                  isCorrect ? "text-green-700" : "text-red-700",
                )}
              >
                {isCorrect ? "Correct" : `Incorrect — answer: ${correctOption?.letter}`}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setSubmitted(false);
                }}
                className="text-xs text-brand hover:underline ml-auto"
              >
                Try again
              </button>
            </>
          )}
        </div>
        {submitted && question.explanation && (
          <p className="text-xs text-muted mt-2 pl-3 border-l-2 border-brand/20 whitespace-pre-wrap">
            {question.explanation}
          </p>
        )}
      </div>
    );
  }

  // ── Legacy Q/A fallback ───────────────────────────────────
  if (question.legacyAnswer) {
    return (
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">{question.question}</p>
        <button
          type="button"
          onClick={() => setLegacyRevealed((p) => !p)}
          className="text-xs text-brand hover:underline flex items-center gap-1"
        >
          {legacyRevealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          {legacyRevealed ? "Hide Answer" : "Show Answer"}
        </button>
        {legacyRevealed && (
          <p className="text-sm text-muted mt-1.5 pl-3 border-l-2 border-brand/20 whitespace-pre-wrap">
            {question.legacyAnswer}
          </p>
        )}
      </div>
    );
  }

  // No answer at all — just render the question.
  return <p className="text-sm font-medium text-foreground">{question.question}</p>;
}
