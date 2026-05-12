"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { useCreateScorecard } from "@/hooks/useScorecards";

export interface CreateScorecardDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called with the new scorecard's id after creation succeeds. */
  onCreated?: (id: string) => void;
}

export function CreateScorecardDialog({
  open,
  onClose,
  onCreated,
}: CreateScorecardDialogProps) {
  const [title, setTitle] = useState("");
  const create = useCreateScorecard();

  useEffect(() => {
    // Clear the title when the dialog opens — intentional modal-reset
    // setState-in-effect. The recommended derived-state alternative
    // would require remounting the dialog body via key={open} which
    // is uglier here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setTitle("");
  }, [open]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    create.mutate(
      { title: trimmed },
      {
        onSuccess: (sc) => {
          onClose();
          onCreated?.(sc.id);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md">
        <DialogTitle className="text-lg font-semibold text-foreground">
          New scorecard
        </DialogTitle>
        <p className="text-sm text-muted mt-1">
          You&apos;ll be the owner. Invite members after creating.
        </p>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-foreground/80 uppercase tracking-wide">
              Title
            </span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Leadership Team, Bonnyrigg Centre, Marketing"
              className="mt-1 block w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              maxLength={100}
              autoFocus
              data-testid="create-scorecard-title"
            />
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground/80 hover:bg-surface"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={create.isPending || title.trim().length === 0}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand-hover disabled:opacity-50"
              data-testid="create-scorecard-submit"
            >
              {create.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              Create
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
