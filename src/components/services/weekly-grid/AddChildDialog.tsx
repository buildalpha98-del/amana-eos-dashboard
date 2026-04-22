"use client";

import { useMemo, useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/hooks/useToast";
import { mutateApi } from "@/lib/fetch-api";
import {
  useEnrollableChildren,
  type WeeklyRollCallChild,
} from "@/hooks/useWeeklyRollCall";
import { cn } from "@/lib/utils";

type SessionType = "bsc" | "asc" | "vc";

interface SelectionKey {
  childId: string;
  date: string;
  sessionType: SessionType;
}

interface AddChildDialogProps {
  open: boolean;
  onClose: () => void;
  serviceId: string;
  weekStart: string;
  weekDates: string[]; // Mon..Fri ISO dates
}

const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const SESSION_TYPES: SessionType[] = ["bsc", "asc", "vc"];

/**
 * Dialog — lists enrollable children (those not yet on any attendance record
 * for the week) with a per-child 5×3 checkbox grid (Mon–Fri × BSC/ASC/VC).
 *
 * On submit:
 *   POST /api/attendance/roll-call { action: "undo" } per selection
 *   → creates a status: "booked" attendance record for each cell.
 *
 * NOTE: This issues N parallel requests. A true DB transaction would require
 * a new bulk endpoint, deferred to sub-project 4b. On partial failure we still
 * invalidate the weekly query so the UI reflects whichever rows succeeded.
 */
export function AddChildDialog({
  open,
  onClose,
  serviceId,
  weekStart,
  weekDates,
}: AddChildDialogProps) {
  const { data, isLoading, error } = useEnrollableChildren(serviceId, weekStart);
  const qc = useQueryClient();

  // Selection state — keyed by `${childId}|${date}|${sessionType}`
  const [selections, setSelections] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);

  const selectionCount = useMemo(
    () => Object.values(selections).filter(Boolean).length,
    [selections],
  );

  const children = data?.children ?? [];

  const toggle = (key: SelectionKey) => {
    const k = `${key.childId}|${key.date}|${key.sessionType}`;
    setSelections((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  const isSelected = (key: SelectionKey): boolean => {
    const k = `${key.childId}|${key.date}|${key.sessionType}`;
    return !!selections[k];
  };

  const handleClose = () => {
    if (submitting) return;
    setSelections({});
    onClose();
  };

  async function onSubmit() {
    const picks: SelectionKey[] = Object.entries(selections)
      .filter(([, v]) => v)
      .map(([k]) => {
        const [childId, date, sessionType] = k.split("|");
        return { childId, date, sessionType: sessionType as SessionType };
      });

    if (picks.length === 0) return;

    setSubmitting(true);
    try {
      await Promise.all(
        picks.map((s) =>
          mutateApi("/api/attendance/roll-call", {
            method: "POST",
            body: {
              serviceId,
              childId: s.childId,
              date: s.date,
              sessionType: s.sessionType,
              action: "undo", // creates status: "booked" record via upsert
            },
          }),
        ),
      );
      qc.invalidateQueries({ queryKey: ["weekly-roll-call", serviceId, weekStart] });
      qc.invalidateQueries({ queryKey: ["enrollable-children", serviceId, weekStart] });
      toast({
        description: `Added ${picks.length} booking${picks.length === 1 ? "" : "s"}.`,
      });
      setSelections({});
      onClose();
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Failed to add bookings",
      });
      // Best-effort: refresh so whichever rows succeeded appear in the grid.
      qc.invalidateQueries({ queryKey: ["weekly-roll-call", serviceId, weekStart] });
      qc.invalidateQueries({ queryKey: ["enrollable-children", serviceId, weekStart] });
    } finally {
      setSubmitting(false);
    }
  }

  function renderChildRow(child: WeeklyRollCallChild) {
    return (
      <div key={child.id} className="border border-border rounded-lg p-3 bg-card">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="font-medium text-sm text-foreground truncate">
            {child.firstName} {child.surname}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr>
                <th className="text-left text-muted font-medium py-1 pr-2">Session</th>
                {weekDates.map((d, i) => (
                  <th
                    key={d}
                    className="text-center text-muted font-medium py-1 px-1 min-w-[36px]"
                  >
                    {WEEKDAY_NAMES[i]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SESSION_TYPES.map((st) => (
                <tr key={st}>
                  <td className="text-foreground font-semibold uppercase py-1 pr-2">
                    {st}
                  </td>
                  {weekDates.map((date) => {
                    const selected = isSelected({
                      childId: child.id,
                      date,
                      sessionType: st,
                    });
                    return (
                      <td key={date} className="text-center py-0.5 px-1">
                        <button
                          type="button"
                          aria-pressed={selected}
                          aria-label={`${child.firstName} ${st} on ${date}`}
                          data-testid={`addchild-cell-${child.id}-${date}-${st}`}
                          disabled={submitting}
                          onClick={() =>
                            toggle({ childId: child.id, date, sessionType: st })
                          }
                          className={cn(
                            "w-7 h-7 rounded border text-[10px] font-semibold flex items-center justify-center transition-colors",
                            selected
                              ? "bg-brand border-brand text-white"
                              : "bg-surface border-border text-muted hover:bg-card",
                          )}
                        >
                          {selected ? "\u2713" : ""}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent size="full">
        <DialogTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
          <UserPlus className="w-5 h-5" />
          Add child to week
        </DialogTitle>
        <p className="text-xs text-muted mt-1">
          Select session cells to create booked attendance records.
        </p>

        <div className="mt-4 max-h-[60vh] overflow-y-auto space-y-2 pr-1">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-lg" />
              ))}
            </div>
          ) : error ? (
            <div className="text-sm text-destructive">
              {error instanceof Error ? error.message : "Failed to load children"}
            </div>
          ) : children.length === 0 ? (
            <EmptyState
              icon={UserPlus}
              title="No children to add"
              description="All active children are already on the week's roster."
            />
          ) : (
            children.map((c) => renderChildRow(c))
          )}
        </div>

        <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-border">
          <div className="text-xs text-muted">
            {selectionCount} selected
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={onSubmit}
              disabled={selectionCount === 0 || submitting}
              iconLeft={
                submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined
              }
            >
              Add {selectionCount || ""}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
