"use client";

/**
 * 1-Year Plan card — EOS-canonical structure.
 *
 *   Future Date · Revenue · Profit · Measurables   (header fields on the VTO)
 *   Goals for the Year — 1..N with a SMART checkbox per goal
 *
 * The numbered goal rows are the existing OneYearGoal[] relation;
 * each goal carries a new boolean `smart` flag the leader ticks
 * when the goal is Specific / Measurable / Achievable / Relevant /
 * Time-bound.
 */

import { useState } from "react";
import {
  Pencil,
  Check,
  X,
  Plus,
  Trash2,
  Calendar,
  TrendingUp,
  DollarSign,
  BarChart3,
  Mountain,
} from "lucide-react";
import {
  useUpdateVTO,
  useCreateGoal,
  useUpdateGoal,
  useDeleteGoal,
  type OneYearGoal,
} from "@/hooks/useVTO";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { UnsavedBadge } from "@/components/ui/UnsavedBadge";
import { cn } from "@/lib/utils";

interface Props {
  vto: {
    id: string;
    oneYearFutureDate: string | null;
    oneYearRevenue: string | null;
    oneYearProfit: string | null;
    oneYearMeasurables: string | null;
    sectionLabels: Record<string, string> | null;
    oneYearGoals: OneYearGoal[];
  };
}

function formatDateForInput(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function formatDateForDisplay(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export function OneYearPlanCard({ vto }: Props) {
  const updateVTO = useUpdateVTO();
  const cardTitle = vto.sectionLabels?.oneYearPlan ?? "1-Year Plan";
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(cardTitle);

  const handleSaveTitle = () => {
    const next = titleDraft.trim();
    if (!next) return;
    updateVTO.mutate({
      sectionLabels: { ...(vto.sectionLabels || {}), oneYearPlan: next },
    });
    setEditingTitle(false);
  };

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/50 bg-surface/50">
        {editingTitle ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              className="flex-1 px-2 py-1 text-sm font-semibold border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveTitle();
                if (e.key === "Escape") setEditingTitle(false);
              }}
            />
            <button
              onClick={handleSaveTitle}
              className="p-1 text-emerald-600 hover:text-emerald-700"
              title="Save title"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setEditingTitle(false)}
              className="p-1 text-muted hover:text-foreground"
              title="Cancel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <h3
            className="text-sm font-semibold text-foreground/80 cursor-pointer hover:text-brand transition-colors"
            onClick={() => {
              setTitleDraft(cardTitle);
              setEditingTitle(true);
            }}
            title="Click to rename"
          >
            {cardTitle}
          </h3>
        )}
      </div>

      <div className="divide-y divide-border/50">
        <DateRow
          label="Future Date"
          icon={Calendar}
          value={vto.oneYearFutureDate}
          formattedDisplay={formatDateForDisplay(vto.oneYearFutureDate)}
          formattedInput={formatDateForInput(vto.oneYearFutureDate)}
        />
        <SingleLineRow
          label="Revenue"
          icon={TrendingUp}
          field="oneYearRevenue"
          value={vto.oneYearRevenue}
          placeholder="e.g. $3.5m"
        />
        <SingleLineRow
          label="Profit"
          icon={DollarSign}
          field="oneYearProfit"
          value={vto.oneYearProfit}
          placeholder="e.g. $750k"
        />
        <BulletListRow
          label="Measurables"
          icon={BarChart3}
          field="oneYearMeasurables"
          value={vto.oneYearMeasurables}
          placeholder={"Explorers: 1,200\nAttendances: 120,000"}
        />
      </div>

      <GoalsList goals={vto.oneYearGoals} vtoId={vto.id} />
    </div>
  );
}

function DateRow({
  label,
  icon: Icon,
  value,
  formattedDisplay,
  formattedInput,
}: {
  label: string;
  icon: typeof Calendar;
  value: string | null;
  formattedDisplay: string;
  formattedInput: string;
}) {
  const updateVTO = useUpdateVTO();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(formattedInput);

  const hasDirty = editing && draft !== formattedInput;
  useUnsavedChanges(hasDirty);

  const handleSave = () => {
    updateVTO.mutate({
      oneYearFutureDate: draft ? new Date(draft).toISOString() : null,
    });
    setEditing(false);
  };

  return (
    <div className="px-5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-brand/10 flex items-center justify-center shrink-0">
            <Icon className="w-3.5 h-3.5 text-brand" />
          </div>
          <p className="text-sm font-semibold text-foreground">{label}</p>
        </div>
        <div className="flex items-center gap-2">
          {hasDirty && <UnsavedBadge />}
          {!editing && (
            <button
              onClick={() => {
                setDraft(formattedInput);
                setEditing(true);
              }}
              className="p-1 text-muted hover:text-brand transition-colors"
              title="Edit"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      {editing ? (
        <div className="space-y-2 mt-2 pl-9">
          <input
            type="date"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={updateVTO.isPending}
              className="inline-flex items-center gap-1 text-xs px-3 py-1.5 bg-brand text-white rounded-md hover:bg-brand-hover transition-colors disabled:opacity-50"
            >
              <Check className="w-3 h-3" /> Save
            </button>
            <button
              onClick={() => setEditing(false)}
              className="inline-flex items-center gap-1 text-xs px-3 py-1.5 text-muted hover:text-foreground"
            >
              <X className="w-3 h-3" /> Cancel
            </button>
          </div>
        </div>
      ) : value ? (
        <p className="text-sm text-foreground/80 pl-9">{formattedDisplay}</p>
      ) : (
        <p className="text-xs text-muted italic pl-9">
          Click edit to set the target date
        </p>
      )}
    </div>
  );
}

function SingleLineRow({
  label,
  icon: Icon,
  field,
  value,
  placeholder,
}: {
  label: string;
  icon: typeof Calendar;
  field: "oneYearRevenue" | "oneYearProfit";
  value: string | null;
  placeholder: string;
}) {
  const updateVTO = useUpdateVTO();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");

  const hasDirty = editing && draft !== (value || "");
  useUnsavedChanges(hasDirty);

  const handleSave = () => {
    updateVTO.mutate({ [field]: draft });
    setEditing(false);
  };

  return (
    <div className="px-5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-brand/10 flex items-center justify-center shrink-0">
            <Icon className="w-3.5 h-3.5 text-brand" />
          </div>
          <p className="text-sm font-semibold text-foreground">{label}</p>
        </div>
        <div className="flex items-center gap-2">
          {hasDirty && <UnsavedBadge />}
          {!editing && (
            <button
              onClick={() => {
                setDraft(value || "");
                setEditing(true);
              }}
              className="p-1 text-muted hover:text-brand transition-colors"
              title="Edit"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      {editing ? (
        <div className="space-y-2 mt-2 pl-9">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={updateVTO.isPending}
              className="inline-flex items-center gap-1 text-xs px-3 py-1.5 bg-brand text-white rounded-md hover:bg-brand-hover transition-colors disabled:opacity-50"
            >
              <Check className="w-3 h-3" /> Save
            </button>
            <button
              onClick={() => setEditing(false)}
              className="inline-flex items-center gap-1 text-xs px-3 py-1.5 text-muted hover:text-foreground"
            >
              <X className="w-3 h-3" /> Cancel
            </button>
          </div>
        </div>
      ) : value ? (
        <p className="text-sm text-foreground/80 pl-9">{value}</p>
      ) : (
        <p className="text-xs text-muted italic pl-9">{placeholder}</p>
      )}
    </div>
  );
}

function BulletListRow({
  label,
  icon: Icon,
  field,
  value,
  placeholder,
}: {
  label: string;
  icon: typeof Calendar;
  field: "oneYearMeasurables";
  value: string | null;
  placeholder: string;
}) {
  const updateVTO = useUpdateVTO();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");

  const hasDirty = editing && draft !== (value || "");
  useUnsavedChanges(hasDirty);

  const handleSave = () => {
    updateVTO.mutate({ [field]: draft });
    setEditing(false);
  };

  const lines = (value || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  return (
    <div className="px-5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-brand/10 flex items-center justify-center shrink-0">
            <Icon className="w-3.5 h-3.5 text-brand" />
          </div>
          <p className="text-sm font-semibold text-foreground">{label}</p>
        </div>
        <div className="flex items-center gap-2">
          {hasDirty && <UnsavedBadge />}
          {!editing && (
            <button
              onClick={() => {
                setDraft(value || "");
                setEditing(true);
              }}
              className="p-1 text-muted hover:text-brand transition-colors"
              title="Edit"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      {editing ? (
        <div className="space-y-2 mt-2 pl-9">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            placeholder={`One per line:\n${placeholder}`}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand resize-none font-mono"
          />
          <p className="text-xs text-muted">
            One bullet per line. Blank lines are ignored.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={updateVTO.isPending}
              className="inline-flex items-center gap-1 text-xs px-3 py-1.5 bg-brand text-white rounded-md hover:bg-brand-hover transition-colors disabled:opacity-50"
            >
              <Check className="w-3 h-3" /> Save
            </button>
            <button
              onClick={() => setEditing(false)}
              className="inline-flex items-center gap-1 text-xs px-3 py-1.5 text-muted hover:text-foreground"
            >
              <X className="w-3 h-3" /> Cancel
            </button>
          </div>
        </div>
      ) : lines.length > 0 ? (
        <ul className="text-sm text-foreground/80 pl-9 space-y-1 mt-1 list-disc list-inside marker:text-brand">
          {lines.map((line, idx) => (
            <li key={idx}>{line}</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted italic pl-9 whitespace-pre-line">
          {placeholder}
        </p>
      )}
    </div>
  );
}

function GoalsList({ goals, vtoId }: { goals: OneYearGoal[]; vtoId: string }) {
  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();
  const deleteGoal = useDeleteGoal();
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const sorted = [...goals].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    createGoal.mutate(
      {
        title: newTitle.trim(),
        vtoId,
        targetDate: new Date(new Date().getFullYear(), 11, 31).toISOString(),
      },
      {
        onSuccess: () => {
          setNewTitle("");
          setShowAdd(false);
        },
      },
    );
  };

  return (
    <div className="border-t border-border/50 bg-surface/30">
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-brand/10 flex items-center justify-center shrink-0">
            <Mountain className="w-3.5 h-3.5 text-brand" />
          </div>
          <h4 className="text-sm font-semibold text-foreground">
            Goals for the Year
          </h4>
          <span className="text-xs text-muted">({sorted.length})</span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="text-2xs uppercase tracking-wider text-muted font-semibold"
            title="Specific · Measurable · Achievable · Relevant · Time-bound"
          >
            S.M.A.R.T.
          </span>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 text-brand hover:bg-brand/5 rounded-md transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        </div>
      </div>

      <div className="px-5 pb-3 space-y-1.5">
        {sorted.map((goal, idx) => (
          <GoalRow
            key={goal.id}
            goal={goal}
            index={idx + 1}
            onToggleSmart={() =>
              updateGoal.mutate({ id: goal.id, smart: !goal.smart })
            }
            onSaveTitle={(title) => updateGoal.mutate({ id: goal.id, title })}
            onDelete={() => {
              if (confirm(`Delete goal "${goal.title}"?`)) {
                deleteGoal.mutate(goal.id);
              }
            }}
          />
        ))}

        {sorted.length === 0 && !showAdd && (
          <p className="text-sm text-muted italic px-1">
            No goals yet — click Add to set your annual goals.
          </p>
        )}

        {showAdd && (
          <div className="flex items-center gap-2 mt-2">
            <span className="text-sm text-muted w-6 text-right">
              {sorted.length + 1}.
            </span>
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
                if (e.key === "Escape") {
                  setNewTitle("");
                  setShowAdd(false);
                }
              }}
              placeholder="New goal…"
              className="flex-1 px-2 py-1 text-sm border border-border rounded focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <button
              onClick={handleAdd}
              disabled={createGoal.isPending || !newTitle.trim()}
              className="px-2 py-1 text-xs text-white bg-brand rounded hover:bg-brand-hover disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => {
                setNewTitle("");
                setShowAdd(false);
              }}
              className="px-2 py-1 text-xs text-muted hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function GoalRow({
  goal,
  index,
  onToggleSmart,
  onSaveTitle,
  onDelete,
}: {
  goal: OneYearGoal;
  index: number;
  onToggleSmart: () => void;
  onSaveTitle: (title: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(goal.title);

  const handleSave = () => {
    const next = draft.trim();
    if (!next || next === goal.title) {
      setEditing(false);
      return;
    }
    onSaveTitle(next);
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-2 group/row">
      <span className="text-sm text-muted w-6 text-right tabular-nums">
        {index}.
      </span>
      {editing ? (
        <>
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") setEditing(false);
            }}
            className="flex-1 px-2 py-1 text-sm border border-border rounded focus:outline-none focus:ring-2 focus:ring-brand"
          />
          <button
            onClick={handleSave}
            className="px-2 py-1 text-xs text-white bg-brand rounded hover:bg-brand-hover"
          >
            Save
          </button>
          <button
            onClick={() => setEditing(false)}
            className="px-2 py-1 text-xs text-muted hover:text-foreground"
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <p
            className="flex-1 text-sm text-foreground/90 cursor-text border-b border-transparent hover:border-border py-1"
            onClick={() => {
              setDraft(goal.title);
              setEditing(true);
            }}
            title="Click to edit"
          >
            {goal.title}
          </p>
          <button
            onClick={onDelete}
            className="opacity-0 group-hover/row:opacity-100 p-1 text-muted hover:text-rose-600 transition-opacity"
            title="Delete goal"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onToggleSmart}
            title={goal.smart ? "Mark as not S.M.A.R.T." : "Mark as S.M.A.R.T."}
            className={cn(
              "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
              goal.smart
                ? "bg-brand border-brand text-white"
                : "border-rose-300 hover:border-rose-500 bg-card",
            )}
          >
            {goal.smart && <Check className="w-3 h-3" strokeWidth={3} />}
          </button>
        </>
      )}
    </div>
  );
}
