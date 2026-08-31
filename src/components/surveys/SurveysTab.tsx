"use client";

/**
 * SurveysTab — the "Surveys" sub-tab on /onboarding (Staff Lifecycle).
 *
 * Landing view lists every survey (draft / published / closed) as a
 * card. Buttons: Create survey → opens SurveyBuilder in create mode.
 * Clicking a card opens the survey detail (builder in edit mode +
 * results panel).
 *
 * Sub-modes are driven by local state — no separate route needed.
 */

import { useState } from "react";
import { Plus, ClipboardList, Users, Lock, Loader2, Send } from "lucide-react";
import {
  useSurveys,
  useDeleteSurvey,
  usePublishSurvey,
  useCloseSurvey,
  useResendSurvey,
  type SurveyListItem,
} from "@/hooks/useSurveys";
import { SurveyBuilder } from "./SurveyBuilder";
import { SurveyResultsPanel } from "./SurveyResultsPanel";
import { EmptyState } from "@/components/ui/EmptyState";

type View =
  | { kind: "list" }
  | { kind: "create" }
  | { kind: "edit"; surveyId: string }
  | { kind: "results"; surveyId: string };

export function SurveysTab() {
  const [view, setView] = useState<View>({ kind: "list" });

  if (view.kind === "create") {
    return (
      <SurveyBuilder
        onDone={() => setView({ kind: "list" })}
        onCancel={() => setView({ kind: "list" })}
      />
    );
  }
  if (view.kind === "edit") {
    return (
      <SurveyBuilder
        surveyId={view.surveyId}
        onDone={() => setView({ kind: "list" })}
        onCancel={() => setView({ kind: "list" })}
      />
    );
  }
  if (view.kind === "results") {
    return (
      <SurveyResultsPanel
        surveyId={view.surveyId}
        onBack={() => setView({ kind: "list" })}
      />
    );
  }

  return (
    <SurveyList
      onCreate={() => setView({ kind: "create" })}
      onEdit={(id) => setView({ kind: "edit", surveyId: id })}
      onResults={(id) => setView({ kind: "results", surveyId: id })}
    />
  );
}

function SurveyList({
  onCreate,
  onEdit,
  onResults,
}: {
  onCreate: () => void;
  onEdit: (id: string) => void;
  onResults: (id: string) => void;
}) {
  const { data, isLoading, error } = useSurveys();
  const del = useDeleteSurvey();
  const publish = usePublishSurvey();
  const close = useCloseSurvey();
  const resend = useResendSurvey();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted" />
      </div>
    );
  }
  if (error) {
    return (
      <p className="text-sm text-danger">
        Couldn&apos;t load surveys — {(error as Error).message}
      </p>
    );
  }
  const surveys = data?.surveys ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Surveys</h2>
          <p className="text-sm text-muted">
            Build and distribute surveys to staff — feedback, culture check-ins,
            training follow-ups, anything.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90"
        >
          <Plus className="w-4 h-4" />
          New survey
        </button>
      </div>

      {surveys.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No surveys yet"
          description="Create your first survey — mix yes/no, multiple choice, rating, and open-text questions like a Microsoft Forms."
          action={{ label: "New survey", onClick: onCreate }}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {surveys.map((s) => (
            <SurveyCard
              key={s.id}
              survey={s}
              onEdit={() => onEdit(s.id)}
              onResults={() => onResults(s.id)}
              onDelete={() => {
                if (
                  confirm(
                    `Delete "${s.title}"? This soft-deletes the survey and all responses.`,
                  )
                )
                  del.mutate(s.id);
              }}
              onPublish={() => publish.mutate(s.id)}
              onClose={() => close.mutate(s.id)}
              onResend={() => {
                if (
                  confirm(
                    `Send a reminder to everyone in "${s.title}" who hasn't responded yet?`,
                  )
                )
                  resend.mutate(s.id);
              }}
              actionsBusy={
                publish.isPending ||
                close.isPending ||
                del.isPending ||
                resend.isPending
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SurveyCard({
  survey,
  onEdit,
  onResults,
  onDelete,
  onPublish,
  onClose,
  onResend,
  actionsBusy,
}: {
  survey: SurveyListItem;
  onEdit: () => void;
  onResults: () => void;
  onDelete: () => void;
  onPublish: () => void;
  onClose: () => void;
  onResend: () => void;
  actionsBusy: boolean;
}) {
  const statusColor: Record<string, string> = {
    draft: "bg-surface text-muted border-border",
    published: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    closed: "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800",
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={survey._count?.responses ? onResults : onEdit}
          className="text-left flex-1 min-w-0"
        >
          <p className="font-semibold text-foreground truncate">{survey.title}</p>
          {survey.description && (
            <p className="text-xs text-muted mt-0.5 line-clamp-2">
              {survey.description}
            </p>
          )}
        </button>
        <span
          className={`shrink-0 text-2xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${statusColor[survey.status]}`}
        >
          {survey.status}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
        <span className="inline-flex items-center gap-1">
          <ClipboardList className="w-3 h-3" />
          {survey._count?.questions ?? 0} question
          {survey._count?.questions === 1 ? "" : "s"}
        </span>
        <span className="inline-flex items-center gap-1">
          <Users className="w-3 h-3" />
          {survey._count?.responses ?? 0} response
          {survey._count?.responses === 1 ? "" : "s"}
        </span>
        {survey.anonymous && (
          <span className="inline-flex items-center gap-1 text-blue-700">
            <Lock className="w-3 h-3" />
            Anonymous
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-1 border-t border-border/60">
        {survey.status === "draft" && (
          <>
            <button
              type="button"
              onClick={onEdit}
              className="text-xs px-2.5 py-1 rounded border border-border hover:bg-surface"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={onPublish}
              disabled={actionsBusy || (survey._count?.questions ?? 0) === 0}
              className="text-xs px-2.5 py-1 rounded bg-brand text-white hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Publish
            </button>
          </>
        )}
        {survey.status === "published" && (
          <>
            <button
              type="button"
              onClick={onEdit}
              className="text-xs px-2.5 py-1 rounded border border-border hover:bg-surface"
              title={
                (survey._count?.responses ?? 0) > 0
                  ? "Title, description, audience, and closing date can be edited. Questions are locked once responses exist."
                  : undefined
              }
            >
              Edit
            </button>
            <button
              type="button"
              onClick={onResults}
              className="text-xs px-2.5 py-1 rounded border border-border hover:bg-surface"
            >
              View results
            </button>
            {!survey.anonymous && (
              <button
                type="button"
                onClick={onResend}
                disabled={actionsBusy}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded border border-brand/30 text-brand hover:bg-brand/5 disabled:opacity-50"
                title="Nudge everyone in the audience who hasn't responded yet"
              >
                <Send className="w-3 h-3" />
                Resend
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={actionsBusy}
              className="text-xs px-2.5 py-1 rounded border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-950/40 disabled:opacity-50"
            >
              Close
            </button>
          </>
        )}
        {survey.status === "closed" && (
          <button
            type="button"
            onClick={onResults}
            className="text-xs px-2.5 py-1 rounded border border-border hover:bg-surface"
          >
            View results
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          disabled={actionsBusy}
          className="ml-auto text-xs px-2.5 py-1 rounded text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
