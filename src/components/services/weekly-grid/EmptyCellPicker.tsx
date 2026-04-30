"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";

type SessionType = "bsc" | "asc" | "vc";

interface EmptyCellPickerProps {
  open: boolean;
  onClose: () => void;
  childName: string;
  date: string;
  onPick: (sessionType: SessionType) => void | Promise<void>;
}

/**
 * Lightweight modal: choose BSC / ASC / VC for an empty (child, date) slot.
 * Pick → parent creates a status: "booked" attendance record via POST /roll-call.
 */
export function EmptyCellPicker({
  open,
  onClose,
  childName,
  date,
  onPick,
}: EmptyCellPickerProps) {
  const prettyDate = new Date(date).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogTitle className="text-base font-semibold text-foreground">
          Add booking — {childName}
        </DialogTitle>
        <p className="text-xs text-muted mt-1">{prettyDate}</p>
        <div className="flex flex-col gap-2 mt-4">
          {(["bsc", "asc", "vc"] as SessionType[]).map((st) => (
            <Button
              key={st}
              variant="primary"
              size="md"
              onClick={() => onPick(st)}
            >
              Book {st.toUpperCase()}
            </Button>
          ))}
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
