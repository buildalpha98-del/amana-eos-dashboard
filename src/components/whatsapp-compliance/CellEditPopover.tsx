"use client";

import { useState } from "react";
import type { GridCell, GridCentre } from "@/hooks/useWhatsAppCompliance";
import { useCellPatch, useFlagCoordinator } from "@/hooks/useWhatsAppCompliance";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { toast } from "@/hooks/useToast";
import { Flag, X } from "lucide-react";
import type { WhatsAppNonPostReason } from "@prisma/client";

const REASONS: Array<{ value: WhatsAppNonPostReason; label: string }> = [
  { value: "coordinator_on_leave", label: "On leave" },
  { value: "coordinator_sick", label: "Sick" },
  { value: "school_closure", label: "School closed" },
  { value: "public_holiday", label: "Public holiday" },
  { value: "technical_issue", label: "Technical issue" },
  { value: "forgot_or_missed", label: "Forgot/missed" },
  { value: "unknown", label: "Unknown" },
  { value: "other", label: "Other" },
];

interface CellEditPopoverProps {
  centre: GridCentre;
  cell: GridCell;
  onClose: () => void;
}

export function CellEditPopover({ centre, cell, onClose }: CellEditPopoverProps) {
  const [posted, setPosted] = useState(cell.record?.posted ?? false);
  const [reason, setReason] = useState<WhatsAppNonPostReason | undefined>(
    cell.record?.notPostingReason ?? undefined,
  );
  const [notes, setNotes] = useState(cell.record?.notes ?? "");

  const patch = useCellPatch();
  const flag = useFlagCoordinator();

  const onSave = async () => {
    try {
      await patch.mutateAsync({
        serviceId: centre.id,
        date: cell.date,
        posted,
        notPostingReason: posted ? undefined : reason,
        notes: notes.trim() || undefined,
      });
      toast({ description: "Cell updated" });
      onClose();
    } catch {
      // hook handles toast
    }
  };

  const onFlag = async () => {
    try {
      const result = await flag.mutateAsync({
        serviceId: centre.id,
        date: cell.date,
        context: "one_off",
      });
      if (result.whatsappLink) {
        window.open(result.whatsappLink, "_blank", "noopener,noreferrer");
      } else {
        try {
          await navigator.clipboard.writeText(result.message);
          toast({ description: "No phone on file — message copied to clipboard." });
        } catch {
          toast({ description: result.message });
        }
      }
    } catch {
      // hook handles toast
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogTitle>{centre.name} — {cell.date}</DialogTitle>
        <DialogDescription>
          {centre.coordinatorName ?? "Unknown coordinator"}
        </DialogDescription>

        <div className="space-y-4">
          <fieldset className="flex items-center gap-3">
            <legend className="text-xs font-medium text-muted">Posted?</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={posted} onChange={() => setPosted(true)} aria-label="Posted" />
              <span className="text-green-700 font-medium">Yes — posted</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={!posted} onChange={() => setPosted(false)} aria-label="Did not post" />
              <span className="text-amber-700 font-medium">No</span>
            </label>
          </fieldset>

          {!posted && (
            <div>
              <label className="text-xs font-medium text-muted block mb-1">Reason</label>
              <select
                className="w-full rounded-md border border-border bg-card text-sm p-2"
                value={reason ?? ""}
                onChange={(e) => setReason((e.target.value || undefined) as WhatsAppNonPostReason | undefined)}
              >
                <option value="">— Pick a reason —</option>
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted block mb-1" htmlFor="cell-notes">Notes (optional)</label>
            <textarea
              id="cell-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-md border border-border bg-card text-sm p-2"
              placeholder="Anything to note for this day…"
            />
          </div>

          {!posted && (
            <button
              type="button"
              onClick={onFlag}
              disabled={flag.isPending}
              className="flex items-center gap-1 text-xs text-brand hover:underline"
            >
              <Flag className="w-3.5 h-3.5" />
              Flag this coordinator (opens WhatsApp draft)
            </button>
          )}
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} iconLeft={<X className="w-4 h-4" />}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={onSave} loading={patch.isPending} disabled={!posted && !reason}>
            Save cell
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
