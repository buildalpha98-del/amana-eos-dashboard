"use client";

/**
 * SurveyBuilder — create + edit a survey.
 *
 * One form covers title, description, anonymity, audience, closing
 * date, and the ordered question list. Question edits are additive:
 * a "Question card" per row with an inline type picker + up/down
 * reorder + delete. Options for choice questions are edited inline
 * as text inputs, one per line.
 *
 * PATCH replaces questions wholesale on the server, so the client
 * always sends the entire current list. That means the server
 * rejects question edits once responses exist — a limitation the UI
 * surfaces as a red banner when relevant.
 */

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  Lock,
  Users,
  AlertTriangle,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  useCreateSurvey,
  useUpdateSurvey,
  useSurvey,
  type QuestionInput,
} from "@/hooks/useSurveys";
import { fetchApi } from "@/lib/fetch-api";
import type {
  EmploymentType,
  Role,
  SurveyAudience,
  SurveyQuestionType,
} from "@prisma/client";

const QUESTION_TYPES: { value: SurveyQuestionType; label: string }[] = [
  { value: "yes_no", label: "Yes / No" },
  { value: "single_choice", label: "Multiple choice (pick one)" },
  { value: "multi_choice", label: "Checkbox (pick many)" },
  { value: "short_text", label: "Short answer" },
  { value: "long_text", label: "Long answer" },
  { value: "rating", label: "Rating (1–5)" },
];

const AUDIENCE_OPTIONS: { value: SurveyAudience; label: string }[] = [
  { value: "all_staff", label: "All active staff" },
  { value: "by_role", label: "By role" },
  { value: "by_service", label: "By centre" },
  { value: "by_employment_type", label: "By employment type" },
];

const ROLE_OPTIONS: Role[] = [
  "owner",
  "head_office",
  "admin",
  "marketing",
  "member",
  "staff",
];
const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  head_office: "State Manager",
  admin: "Admin",
  marketing: "Marketing",
  member: "Director of Service",
  staff: "Educator",
  eos_viewer: "EOS Viewer",
  eos_implementer: "EOS Implementer",
};

const EMPLOYMENT_TYPE_OPTIONS: EmploymentType[] = [
  "casual",
  "part_time",
  "permanent",
  "fixed_term",
];
const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  casual: "Casual",
  part_time: "Part-time",
  permanent: "Full-time / Permanent",
  fixed_term: "Fixed-term",
};

interface Props {
  surveyId?: string;
  onDone: () => void;
  onCancel: () => void;
}

export function SurveyBuilder({ surveyId, onDone, onCancel }: Props) {
  const editing = !!surveyId;
  const { data: existing, isLoading: loadingExisting } = useSurvey(
    surveyId ?? null,
  );
  const create = useCreateSurvey();
  const update = useUpdateSurvey(surveyId ?? "");
  const { data: services } = useQuery<
    { id: string; name: string; code: string }[]
  >({
    queryKey: ["services-list"],
    queryFn: () => fetchApi("/api/services/public-list"),
    staleTime: 5 * 60_000,
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [audience, setAudience] = useState<SurveyAudience>("all_staff");
  const [roles, setRoles] = useState<Role[]>([]);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [empTypes, setEmpTypes] = useState<EmploymentType[]>([]);
  const [closesAt, setClosesAt] = useState("");
  const [questions, setQuestions] = useState<QuestionInput[]>([]);

  // Seed form from existing survey when editing.
  useEffect(() => {
    if (!existing) return;
    setTitle(existing.title);
    setDescription(existing.description ?? "");
    setAnonymous(existing.anonymous);
    setAudience(existing.audience);
    setRoles(existing.audienceRoles);
    setServiceIds(existing.audienceServiceIds);
    setEmpTypes(existing.audienceEmploymentTypes);
    setClosesAt(existing.closesAt ? existing.closesAt.slice(0, 10) : "");
    setQuestions(
      existing.questions.map((q) => ({
        type: q.type,
        title: q.title,
        description: q.description,
        required: q.required,
        options: q.options,
        sortOrder: q.sortOrder,
      })),
    );
  }, [existing]);

  const editLocked = useMemo(
    () => !!existing && (existing._count?.responses ?? 0) > 0,
    [existing],
  );

  const addQuestion = () => {
    setQuestions((qs) => [
      ...qs,
      {
        type: "short_text",
        title: "",
        description: "",
        required: true,
        options: [],
        sortOrder: qs.length,
      },
    ]);
  };

  const updateQuestion = (i: number, patch: Partial<QuestionInput>) => {
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  };

  const moveQuestion = (i: number, delta: number) => {
    setQuestions((qs) => {
      const next = [...qs];
      const to = i + delta;
      if (to < 0 || to >= next.length) return qs;
      [next[i], next[to]] = [next[to], next[i]];
      return next.map((q, idx) => ({ ...q, sortOrder: idx }));
    });
  };

  const removeQuestion = (i: number) => {
    setQuestions((qs) => qs.filter((_, idx) => idx !== i).map((q, idx) => ({ ...q, sortOrder: idx })));
  };

  const canSave =
    title.trim().length > 0 &&
    questions.length > 0 &&
    questions.every(
      (q) =>
        q.title.trim().length > 0 &&
        ((q.type !== "single_choice" && q.type !== "multi_choice") ||
          (q.options && q.options.filter((o) => o.trim()).length >= 2)),
    );

  const handleSave = () => {
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      anonymous,
      audience,
      audienceRoles: roles,
      audienceServiceIds: serviceIds,
      audienceEmploymentTypes: empTypes,
      closesAt: closesAt ? new Date(closesAt).toISOString() : null,
      questions: questions.map((q, i) => ({
        ...q,
        sortOrder: i,
        options:
          q.type === "single_choice" || q.type === "multi_choice"
            ? (q.options ?? []).filter((o) => o.trim())
            : [],
      })),
    };
    if (editing) {
      update.mutate(payload, { onSuccess: onDone });
    } else {
      create.mutate(payload, { onSuccess: onDone });
    }
  };

  if (editing && loadingExisting) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to surveys
        </button>
      </div>

      {editLocked && (
        <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm text-amber-900 dark:text-amber-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            This survey already has responses. You can edit the title,
            description, audience, and closing date — but the question
            list is locked. Close this survey and clone it if you need to
            restructure.
          </span>
        </div>
      )}

      {/* Meta */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            placeholder="e.g. Q3 2026 culture check-in"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Description (optional)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            placeholder="Short blurb shown to respondents at the top of the survey."
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
              className="mt-1"
            />
            <div>
              <p className="text-sm font-medium text-foreground inline-flex items-center gap-1">
                <Lock className="w-3.5 h-3.5" /> Anonymous responses
              </p>
              <p className="text-xs text-muted mt-0.5">
                Respondent identity is stripped before storage. Best for
                honest satisfaction / culture feedback.
              </p>
            </div>
          </label>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Closes on (optional)
            </label>
            <input
              type="date"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            />
          </div>
        </div>

        {/* Audience */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1 inline-flex items-center gap-1">
            <Users className="w-3.5 h-3.5" /> Send to
          </label>
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value as SurveyAudience)}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand bg-card"
          >
            {AUDIENCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          {audience === "by_role" && (
            <div className="mt-3 flex flex-wrap gap-2">
              {ROLE_OPTIONS.map((r) => {
                const on = roles.includes(r);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() =>
                      setRoles((prev) =>
                        on ? prev.filter((x) => x !== r) : [...prev, r],
                      )
                    }
                    className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                      on
                        ? "bg-brand text-white border-brand"
                        : "border-border text-muted hover:bg-surface"
                    }`}
                  >
                    {ROLE_LABELS[r] || r}
                  </button>
                );
              })}
            </div>
          )}

          {audience === "by_service" && (
            <div className="mt-3 flex flex-wrap gap-2">
              {(services ?? []).map((s) => {
                const on = serviceIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() =>
                      setServiceIds((prev) =>
                        on ? prev.filter((x) => x !== s.id) : [...prev, s.id],
                      )
                    }
                    className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                      on
                        ? "bg-brand text-white border-brand"
                        : "border-border text-muted hover:bg-surface"
                    }`}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
          )}

          {audience === "by_employment_type" && (
            <div className="mt-3 flex flex-wrap gap-2">
              {EMPLOYMENT_TYPE_OPTIONS.map((t) => {
                const on = empTypes.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() =>
                      setEmpTypes((prev) =>
                        on ? prev.filter((x) => x !== t) : [...prev, t],
                      )
                    }
                    className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                      on
                        ? "bg-brand text-white border-brand"
                        : "border-border text-muted hover:bg-surface"
                    }`}
                  >
                    {EMPLOYMENT_TYPE_LABELS[t]}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Questions */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Questions</h3>
          <span className="text-xs text-muted">
            {questions.length} question{questions.length === 1 ? "" : "s"}
          </span>
        </div>

        {questions.length === 0 && (
          <p className="text-sm text-muted italic">
            No questions yet. Click &quot;Add question&quot; below.
          </p>
        )}

        {questions.map((q, i) => (
          <QuestionEditor
            key={i}
            index={i}
            question={q}
            disabled={editLocked}
            onChange={(patch) => updateQuestion(i, patch)}
            onMoveUp={() => moveQuestion(i, -1)}
            onMoveDown={() => moveQuestion(i, 1)}
            onRemove={() => removeQuestion(i)}
            canMoveUp={i > 0}
            canMoveDown={i < questions.length - 1}
          />
        ))}

        <button
          type="button"
          onClick={addQuestion}
          disabled={editLocked}
          className="w-full inline-flex items-center justify-center gap-1 px-3 py-2 text-sm font-medium text-brand border-2 border-dashed border-brand/30 rounded-md hover:bg-brand/5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" />
          Add question
        </button>
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
          onClick={handleSave}
          disabled={!canSave || create.isPending || update.isPending}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {(create.isPending || update.isPending) && (
            <Loader2 className="w-4 h-4 animate-spin" />
          )}
          {editing ? "Save changes" : "Create draft"}
        </button>
      </div>
    </div>
  );
}

function QuestionEditor({
  index,
  question,
  disabled,
  onChange,
  onMoveUp,
  onMoveDown,
  onRemove,
  canMoveUp,
  canMoveDown,
}: {
  index: number;
  question: QuestionInput;
  disabled: boolean;
  onChange: (patch: Partial<QuestionInput>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const needsOptions =
    question.type === "single_choice" || question.type === "multi_choice";
  const options = question.options ?? [];

  return (
    <div className="rounded-lg border border-border/70 bg-surface/30 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-muted w-6">
          Q{index + 1}
        </span>
        <select
          value={question.type}
          onChange={(e) =>
            onChange({
              type: e.target.value as SurveyQuestionType,
              // Wipe options when leaving a choice type
              options:
                e.target.value === "single_choice" ||
                e.target.value === "multi_choice"
                  ? options.length === 0
                    ? ["", ""]
                    : options
                  : [],
            })
          }
          disabled={disabled}
          className="text-xs px-2 py-1 border border-border rounded bg-card disabled:opacity-50"
        >
          {QUESTION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <label className="text-xs text-muted inline-flex items-center gap-1 ml-2">
          <input
            type="checkbox"
            checked={question.required ?? true}
            onChange={(e) => onChange({ required: e.target.checked })}
            disabled={disabled}
          />
          Required
        </label>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp || disabled}
            className="p-1 text-muted hover:text-foreground disabled:opacity-30"
            title="Move up"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown || disabled}
            className="p-1 text-muted hover:text-foreground disabled:opacity-30"
            title="Move down"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded disabled:opacity-30"
            title="Remove question"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <input
        type="text"
        value={question.title}
        onChange={(e) => onChange({ title: e.target.value })}
        disabled={disabled}
        placeholder="Question text (required)"
        className="w-full px-2.5 py-1.5 text-sm border border-border rounded focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand disabled:opacity-60"
      />
      <input
        type="text"
        value={question.description ?? ""}
        onChange={(e) => onChange({ description: e.target.value })}
        disabled={disabled}
        placeholder="Description / helper text (optional)"
        className="w-full px-2.5 py-1.5 text-xs border border-border rounded focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand disabled:opacity-60"
      />

      {needsOptions && (
        <div className="pl-6 space-y-1.5">
          {options.map((opt, oi) => (
            <div key={oi} className="flex items-center gap-2">
              <span className="text-xs text-muted w-4">{oi + 1}.</span>
              <input
                type="text"
                value={opt}
                onChange={(e) => {
                  const next = [...options];
                  next[oi] = e.target.value;
                  onChange({ options: next });
                }}
                disabled={disabled}
                placeholder={`Option ${oi + 1}`}
                className="flex-1 px-2.5 py-1 text-sm border border-border rounded focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() =>
                  onChange({ options: options.filter((_, x) => x !== oi) })
                }
                disabled={disabled || options.length <= 2}
                className="p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded disabled:opacity-30"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange({ options: [...options, ""] })}
            disabled={disabled}
            className="text-xs text-brand hover:underline pl-6"
          >
            + Add option
          </button>
        </div>
      )}
    </div>
  );
}
