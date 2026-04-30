"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useTeam } from "@/hooks/useTeam";
import { toast } from "@/hooks/useToast";

interface ShiftSwapDialogShift {
  id: string;
  serviceId: string;
  date: string; // "YYYY-MM-DD"
  shiftStart: string; // "HH:mm"
  shiftEnd: string; // "HH:mm"
}

export interface ShiftSwapDialogProps {
  open: boolean;
  onClose: () => void;
  shift: ShiftSwapDialogShift;
  currentUserId: string;
  onSubmitted?: () => void;
}

/**
 * Dialog for the shift owner to propose a swap with a teammate at the same
 * service. Mirrors the `ShiftEditModal` overlay pattern for visual and a11y
 * consistency. POSTs to `/api/shift-swaps` with `{ shiftId, targetId, reason }`.
 */
export function ShiftSwapDialog({
  open,
  onClose,
  shift,
  currentUserId,
  onSubmitted,
}: ShiftSwapDialogProps) {
  const [targetId, setTargetId] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Reset fields on open so the dialog is clean each time it appears.
  useEffect(() => {
    if (!open) return;
    setTargetId("");
    setReason("");
  }, [open, shift?.id]);

  const { data: team } = useTeam({ service: shift?.serviceId });
  const eligibleTargets = useMemo(() => {
    if (!team) return [];
    return team.filter((m) => {
      const isActive = (m as { active?: boolean }).active !== false;
      const isAtService = m.service?.id === shift?.serviceId;
      const isSelf = m.id === currentUserId;
      return isActive && isAtService && !isSelf;
    });
  }, [team, shift?.serviceId, currentUserId]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!targetId) {
      toast({
        variant: "destructive",
        description: "Please choose a teammate to swap with.",
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/shift-swaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shiftId: shift.id,
          targetId,
          reason: reason.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Failed to propose swap");
      }
      toast({ description: "Swap request sent." });
      onSubmitted?.();
      onClose();
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Something went wrong",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md mx-4 rounded-xl bg-card shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">Request shift swap</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-md text-muted hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          <p className="text-sm text-muted">
            {shift.date} · {shift.shiftStart}–{shift.shiftEnd}
          </p>

          <div>
            <label htmlFor="swap-target" className="block text-sm font-medium mb-1">
              Swap with
            </label>
            <select
              id="swap-target"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2 text-sm bg-background"
              required
            >
              <option value="">Select teammate…</option>
              {eligibleTargets.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="swap-reason" className="block text-sm font-medium mb-1">
              Reason (optional)
            </label>
            <textarea
              id="swap-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. medical appointment"
              className="w-full rounded-md border border-border px-3 py-2 text-sm bg-background"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-md text-sm font-medium border border-border hover:bg-surface"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-3 py-2 rounded-md text-sm font-medium bg-brand text-white hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "Sending…" : "Send request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
