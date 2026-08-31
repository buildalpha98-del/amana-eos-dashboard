"use client";

/**
 * TakeSurveyForm — the staff-facing form that renders one question
 * per row and submits answers via useSubmitSurvey.
 *
 * Question renderers:
 *   yes_no        → two segmented pills (Yes / No)
 *   single_choice → radio group
 *   multi_choice  → checkbox group
 *   short_text    → single-line input
 *   long_text     → textarea
 *   rating        → 1-5 star buttons
 *
 * Client-side validation mirrors the server: every required question
 * must have a valid answer of the right shape. Server catches the
 * rest — the friendly error toasts come from useSubmitSurvey.
 */

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Loader2,
  Star,
  Lock,
  CheckCircle2,
} from "lucide-react";
import {
  useSurvey,
  useSubmitSurvey,
  type SurveyQuestionData,
  type AnswerInput,
} from "@/hooks/useSurveys";

interface Props {
  surveyId: string;
  onDone: () => void;
  onCancel: () => void;
}

type AnswerState = {
  yesNo?: boolean;
  choiceIndexes?: number[];
  textValue?: string;
  ratingValue?: number;
};

export function TakeSurveyForm({ surveyId, onDone, onCancel }: Props) {
  const { data: survey, isLoading } = useSurvey(surveyId);
  const submit = useSubmitSurvey(surveyId);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [submitted, setSubmitted] = useState(false);

  const isValid = useMemo(() => {
    if (!survey) return false;
    return survey.questions.every((q) => {
      if (!q.required) return true;
      const a = answers[q.id];
      if (!a) return false;
      switch (q.type) {
        case "yes_no":
          return typeof a.yesNo === "boolean";
        case "single_choice":
          return (a.choiceIndexes?.length ?? 0) === 1;
        case "multi_choice":
          return (a.choiceIndexes?.length ?? 0) >= 1;
        case "short_text":
        case "long_text":
          return !!a.textValue && a.textValue.trim().length > 0;
        case "rating":
          return !!a.ratingValue && a.ratingValue >= 1 && a.ratingValue <= 5;
      }
    });
  }, [survey, answers]);

  const setAnswer = (qid: string, patch: AnswerState) => {
    setAnswers((prev) => ({ ...prev, [qid]: { ...prev[qid], ...patch } }));
  };

  const handleSubmit = () => {
    if (!survey) return;
    const payload: AnswerInput[] = [];
    for (const q of survey.questions) {
      const a = answers[q.id];
      if (!a) continue;
      // Shape the payload to only include the field for this type
      // so the server-side validator doesn't see stray fields.
      switch (q.type) {
        case "yes_no":
          if (typeof a.yesNo === "boolean") {
            payload.push({ questionId: q.id, yesNo: a.yesNo });
          }
          break;
        case "single_choice":
        case "multi_choice":
          if ((a.choiceIndexes?.length ?? 0) > 0 && a.choiceIndexes) {
            payload.push({ questionId: q.id, choiceIndexes: a.choiceIndexes });
          }
          break;
        case "short_text":
        case "long_text":
          if (a.textValue && a.textValue.trim()) {
            payload.push({ questionId: q.id, textValue: a.textValue });
          }
          break;
        case "rating":
          if (a.ratingValue) {
            payload.push({ questionId: q.id, ratingValue: a.ratingValue });
          }
          break;
      }
    }
    submit.mutate(payload, {
      onSuccess: () => setSubmitted(true),
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted" />
      </div>
    );
  }
  if (!survey) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <p className="text-sm text-danger">Couldn&apos;t load this survey.</p>
        <button
          type="button"
          onClick={onCancel}
          className="mt-3 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="max-w-xl mx-auto text-center py-16">
        <CheckCircle2 className="w-14 h-14 text-emerald-600 mx-auto mb-3" />
        <h2 className="text-xl font-semibold text-foreground">
          Thanks for your response
        </h2>
        <p className="text-sm text-muted mt-1">
          Your answers were recorded. You can close this page.
        </p>
        <button
          type="button"
          onClick={onDone}
          className="mt-6 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to my surveys
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to my surveys
      </button>

      <div className="rounded-xl border border-border bg-card p-5">
        <h1 className="text-xl font-semibold text-foreground">
          {survey.title}
        </h1>
        {survey.description && (
          <p className="text-sm text-muted mt-1 whitespace-pre-wrap">
            {survey.description}
          </p>
        )}
        {survey.anonymous && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-md px-2 py-1">
            <Lock className="w-3 h-3" />
            Anonymous — your identity is not stored.
          </p>
        )}
      </div>

      <div className="space-y-3">
        {survey.questions.map((q, i) => (
          <QuestionRenderer
            key={q.id}
            index={i}
            question={q}
            value={answers[q.id] ?? {}}
            onChange={(patch) => setAnswer(q.id, patch)}
          />
        ))}
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm border border-border rounded-md hover:bg-surface"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!isValid || submit.isPending}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submit.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Submit response
        </button>
      </div>
    </div>
  );
}

function QuestionRenderer({
  index,
  question,
  value,
  onChange,
}: {
  index: number;
  question: SurveyQuestionData;
  value: AnswerState;
  onChange: (patch: AnswerState) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide">
          Q{index + 1}
          {question.required && (
            <span className="ml-1 text-red-500 normal-case">*</span>
          )}
        </p>
        <p className="mt-1 text-sm font-medium text-foreground">
          {question.title}
        </p>
        {question.description && (
          <p className="mt-1 text-xs text-muted">{question.description}</p>
        )}
      </div>

      {question.type === "yes_no" && (
        <div className="flex gap-2">
          {[true, false].map((v) => {
            const on = value.yesNo === v;
            return (
              <button
                key={String(v)}
                type="button"
                onClick={() => onChange({ yesNo: v })}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  on
                    ? v
                      ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
                      : "bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800 text-red-700 dark:text-red-300"
                    : "bg-surface/50 border-border text-muted hover:bg-surface"
                }`}
              >
                {v ? "Yes" : "No"}
              </button>
            );
          })}
        </div>
      )}

      {question.type === "single_choice" && (
        <div className="space-y-1.5">
          {question.options.map((opt, i) => {
            const on = value.choiceIndexes?.[0] === i;
            return (
              <label
                key={i}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors text-sm ${
                  on
                    ? "border-brand bg-brand/5 text-brand"
                    : "border-border hover:bg-surface"
                }`}
              >
                <input
                  type="radio"
                  name={question.id}
                  checked={on}
                  onChange={() => onChange({ choiceIndexes: [i] })}
                  className="text-brand"
                />
                {opt}
              </label>
            );
          })}
        </div>
      )}

      {question.type === "multi_choice" && (
        <div className="space-y-1.5">
          {question.options.map((opt, i) => {
            const on = value.choiceIndexes?.includes(i) ?? false;
            return (
              <label
                key={i}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors text-sm ${
                  on
                    ? "border-brand bg-brand/5 text-brand"
                    : "border-border hover:bg-surface"
                }`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => {
                    const set = new Set(value.choiceIndexes ?? []);
                    if (e.target.checked) set.add(i);
                    else set.delete(i);
                    onChange({
                      choiceIndexes: Array.from(set).sort((a, b) => a - b),
                    });
                  }}
                />
                {opt}
              </label>
            );
          })}
        </div>
      )}

      {question.type === "short_text" && (
        <input
          type="text"
          value={value.textValue ?? ""}
          onChange={(e) => onChange({ textValue: e.target.value })}
          maxLength={500}
          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
          placeholder="Your answer…"
        />
      )}

      {question.type === "long_text" && (
        <textarea
          value={value.textValue ?? ""}
          onChange={(e) => onChange({ textValue: e.target.value })}
          rows={4}
          maxLength={5000}
          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
          placeholder="Your answer…"
        />
      )}

      {question.type === "rating" && (
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => {
            const on = (value.ratingValue ?? 0) >= n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => onChange({ ratingValue: n })}
                className="p-1 hover:scale-110 transition-transform"
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
              >
                <Star
                  className={`w-8 h-8 ${
                    on ? "text-amber-400 fill-amber-400" : "text-muted"
                  }`}
                />
              </button>
            );
          })}
          {value.ratingValue && (
            <span className="ml-2 text-sm text-muted">
              {value.ratingValue} / 5
            </span>
          )}
        </div>
      )}
    </div>
  );
}
