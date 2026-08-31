"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import type { SessionType } from "@prisma/client";

/** One of the centre's rooms, as the grid resolved it. */
export interface PickerRoom {
  id: string;
  legacyKey: SessionType;
  name: string;
}

interface EmptyCellPickerProps {
  open: boolean;
  onClose: () => void;
  childName: string;
  date: string;
  /** However many rooms the centre has, in its own order. */
  rooms: PickerRoom[];
  onPick: (sessionType: SessionType) => void | Promise<void>;
}

/**
 * Lightweight modal: choose a room for an empty (child, date) slot.
 * Pick → parent creates a status: "booked" attendance record via POST
 * /roll-call.
 *
 * Stage 2 of docs/rooms-migration-plan.md — this offered a literal
 * three, so a centre with a fourth room simply couldn't book it from
 * the week view.
 */
export function EmptyCellPicker({
  open,
  onClose,
  childName,
  date,
  rooms,
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
          {rooms.map((room) => (
            <Button
              key={room.id}
              variant="primary"
              size="md"
              onClick={() => onPick(room.legacyKey)}
            >
              Book {room.name}
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
