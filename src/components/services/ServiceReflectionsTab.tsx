"use client";

/**
 * ServiceReflectionsTab — timeline of educator reflections for a service.
 *
 * - Cards grouped implicitly by date (createdAt-desc order)
 * - FilterBar: type / QA / author
 * - "New reflection" CTA opens a create modal
 * - QA multi-select chip row in the create modal
 * - Mood tag emoji
 *
 * Gated in the Services detail page under Compliance → Reflections.
 */

import { useMemo, useState } from "react";
import { Plus, Target, Smile, Meh, Frown } from "lucide-react";
import { cn } from "@/lib/utils";
import { FilterBar } from "@/components/ui/v2/FilterBar";
import {
  useReflections,
  useCreateReflection,
  type ReflectionItem,
} from "@/hooks/useReflections";
import { useReflectionAiContext } from "@/hooks/useAiContext";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/Dialog";
import { AiButton } from "@/components/ui/AiButton";

const QA_OPTIONS: readonly { value: number; label: string }[] = [
  { value: 1, label: "QA1 · Educational program" },
  { value: 2, label: "QA2 · Health & safety" },
  { value: 3, label: "QA3 · Physical environment" },
  { value: 4, label: "QA4 · Staffing" },
  { value: 5, label: "QA5 · Relationships" },
  { value: 6, label: "QA6 · Family partnerships" },
  { value: 7, label: "QA7 · Governance" },
];

const TYPE_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "critical", label: "Critical" },
  { value: "team", label: "Team" },
];

const QA_FILTER_OPTIONS = [
  { value: "all", label: "All QAs" },
  ...QA_OPTIONS.map((q) => ({
    value: String(q.value),
    label: `QA${q.value}`,
  })),
];

export function ServiceReflectionsTab({ serviceId }: { serviceId: string }) {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [qaFilter, setQaFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);

  const filters = useMemo(
    () => ({
      type:
        typeFilter !== "all"
          ? (typeFilter as ReflectionItem["type"])
          : undefined,
      qa: qaFilter !== "all" ? Number(qaFilter) : undefined,
    }),
    [typeFilter, qaFilter],
  );

  const { data, isLoading } = useReflections(serviceId, filters);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-heading font-semibold text-[color:var(--color-muted)] uppercase tracking-[0.08em]">
          Reflections
        </h2>
        <BrandButton onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" />
          New reflection
        </BrandButton>
      </div>

      <FilterBar
        filters={[
          { key: "type", label: "Type", options: TYPE_OPTIONS },
          { key: "qa", label: "QA", options: QA_FILTER_OPTIONS },
        ]}
        values={{ type: typeFilter, qa: qaFilter }}
        onChange={(k, v) => {
          if (k === "type") setTypeFilter(v);
          if (k === "qa") setQaFilter(v);
        }}
        onReset={() => {
          setTypeFilter("all");
          setQaFilter("all");
        }}
      />

      {isLoading ? (
        <div className="text-sm text-[color:var(--color-muted)] py-6">
          Loading reflections…
        </div>
      ) : !data?.items || data.items.length === 0 ? (
        <EmptyReflections onCreate={() => setCreateOpen(true)} />
      ) : (
        <ul className="space-y-3">
          {data.items.map((r) => (
            <ReflectionCard key={r.id} reflection={r} />
          ))}
        </ul>
      )}

      {createOpen && (
        <CreateReflectionDialog
          serviceId={serviceId}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </div>
  );
}

function EmptyReflections({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] bg-[color:var(--color-cream-soft)]",
        "border border-dashed border-[color:var(--color-border)] p-8 text-center",
      )}
    >
      <Target className="w-8 h-8 mx-auto text-[color:var(--color-brand)]/60 mb-2" />
      <p className="text-sm font-medium text-[color:var(--color-foreground)]">
        No reflections yet
      </p>
      <p className="text-xs text-[color:var(--color-muted)] mt-1 mb-4">
        Weekly or critical reflections help surface what's working and what to
        change.
      </p>
      <BrandButton onClick={onCreate}>Write your first reflection</BrandButton>
    </div>
  );
}

function BrandButton({
  children,
  onClick,
  disabled,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 px-4 py-2 rounded-[var(--radius-sm)]",
        // 44px min height — tablet tap target. Educators on iPad shouldn't
        // need to aim.
        "min-h-[44px]",
        "bg-[color:var(--color-brand)] text-white text-[13px] font-medium",
        "hover:bg-[color:var(--color-brand-hover)] transition-colors",
        "disabled:opacity-50 disabled:cursor-not-allowed",
      )}
    >
      {children}
    </button>
  );
}

function MoodIcon({ mood }: { mood: ReflectionItem["mood"] }) {
  if (mood === "positive") return <Smile className="w-3.5 h-3.5 text-emerald-600" />;
  if (mood === "neutral") return <Meh className="w-3.5 h-3.5 text-amber-600" />;
  if (mood === "concern") return <Frown className="w-3.5 h-3.5 text-rose-600" />;
  return null;
}

function ReflectionCard({ reflection }: { reflection: ReflectionItem }) {
  const date = new Date(reflection.createdAt);
  return (
    <li
      className={cn(
        "warm-card-dense p-3",
        "border border-[color:var(--color-border)]",
      )}
    >
      <header className="flex items-start gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] uppercase tracking-wide font-semibold text-[color:var(--color-brand)]">
              {reflection.type}
            </span>
            <MoodIcon mood={reflection.mood} />
            <span className="text-[11px] text-[color:var(--color-muted)]">
              {reflection.author.name} ·{" "}
              {date.toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
              })}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-[color:var(--color-foreground)] mt-0.5">
            {reflection.title}
          </h3>
        </div>
      </header>
      <p className="text-[13px] text-[color:var(--color-foreground)]/80 whitespace-pre-wrap">
        {reflection.content}
      </p>
      {reflection.qualityAreas.length > 0 && (
        <div className="mt-2 flex gap-1 flex-wrap">
          {reflection.qualityAreas.map((qa) => (
            <span
              key={qa}
              className={cn(
                "text-[10px] font-medium px-1.5 py-0.5 rounded-[var(--radius-xs)]",
                "bg-[color:var(--color-brand-soft)] text-[color:var(--color-brand)]",
              )}
            >
              QA{qa}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

function CreateReflectionDialog({
  serviceId,
  onClose,
}: {
  serviceId: string;
  onClose: () => void;
}) {
  const create = useCreateReflection(serviceId);
  // Lazy — fires once when the dialog opens, then served from cache for any
  // re-clicks of "Draft with AI" within 5 minutes.
  const { data: aiContext } = useReflectionAiContext(serviceId);
  const [type, setType] = useState<ReflectionItem["type"]>("weekly");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [qa, setQa] = useState<number[]>([]);
  const [mood, setMood] = useState<ReflectionItem["mood"]>("neutral");

  const valid = title.trim().length > 0 && content.trim().length > 0;

  async function submit() {
    if (!valid) return;
    await create.mutateAsync({
      type,
      title: title.trim(),
      content: content.trim(),
      qualityAreas: qa,
      mood,
    });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogTitle className="text-base font-semibold text-[color:var(--color-foreground)] mb-4">
          New reflection
        </DialogTitle>
        <div className="space-y-3">
        <Field label="Type">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ReflectionItem["type"])}
            className="w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2.5 text-sm bg-[color:var(--color-cream-deep)] min-h-[44px]"
          >
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="critical">Critical incident</option>
            <option value="team">Team reflection</option>
          </select>
        </Field>

        <Field label="Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What's this reflection about?"
            className="w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2.5 text-sm bg-[color:var(--color-cream-deep)] min-h-[44px]"
          />
        </Field>

        <Field label="Reflection">
          <div className="space-y-1.5">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              placeholder="What happened, what went well, what would you change?"
              className="w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2.5 text-sm bg-[color:var(--color-cream-deep)] resize-y"
            />
            <div className="flex justify-end">
              <AiButton
                size="sm"
                templateSlug="nqs/reflection-draft"
                section="reflections"
                metadata={{ serviceId, type }}
                variables={{
                  serviceName: aiContext?.serviceName ?? "this service",
                  weekSummary:
                    aiContext?.weekSummary ??
                    "(loading attendance summary…)",
                  recentObservations:
                    aiContext?.recentObservations ??
                    "(loading recent observations…)",
                  recentIncidents:
                    aiContext?.recentIncidents ??
                    "(loading recent incidents…)",
                  recentAudits:
                    aiContext?.recentAudits ??
                    "(loading recent audits…)",
                  reflectionType: type,
                }}
                onResult={(text) => setContent(text)}
                label="Draft with AI"
                disabled={!title.trim()}
              />
            </div>
          </div>
        </Field>

        <Field label="Quality areas">
          <div className="flex flex-wrap gap-1">
            {QA_OPTIONS.map((q) => {
              const active = qa.includes(q.value);
              return (
                <button
                  type="button"
                  key={q.value}
                  onClick={() =>
                    setQa((prev) =>
                      prev.includes(q.value)
                        ? prev.filter((x) => x !== q.value)
                        : [...prev, q.value],
                    )
                  }
                  className={cn(
                    "px-2 py-1 rounded-[var(--radius-sm)] text-[12px] font-medium border transition-colors",
                    active
                      ? "bg-[color:var(--color-brand)] text-white border-[color:var(--color-brand)]"
                      : "bg-[color:var(--color-cream-deep)] text-[color:var(--color-muted)] border-[color:var(--color-border)]",
                  )}
                >
                  QA{q.value}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Mood">
          <div className="flex gap-2">
            {(
              [
                { v: "positive", icon: Smile, label: "Positive" },
                { v: "neutral", icon: Meh, label: "Neutral" },
                { v: "concern", icon: Frown, label: "Concern" },
              ] as const
            ).map(({ v, icon: Icon, label }) => (
              <button
                key={v}
                type="button"
                onClick={() => setMood(v)}
                className={cn(
                  "flex items-center gap-1 px-3 py-1.5 rounded-[var(--radius-sm)] text-[13px] font-medium border",
                  mood === v
                    ? "bg-[color:var(--color-brand-soft)] text-[color:var(--color-brand)] border-[color:var(--color-brand)]/20"
                    : "bg-[color:var(--color-cream-deep)] text-[color:var(--color-muted)] border-[color:var(--color-border)]",
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 text-sm font-medium text-[color:var(--color-muted)]"
          >
            Cancel
          </button>
          <BrandButton
            onClick={submit}
            disabled={!valid || create.isPending}
          >
            {create.isPending ? "Saving…" : "Save reflection"}
          </BrandButton>
        </div>
      </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-muted)] mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
