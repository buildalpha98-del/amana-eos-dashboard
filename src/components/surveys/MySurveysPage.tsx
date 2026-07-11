"use client";

/**
 * Staff-facing "My Surveys" page — lists published surveys the current
 * user is in the audience for and lets them take one. Clicking a card
 * opens an inline TakeSurveyForm. On submit → the row flips to a
 * "Submitted" state.
 *
 * Not to be confused with the admin builder at /onboarding → Surveys
 * (SurveysTab). This is the surface every logged-in user reaches.
 */

import { useState } from "react";
import {
  ClipboardList,
  Loader2,
  CheckCircle2,
  Lock,
  Clock,
} from "lucide-react";
import { useMySurveys, type SurveyListItem } from "@/hooks/useSurveys";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { TakeSurveyForm } from "./TakeSurveyForm";

export function MySurveysPage() {
  const { data, isLoading, error } = useMySurveys();
  const [activeSurveyId, setActiveSurveyId] = useState<string | null>(null);

  if (activeSurveyId) {
    return (
      <TakeSurveyForm
        surveyId={activeSurveyId}
        onDone={() => setActiveSurveyId(null)}
        onCancel={() => setActiveSurveyId(null)}
      />
    );
  }

  const surveys = data?.surveys ?? [];

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <PageHeader
        title="My Surveys"
        description="Surveys sent to you. Anonymous ones don't record your identity — feel free to be honest."
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted" />
        </div>
      ) : error ? (
        <p className="text-sm text-danger">
          Couldn&apos;t load surveys — {(error as Error).message}
        </p>
      ) : surveys.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No surveys for you right now"
          description="When your leader or head office sends a survey to your role, service, or the whole team, it'll show up here."
        />
      ) : (
        <div className="space-y-2">
          {surveys.map((s) => (
            <SurveyCard
              key={s.id}
              survey={s}
              onTake={() => setActiveSurveyId(s.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SurveyCard({
  survey,
  onTake,
}: {
  survey: SurveyListItem;
  onTake: () => void;
}) {
  const responded = survey._iHaveResponded ?? false;
  const closed = survey.status === "closed";
  const overdue = Boolean(
    survey.closesAt && new Date(survey.closesAt) < new Date(),
  );
  const disabled = responded || closed || overdue;

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-start gap-3">
      <div className="mt-1 shrink-0">
        {responded ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
        ) : (
          <ClipboardList className="w-5 h-5 text-brand" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-foreground">{survey.title}</p>
            {survey.description && (
              <p className="text-sm text-muted mt-0.5">{survey.description}</p>
            )}
          </div>
          {survey.anonymous && (
            <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-semibold uppercase">
              <Lock className="w-3 h-3" />
              Anonymous
            </span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <ClipboardList className="w-3 h-3" />
            {(survey.questions?.length ?? 0)} question
            {survey.questions?.length === 1 ? "" : "s"}
          </span>
          {survey.closesAt && (
            <span
              className={`inline-flex items-center gap-1 ${
                overdue ? "text-red-700" : ""
              }`}
            >
              <Clock className="w-3 h-3" />
              {overdue ? "Closed" : "Closes"}{" "}
              {new Date(survey.closesAt).toLocaleDateString("en-AU", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          )}
        </div>

        <div className="mt-3">
          {responded ? (
            <span className="text-xs font-medium text-emerald-700">
              You&apos;ve responded. Thanks.
            </span>
          ) : closed ? (
            <span className="text-xs text-muted italic">
              This survey is closed.
            </span>
          ) : overdue ? (
            <span className="text-xs text-red-700">
              This survey has passed its closing date.
            </span>
          ) : (
            <button
              type="button"
              onClick={onTake}
              disabled={disabled}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Take survey
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
