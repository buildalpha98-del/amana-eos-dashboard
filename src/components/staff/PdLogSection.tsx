"use client";

import { useState } from "react";
import { Plus, Trash2, GraduationCap, ExternalLink, Loader2 } from "lucide-react";
import {
  usePdRecords,
  useCreatePdRecord,
  useDeletePdRecord,
} from "@/hooks/usePdRecords";

const PD_TYPES: { value: string; label: string }[] = [
  { value: "course", label: "Course" },
  { value: "workshop", label: "Workshop" },
  { value: "conference", label: "Conference" },
  { value: "online", label: "Online" },
  { value: "mentoring", label: "Mentoring" },
  { value: "reading", label: "Reading" },
  { value: "other", label: "Other" },
];

function typeLabel(value: string): string {
  return PD_TYPES.find((t) => t.value === value)?.label ?? value;
}

function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function PdLogSection({
  userId,
  canManage,
}: {
  userId: string;
  canManage: boolean;
}) {
  const { data, isLoading } = usePdRecords(userId);
  const createMutation = useCreatePdRecord();
  const deleteMutation = useDeletePdRecord();

  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("course");
  const [hours, setHours] = useState("");
  const [completedAt, setCompletedAt] = useState("");
  const [provider, setProvider] = useState("");
  const [notes, setNotes] = useState("");

  const totalHours = (data ?? []).reduce((sum, r) => sum + r.hours, 0);

  const reset = () => {
    setAdding(false);
    setTitle("");
    setType("course");
    setHours("");
    setCompletedAt("");
    setProvider("");
    setNotes("");
  };

  const handleSubmit = async () => {
    const hoursNum = Number(hours);
    if (!title.trim() || !completedAt || !Number.isFinite(hoursNum) || hoursNum <= 0) {
      return;
    }
    await createMutation.mutateAsync({
      userId,
      title: title.trim(),
      type,
      hours: hoursNum,
      completedAt: new Date(`${completedAt}T00:00:00.000Z`).toISOString(),
      provider: provider.trim() || null,
      notes: notes.trim() || null,
    });
    reset();
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            Professional Development
          </h3>
          <p className="text-xs text-muted mt-0.5">
            Total recorded:{" "}
            <span className="font-medium text-foreground">
              {totalHours.toFixed(2)} hours
            </span>
          </p>
        </div>
        {canManage && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-border text-foreground hover:bg-surface transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add PD entry
          </button>
        )}
      </div>

      {adding && (
        <div className="mb-4 rounded-lg border border-border bg-background p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-muted">
                Title
              </span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. ECA Webinar — Inclusion Practice"
                maxLength={200}
                className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-muted">Type</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              >
                {PD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-muted">
                Hours
              </span>
              <input
                type="number"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                min={0.25}
                step={0.25}
                max={999.99}
                placeholder="2.5"
                className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-muted">
                Completed
              </span>
              <input
                type="date"
                value={completedAt}
                onChange={(e) => setCompletedAt(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs uppercase tracking-wide text-muted">
                Provider (optional)
              </span>
              <input
                type="text"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder="e.g. ACECQA, TAFE NSW"
                maxLength={200}
                className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs uppercase tracking-wide text-muted">
                Notes (optional)
              </span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                maxLength={2000}
                className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm resize-none"
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={reset}
              disabled={createMutation.isPending}
              className="text-sm px-3 py-1.5 rounded-md border border-border text-foreground hover:bg-surface disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={
                createMutation.isPending ||
                !title.trim() ||
                !completedAt ||
                !hours ||
                Number(hours) <= 0
              }
              className="text-sm px-3 py-1.5 rounded-md bg-brand text-white hover:bg-brand/90 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {createMutation.isPending && (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              )}
              Save
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-muted">
          No professional development recorded.
          {canManage && " Add the first entry above."}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {data.map((r) => (
            <li
              key={r.id}
              className="py-3 flex flex-wrap items-start gap-3"
            >
              <GraduationCap className="w-4 h-4 mt-0.5 text-brand flex-shrink-0" />
              <div className="flex-1 min-w-[220px]">
                <div className="text-sm font-medium text-foreground">
                  {r.title}
                </div>
                <div className="text-xs text-muted mt-0.5">
                  {typeLabel(r.type)}
                  {r.provider ? ` · ${r.provider}` : ""}
                  {" · "}
                  {formatDate(r.completedAt)}
                  {" · "}
                  {r.hours.toFixed(2)} hrs
                </div>
                {r.notes && (
                  <p className="text-xs text-muted mt-1 whitespace-pre-wrap">
                    {r.notes}
                  </p>
                )}
              </div>
              {r.attachmentUrl && (
                <a
                  href={r.attachmentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-brand hover:underline inline-flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  Certificate
                </a>
              )}
              {canManage && (
                <button
                  type="button"
                  onClick={() => {
                    if (
                      confirm(
                        `Delete PD entry "${r.title}"? This cannot be undone.`,
                      )
                    ) {
                      deleteMutation.mutate({ userId, recordId: r.id });
                    }
                  }}
                  disabled={deleteMutation.isPending}
                  className="text-xs text-muted hover:text-destructive inline-flex items-center gap-1 disabled:opacity-50"
                  aria-label={`Delete ${r.title}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
