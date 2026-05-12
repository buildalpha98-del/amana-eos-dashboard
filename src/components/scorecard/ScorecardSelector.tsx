"use client";

/**
 * Top-of-page selector for multi-scorecard. Renders as a pill row when
 * there are ≤3 scorecards, collapses to a dropdown when more. New
 * scorecard + Manage Members buttons live next to the selector so
 * users don't have to hunt for them.
 *
 * Stage 3 of Bucket O.
 */

import { useState } from "react";
import { ChevronDown, Plus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScorecardSummary } from "@/hooks/useScorecards";

export interface ScorecardSelectorProps {
  scorecards: ScorecardSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Visible to admin-tier viewers — opens the create dialog. */
  onCreate?: () => void;
  /** Visible when the viewer can manage the current scorecard. */
  onManageMembers?: () => void;
  canCreate: boolean;
  canManageSelected: boolean;
}

export function ScorecardSelector({
  scorecards,
  selectedId,
  onSelect,
  onCreate,
  onManageMembers,
  canCreate,
  canManageSelected,
}: ScorecardSelectorProps) {
  const [open, setOpen] = useState(false);
  const useDropdown = scorecards.length > 3;
  const selected = scorecards.find((s) => s.id === selectedId);

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="scorecard-selector"
    >
      {useDropdown ? (
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm hover:bg-surface"
            data-testid="scorecard-selector-trigger"
          >
            <span className="font-medium text-foreground">
              {selected?.title ?? "Select scorecard"}
            </span>
            <ChevronDown className="h-4 w-4 text-muted" />
          </button>
          {open ? (
            <div
              role="menu"
              className="absolute left-0 top-full mt-1 z-20 min-w-[240px] rounded-lg border border-border bg-card shadow-lg p-1"
            >
              {scorecards.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onSelect(s.id);
                  }}
                  className={cn(
                    "w-full text-left rounded px-3 py-1.5 text-sm hover:bg-surface flex items-center justify-between",
                    s.id === selectedId
                      ? "text-brand font-medium"
                      : "text-foreground",
                  )}
                >
                  <span>{s.title}</span>
                  <span className="text-xs text-muted">
                    {s._count.measurables}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1">
          {scorecards.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              className={cn(
                "rounded-full px-3 py-1 text-sm transition-colors",
                s.id === selectedId
                  ? "bg-brand text-white"
                  : "bg-surface text-foreground hover:bg-border",
              )}
              data-testid={`scorecard-tab-${s.id}`}
            >
              {s.title}
            </button>
          ))}
        </div>
      )}

      {canManageSelected && onManageMembers ? (
        <button
          type="button"
          onClick={onManageMembers}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-xs text-foreground/80 hover:bg-surface"
          data-testid="scorecard-manage-members"
        >
          <Users className="h-3.5 w-3.5" />
          Members
        </button>
      ) : null}

      {canCreate && onCreate ? (
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-border bg-card px-2.5 py-1 text-xs text-foreground/80 hover:bg-surface"
          data-testid="scorecard-create"
        >
          <Plus className="h-3.5 w-3.5" />
          New scorecard
        </button>
      ) : null}
    </div>
  );
}
