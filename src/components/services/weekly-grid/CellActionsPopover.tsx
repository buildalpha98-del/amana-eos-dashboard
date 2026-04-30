"use client";

import { useState } from "react";
import { LogIn, LogOut, UserX, Undo2, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import type { CellShift } from "../WeeklyRollCallCell";

export type RollCallAction = "sign_in" | "sign_out" | "mark_absent" | "undo";

interface CellActionsPopoverProps {
  open: boolean;
  onClose: () => void;
  shift: CellShift;
  childName: string;
  date: string;
  onAction: (action: RollCallAction, extra?: { absenceReason?: string }) => Promise<unknown> | void;
  isPending?: boolean;
}

/**
 * Modal popover for taking an action on a single shift cell.
 *
 * Renders only the buttons relevant to the current cell status:
 * - booked     → Sign in, Mark absent
 * - signed_in  → Sign out, Undo
 * - signed_out → Undo
 * - absent     → Undo
 *
 * Using a centered Dialog rather than a Radix Popover keeps positioning simple
 * on mobile (Dialog auto-bottom-sheets on <md screens).
 */
export function CellActionsPopover({
  open,
  onClose,
  shift,
  childName,
  date,
  onAction,
  isPending,
}: CellActionsPopoverProps) {
  const [showAbsentReason, setShowAbsentReason] = useState(false);
  const [absenceReason, setAbsenceReason] = useState("");

  const handleClose = () => {
    setShowAbsentReason(false);
    setAbsenceReason("");
    onClose();
  };

  async function handle(action: RollCallAction, extra?: { absenceReason?: string }) {
    await onAction(action, extra);
    handleClose();
  }

  const prettyDate = new Date(date).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent size="sm">
        <DialogTitle className="text-base font-semibold text-foreground">
          {childName} — {shift.sessionType.toUpperCase()}
        </DialogTitle>
        <p className="text-xs text-muted mt-1">{prettyDate}</p>

        {showAbsentReason ? (
          <div className="space-y-3 mt-3">
            <label className="text-sm font-medium text-foreground block">
              Absence reason
            </label>
            <input
              type="text"
              value={absenceReason}
              onChange={(e) => setAbsenceReason(e.target.value)}
              placeholder="e.g. Sick, Family holiday"
              autoFocus
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted focus:ring-2 focus:ring-brand focus:border-transparent min-h-[44px]"
            />
            <div className="flex gap-2 justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowAbsentReason(false)}
                disabled={isPending}
              >
                Back
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={!absenceReason.trim() || isPending}
                onClick={() =>
                  handle("mark_absent", { absenceReason: absenceReason.trim() })
                }
              >
                Mark absent
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 mt-4">
            {shift.status === "booked" && (
              <>
                <Button
                  variant="primary"
                  size="md"
                  iconLeft={
                    isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <LogIn className="w-4 h-4" />
                    )
                  }
                  onClick={() => handle("sign_in")}
                  disabled={isPending}
                >
                  Sign in
                </Button>
                <Button
                  variant="destructive"
                  size="md"
                  iconLeft={<UserX className="w-4 h-4" />}
                  onClick={() => setShowAbsentReason(true)}
                  disabled={isPending}
                >
                  Mark absent
                </Button>
              </>
            )}

            {shift.status === "signed_in" && (
              <>
                <Button
                  variant="primary"
                  size="md"
                  iconLeft={
                    isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <LogOut className="w-4 h-4" />
                    )
                  }
                  onClick={() => handle("sign_out")}
                  disabled={isPending}
                >
                  Sign out
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  iconLeft={<Undo2 className="w-4 h-4" />}
                  onClick={() => handle("undo")}
                  disabled={isPending}
                >
                  Undo
                </Button>
              </>
            )}

            {(shift.status === "signed_out" || shift.status === "absent") && (
              <Button
                variant="secondary"
                size="md"
                iconLeft={<Undo2 className="w-4 h-4" />}
                onClick={() => handle("undo")}
                disabled={isPending}
              >
                Undo
              </Button>
            )}

            <Button
              variant="ghost"
              size="md"
              onClick={handleClose}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
