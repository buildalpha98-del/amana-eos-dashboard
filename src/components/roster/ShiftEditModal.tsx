"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useTeam } from "@/hooks/useTeam";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";

interface ShiftEditShift {
  id: string;
  userId?: string | null;
  date: string; // "YYYY-MM-DD"
  sessionType: string; // "bsc" | "asc" | "vc"
  shiftStart: string; // "HH:mm"
  shiftEnd: string; // "HH:mm"
  role?: string | null;
  staffName: string;
}

export interface ShiftEditModalProps {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  shift?: ShiftEditShift;
  serviceId: string;
  defaultDate?: string;
  onSaved?: () => void;
}

const SESSION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "bsc", label: "BSC (Before School Care)" },
  { value: "asc", label: "ASC (After School Care)" },
  { value: "vc", label: "VC (Vacation Care)" },
];

export function ShiftEditModal({
  open,
  onClose,
  mode,
  shift,
  serviceId,
  defaultDate,
  onSaved,
}: ShiftEditModalProps) {
  // Form state — always declare hooks in the same order, and reset when a
  // different shift is loaded into edit mode.
  const [userId, setUserId] = useState<string>(shift?.userId ?? "");
  const [date, setDate] = useState<string>(shift?.date ?? defaultDate ?? "");
  const [sessionType, setSessionType] = useState<string>(
    shift?.sessionType ?? SESSION_OPTIONS[0].value,
  );
  const [shiftStart, setShiftStart] = useState<string>(shift?.shiftStart ?? "");
  const [shiftEnd, setShiftEnd] = useState<string>(shift?.shiftEnd ?? "");
  const [role, setRole] = useState<string>(shift?.role ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Reset form when the modal opens or a different shift is passed in.
  useEffect(() => {
    if (!open) return;
    setUserId(shift?.userId ?? "");
    setDate(shift?.date ?? defaultDate ?? "");
    setSessionType(shift?.sessionType ?? SESSION_OPTIONS[0].value);
    setShiftStart(shift?.shiftStart ?? "");
    setShiftEnd(shift?.shiftEnd ?? "");
    setRole(shift?.role ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shift?.id]);

  // Load team — scope to this service, active staff only.
  const { data: team } = useTeam({ service: serviceId });
  const activeAtService = useMemo(() => {
    if (!team) return [];
    return team.filter((m) => {
      const isAtService = m.service?.id === serviceId;
      const isActive = (m as { active?: boolean }).active !== false;
      return isAtService && isActive;
    });
  }, [team, serviceId]);

  if (!open) return null;

  const title = mode === "create" ? "New Shift" : "Edit Shift";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!shiftStart || !shiftEnd || shiftEnd <= shiftStart) {
      toast({
        variant: "destructive",
        description: "Shift end must be after shift start.",
      });
      return;
    }
    if (!userId) {
      toast({ variant: "destructive", description: "Please choose a staff member." });
      return;
    }
    if (!date) {
      toast({ variant: "destructive", description: "Please choose a date." });
      return;
    }

    setSaving(true);
    try {
      if (mode === "create") {
        const res = await fetch("/api/roster/shifts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serviceId,
            userId,
            date,
            sessionType,
            shiftStart,
            shiftEnd,
            role: role || null,
            status: "draft",
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? "Failed to create shift");
        }
        toast({ description: "Shift created." });
      } else if (mode === "edit" && shift) {
        const res = await fetch(`/api/roster/shifts/${shift.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            date,
            sessionType,
            shiftStart,
            shiftEnd,
            role: role || null,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? "Failed to update shift");
        }
        toast({ description: "Shift updated." });
      }
      onSaved?.();
      onClose();
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Something went wrong",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (mode !== "edit" || !shift) return;
    if (!window.confirm("Delete this shift? This cannot be undone.")) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/roster/shifts/${shift.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Failed to delete shift");
      }
      toast({ description: "Shift deleted." });
      onSaved?.();
      onClose();
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Something went wrong",
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md mx-4 rounded-xl bg-card shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
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
          <div>
            <label htmlFor="shift-user" className="block text-sm font-medium mb-1">
              Staff
            </label>
            <select
              id="shift-user"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2 text-sm bg-background"
              required
            >
              <option value="">Select staff…</option>
              {activeAtService.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="shift-date" className="block text-sm font-medium mb-1">
              Date
            </label>
            <input
              id="shift-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2 text-sm bg-background"
              required
            />
          </div>

          <div>
            <label htmlFor="shift-session" className="block text-sm font-medium mb-1">
              Session Type
            </label>
            <select
              id="shift-session"
              value={sessionType}
              onChange={(e) => setSessionType(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2 text-sm bg-background"
            >
              {SESSION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="shift-start" className="block text-sm font-medium mb-1">
                Shift Start
              </label>
              <input
                id="shift-start"
                type="time"
                value={shiftStart}
                onChange={(e) => setShiftStart(e.target.value)}
                className="w-full rounded-md border border-border px-3 py-2 text-sm bg-background"
                required
              />
            </div>
            <div>
              <label htmlFor="shift-end" className="block text-sm font-medium mb-1">
                Shift End
              </label>
              <input
                id="shift-end"
                type="time"
                value={shiftEnd}
                onChange={(e) => setShiftEnd(e.target.value)}
                className="w-full rounded-md border border-border px-3 py-2 text-sm bg-background"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="shift-role" className="block text-sm font-medium mb-1">
              Role (optional)
            </label>
            <input
              id="shift-role"
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Lead Educator"
              className="w-full rounded-md border border-border px-3 py-2 text-sm bg-background"
            />
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            {mode === "edit" ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className={cn(
                  "px-3 py-2 rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50",
                )}
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 rounded-md text-sm font-medium border border-border hover:bg-surface"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-3 py-2 rounded-md text-sm font-medium bg-brand text-white hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving…" : mode === "create" ? "Create" : "Save"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
