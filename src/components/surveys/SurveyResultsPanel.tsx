"use client";

/**
 * SurveyResultsPanel — aggregated results view for admins.
 *
 * Server does the aggregation in /api/surveys/[id]/results; we just
 * render the shape. Per-question card layout:
 *   yes_no        → bar with yes/no counts + percentages
 *   choice        → horizontal bars per option
 *   rating        → average + 5-cell distribution
 *   text          → bullet list of individual responses
 *
 * For anonymous surveys the panel hides any respondent references
 * (already stripped server-side but we double-guard).
 */

import { ArrowLeft, Loader2, Lock } from "lucide-react";
import { useSurveyResults } from "@/hooks/useSurveys";

type Agg =
  | { type: "yes_no"; yes: number; no: number }
  | { type: "single_choice"; counts: number[] }
  | { type: "multi_choice"; counts: number[] }
  | { type: "short_text"; textAnswers: string[] }
  | { type: "long_text"; textAnswers: string[] }
  | { type: "rating"; average: number; distribution: number[] };

interface QuestionResult {
  questionId: string;
  title: string;
  type: Agg["type"];
  options: string[];
  responseCount: number;
  aggregate: Agg;
}

interface ResultsPayload {
  survey: {
    id: string;
    title: string;
    status: string;
    anonymous: boolean;
    responseCount: number;
  };
  results: QuestionResult[];
}

export function SurveyResultsPanel({
  surveyId,
  onBack,
}: {
  surveyId: string;
  onBack: () => void;
}) {
  const { data, isLoading, error } = useSurveyResults(surveyId) as {
    data?: ResultsPayload;
    isLoading: boolean;
    error: unknown;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <p className="text-sm text-danger">
        Couldn&apos;t load results — {(error as Error)?.message ?? "unknown"}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to surveys
        </button>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold text-foreground">
          {data.survey.title}
        </h2>
        <div className="mt-2 flex flex-wrap gap-3 text-sm text-muted">
          <span>
            <span className="font-semibold text-foreground">
              {data.survey.responseCount}
            </span>{" "}
            response{data.survey.responseCount === 1 ? "" : "s"}
          </span>
          <span>·</span>
          <span className="capitalize">{data.survey.status}</span>
          {data.survey.anonymous && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-1 text-blue-700">
                <Lock className="w-3 h-3" />
                Anonymous
              </span>
            </>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {data.results.map((q, i) => (
          <QuestionCard key={q.questionId} question={q} index={i} />
        ))}
      </div>
    </div>
  );
}

function QuestionCard({
  question,
  index,
}: {
  question: QuestionResult;
  index: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide">
            Q{index + 1} · {formatType(question.type)}
          </p>
          <h3 className="mt-0.5 text-sm font-semibold text-foreground">
            {question.title}
          </h3>
        </div>
        <span className="shrink-0 text-xs text-muted">
          {question.responseCount} response
          {question.responseCount === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-3">
        {question.aggregate.type === "yes_no" && (
          <YesNoBars
            yes={question.aggregate.yes}
            no={question.aggregate.no}
          />
        )}
        {(question.aggregate.type === "single_choice" ||
          question.aggregate.type === "multi_choice") && (
          <ChoiceBars
            counts={question.aggregate.counts}
            options={question.options}
          />
        )}
        {question.aggregate.type === "rating" && (
          <RatingCard
            average={question.aggregate.average}
            distribution={question.aggregate.distribution}
          />
        )}
        {(question.aggregate.type === "short_text" ||
          question.aggregate.type === "long_text") && (
          <TextResponses answers={question.aggregate.textAnswers} />
        )}
      </div>
    </div>
  );
}

function YesNoBars({ yes, no }: { yes: number; no: number }) {
  const total = yes + no;
  return (
    <div className="space-y-1.5">
      <Bar label="Yes" count={yes} total={total} colorClass="bg-emerald-500" />
      <Bar label="No" count={no} total={total} colorClass="bg-red-500" />
    </div>
  );
}

function ChoiceBars({
  counts,
  options,
}: {
  counts: number[];
  options: string[];
}) {
  const total = counts.reduce((s, n) => s + n, 0);
  return (
    <div className="space-y-1.5">
      {options.map((opt, i) => (
        <Bar
          key={i}
          label={opt}
          count={counts[i] ?? 0}
          total={total}
          colorClass="bg-brand"
        />
      ))}
    </div>
  );
}

function RatingCard({
  average,
  distribution,
}: {
  average: number;
  distribution: number[];
}) {
  const total = distribution.reduce((s, n) => s + n, 0);
  return (
    <div className="space-y-2">
      <p className="text-2xl font-bold text-foreground">
        {average.toFixed(2)}{" "}
        <span className="text-sm font-normal text-muted">/ 5 average</span>
      </p>
      <div className="space-y-1">
        {distribution.map((n, i) => (
          <Bar
            key={i}
            label={`${i + 1}★`}
            count={n}
            total={total}
            colorClass="bg-amber-400"
          />
        ))}
      </div>
    </div>
  );
}

function TextResponses({ answers }: { answers: string[] }) {
  if (answers.length === 0) {
    return <p className="text-xs text-muted italic">No answers.</p>;
  }
  return (
    <ul className="space-y-1.5 text-sm text-foreground">
      {answers.map((a, i) => (
        <li
          key={i}
          className="pl-3 border-l-2 border-brand/30 whitespace-pre-wrap"
        >
          {a}
        </li>
      ))}
    </ul>
  );
}

function Bar({
  label,
  count,
  total,
  colorClass,
}: {
  label: string;
  count: number;
  total: number;
  colorClass: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-foreground">{label}</span>
        <span className="text-muted">
          {count} ({pct}%)
        </span>
      </div>
      <div className="h-2 bg-surface rounded-full overflow-hidden mt-0.5">
        <div
          className={`h-full ${colorClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function formatType(type: Agg["type"]): string {
  switch (type) {
    case "yes_no":
      return "Yes / No";
    case "single_choice":
      return "Multiple choice";
    case "multi_choice":
      return "Checkbox";
    case "short_text":
      return "Short answer";
    case "long_text":
      return "Long answer";
    case "rating":
      return "Rating";
  }
}
