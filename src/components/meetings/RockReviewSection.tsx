"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, Trophy, Pencil } from "lucide-react";
import type { RockData } from "@/hooks/useRocks";
import { useUpdateRock } from "@/hooks/useRocks";
import { RockDetailPanel } from "@/components/rocks/RockDetailPanel";
import { cn } from "@/lib/utils";
import type { RockStatus } from "@prisma/client";

/**
 * L10 meeting — Rocks section.
 *
 * 2026-05-12 (Bucket N, Issue 3): made rocks editable from within
 * the meeting view. Inline 3-button status selector (On Track /
 * Off Track / Completed) handles the most-common edit; the row's
 * "Edit" button opens the existing RockDetailPanel slide-over for
 * title, description and milestone edits — no navigation away from
 * the meeting.
 */

const STATUS_BUTTONS: Array<{
  value: RockStatus;
  label: string;
  tone: string;
  activeTone: string;
}> = [
  {
    value: "on_track",
    label: "On Track",
    tone: "text-emerald-700 hover:bg-emerald-50",
    activeTone: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300",
  },
  {
    value: "off_track",
    label: "Off Track",
    tone: "text-red-700 hover:bg-red-50",
    activeTone: "bg-red-100 text-red-800 ring-1 ring-red-300",
  },
  {
    value: "complete",
    label: "Completed",
    tone: "text-green-700 hover:bg-green-50",
    activeTone: "bg-green-100 text-green-800 ring-1 ring-green-300",
  },
];

export function RockReviewSection({ rocks }: { rocks: RockData[] | undefined }) {
  const updateRock = useUpdateRock();
  const [editingRockId, setEditingRockId] = useState<string | null>(null);

  if (!rocks || rocks.length === 0) {
    return (
      <div className="text-center py-12 text-muted text-sm">
        No rocks for this quarter. Add them in the Rocks section.
      </div>
    );
  }

  const onTrack = rocks.filter(
    (r) => r.status === "on_track" || r.status === "complete",
  ).length;
  const total = rocks.length;

  function setStatus(rockId: string, status: RockStatus) {
    updateRock.mutate({ id: rockId, status });
  }

  return (
    <div className="space-y-4">
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-emerald-800 mb-1">
          Quarterly Rocks
        </h4>
        <p className="text-xs text-emerald-600">
          Set each Rock&apos;s status. Drop off-track rocks into IDS for
          discussion. Click <span className="font-medium">Edit</span> on
          a row to update its title, description, or milestones.
        </p>
      </div>

      <div className="flex items-center gap-3 px-1">
        <span className="text-sm text-muted">
          <span className="font-semibold text-foreground">{onTrack}</span> /{" "}
          {total} on track
        </span>
        <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all"
            style={{ width: `${total > 0 ? (onTrack / total) * 100 : 0}%` }}
          />
        </div>
      </div>

      <div className="space-y-2">
        {rocks.map((rock) => (
          <RockRow
            key={rock.id}
            rock={rock}
            onSetStatus={(s) => setStatus(rock.id, s)}
            onEdit={() => setEditingRockId(rock.id)}
            statusUpdating={
              updateRock.isPending &&
              (updateRock.variables as { id?: string } | undefined)?.id === rock.id
            }
          />
        ))}
      </div>

      {editingRockId ? (
        <RockDetailPanel
          open
          rockId={editingRockId}
          onClose={() => setEditingRockId(null)}
        />
      ) : null}
    </div>
  );
}

function RockRow({
  rock,
  onSetStatus,
  onEdit,
  statusUpdating,
}: {
  rock: RockData;
  onSetStatus: (status: RockStatus) => void;
  onEdit: () => void;
  statusUpdating: boolean;
}) {
  const isPositive = rock.status === "on_track" || rock.status === "complete";

  return (
    <div
      className={cn(
        "rounded-lg border p-3 space-y-2",
        rock.status === "complete"
          ? "border-green-200 bg-green-50/50"
          : isPositive
          ? "border-emerald-200 bg-emerald-50/50"
          : rock.status === "off_track"
          ? "border-red-200 bg-red-50/50"
          : "border-border bg-card",
      )}
      data-testid={`rock-review-row-${rock.id}`}
    >
      <div className="flex items-center gap-3">
        {rock.status === "complete" ? (
          <Trophy className="w-5 h-5 text-green-600 flex-shrink-0" />
        ) : isPositive ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
        ) : (
          <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {rock.title}
          </p>
          <p className="text-xs text-muted">
            {rock.owner?.name ?? "Unassigned"} &middot;{" "}
            {rock.percentComplete}% complete
          </p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground/80 hover:bg-surface"
          data-testid={`rock-edit-${rock.id}`}
        >
          <Pencil className="w-3 h-3" />
          Edit
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATUS_BUTTONS.map((btn) => {
          const active = rock.status === btn.value;
          return (
            <button
              key={btn.value}
              type="button"
              disabled={statusUpdating}
              onClick={() => onSetStatus(btn.value)}
              className={cn(
                "text-xs font-medium px-2.5 py-1 rounded-full transition-colors",
                "disabled:opacity-50 disabled:cursor-wait",
                active ? btn.activeTone : `bg-card border border-border ${btn.tone}`,
              )}
              data-testid={`rock-status-${rock.id}-${btn.value}`}
              aria-pressed={active}
            >
              {btn.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
