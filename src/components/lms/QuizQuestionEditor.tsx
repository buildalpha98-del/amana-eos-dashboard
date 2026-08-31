"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Save, X, CheckCircle2, Loader2 } from "lucide-react";
import {
  useModuleQuestions,
  useSaveQuizQuestion,
  useDeleteQuizQuestion,
} from "@/hooks/useQuiz";

type Draft = {
  id?: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

const emptyDraft = (): Draft => ({
  question: "",
  options: ["", ""],
  correctIndex: 0,
  explanation: "",
});

/**
 * In-dashboard editor for a quiz module's questions. Wired to the server-scored
 * quiz API (LMSQuizQuestion). Authors write the question, 2–6 options, mark the
 * correct one, and add an explanation shown after answering. 80% pass, shuffled
 * per attempt, correct answers never sent to the learner's browser.
 */
export function QuizQuestionEditor({ moduleId }: { moduleId: string }) {
  const { data: questions, isLoading } = useModuleQuestions(moduleId);
  const save = useSaveQuizQuestion();
  const del = useDeleteQuizQuestion(moduleId);
  const [draft, setDraft] = useState<Draft | null>(null);

  function startNew() {
    setDraft(emptyDraft());
  }
  function startEdit(q: NonNullable<typeof questions>[number]) {
    setDraft({
      id: q.id,
      question: q.question,
      options: [...q.options],
      correctIndex: q.correctIndex,
      explanation: q.explanation ?? "",
    });
  }

  async function handleSave() {
    if (!draft) return;
    const options = draft.options.map((o) => o.trim()).filter(Boolean);
    if (!draft.question.trim() || options.length < 2) return;
    const correctIndex = Math.min(draft.correctIndex, options.length - 1);
    await save.mutateAsync({
      id: draft.id,
      moduleId,
      question: draft.question.trim(),
      options,
      correctIndex,
      explanation: draft.explanation.trim() || null,
      sortOrder: draft.id ? undefined : (questions?.length ?? 0),
    });
    setDraft(null);
  }

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-50/40 p-3 space-y-3 dark:bg-amber-500/5">
      <div className="flex items-center justify-between">
        <h5 className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
          Quiz questions {questions ? `(${questions.length})` : ""}
        </h5>
        {!draft && (
          <button
            type="button"
            onClick={startNew}
            className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-hover"
          >
            <Plus className="h-3.5 w-3.5" />
            Add question
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="text-xs text-muted">Loading questions…</p>
      ) : (
        <ul className="space-y-2">
          {(questions ?? []).map((q, qi) => (
            <li key={q.id} className="rounded-md border border-border bg-card p-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-foreground">
                  {qi + 1}. {q.question}
                </p>
                <div className="flex shrink-0 gap-1">
                  <button type="button" aria-label="Edit question" onClick={() => startEdit(q)} className="p-1 text-muted hover:text-brand">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" aria-label="Delete question" onClick={() => del.mutate(q.id)} className="p-1 text-muted hover:text-red-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <ul className="mt-1 space-y-0.5">
                {q.options.map((opt, oi) => (
                  <li key={oi} className={`flex items-center gap-1.5 text-xs ${oi === q.correctIndex ? "font-medium text-green-700 dark:text-green-400" : "text-muted"}`}>
                    {oi === q.correctIndex ? <CheckCircle2 className="h-3 w-3" /> : <span className="inline-block h-3 w-3" />}
                    {opt}
                  </li>
                ))}
              </ul>
              {q.explanation && <p className="mt-1 text-xs italic text-muted">{q.explanation}</p>}
            </li>
          ))}
          {questions && questions.length === 0 && !draft && (
            <li className="text-xs italic text-muted">No questions yet — add at least a few for a meaningful check.</li>
          )}
        </ul>
      )}

      {draft && (
        <div className="rounded-md border border-brand/30 bg-card p-3 space-y-2">
          <textarea
            value={draft.question}
            onChange={(e) => setDraft({ ...draft, question: e.target.value })}
            rows={2}
            placeholder="Question…"
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none"
          />
          <div className="space-y-1.5">
            {draft.options.map((opt, oi) => (
              <div key={oi} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="correct"
                  checked={draft.correctIndex === oi}
                  onChange={() => setDraft({ ...draft, correctIndex: oi })}
                  className="text-brand focus:ring-brand"
                  aria-label={`Mark option ${oi + 1} correct`}
                />
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => {
                    const options = [...draft.options];
                    options[oi] = e.target.value;
                    setDraft({ ...draft, options });
                  }}
                  placeholder={`Option ${oi + 1}${draft.correctIndex === oi ? " (correct)" : ""}`}
                  className="flex-1 rounded-lg border border-border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                />
                {draft.options.length > 2 && (
                  <button
                    type="button"
                    aria-label="Remove option"
                    onClick={() => {
                      const options = draft.options.filter((_, i) => i !== oi);
                      const correctIndex = draft.correctIndex >= options.length ? 0 : draft.correctIndex;
                      setDraft({ ...draft, options, correctIndex });
                    }}
                    className="p-1 text-muted hover:text-red-500"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
            {draft.options.length < 6 && (
              <button
                type="button"
                onClick={() => setDraft({ ...draft, options: [...draft.options, ""] })}
                className="text-xs text-brand hover:text-brand-hover"
              >
                + Add option
              </button>
            )}
          </div>
          <p className="text-2xs text-muted">Select the radio next to the correct answer.</p>
          <textarea
            value={draft.explanation}
            onChange={(e) => setDraft({ ...draft, explanation: e.target.value })}
            rows={2}
            placeholder="Explanation (shown after answering)…"
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDraft(null)} className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-surface">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!draft.question.trim() || draft.options.filter((o) => o.trim()).length < 2 || save.isPending}
              className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand-hover disabled:opacity-50"
            >
              {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {draft.id ? "Save question" : "Add question"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
