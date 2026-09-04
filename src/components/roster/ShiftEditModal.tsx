"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { useTeam } from "@/hooks/useTeam";
import { useShiftTemplates } from "@/hooks/useShiftTemplates";
import { toast } from "@/hooks/useToast";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";

// Sentinel option value for an open (unassigned) shift. A real value —
// not "" — so the select's `required` attribute still forces an explicit
// choice: pick a staff member OR deliberately pick "Open shift".
const OPEN_SHIFT_VALUE = "__open__";

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

// Editing an existing open shift (userId null) selects the sentinel;
// creating starts on the "" placeholder so `required` still bites.
function initialUserId(shift?: ShiftEditShift): string {
  if (!shift) return "";
  return shift.userId ?? OPEN_SHIFT_VALUE;
}

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
  const [userId, setUserId] = useState<string>(initialUserId(shift));
  const [date, setDate] = useState<string>(shift?.date ?? defaultDate ?? "");
  const [sessionType, setSessionType] = useState<string>(
    shift?.sessionType ?? SESSION_OPTIONS[0].value,
  );
  const [shiftStart, setShiftStart] = useState<string>(shift?.shiftStart ?? "");
  const [shiftEnd, setShiftEnd] = useState<string>(shift?.shiftEnd ?? "");
  const [role, setRole] = useState<string>(shift?.role ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Reset form when the modal opens or a different shift is passed in.
  useEffect(() => {
    if (!open) return;
    setUserId(initialUserId(shift));
    setDate(shift?.date ?? defaultDate ?? "");
    setSessionType(shift?.sessionType ?? SESSION_OPTIONS[0].value);
    setShiftStart(shift?.shiftStart ?? "");
    setShiftEnd(shift?.shiftEnd ?? "");
    setRole(shift?.role ?? "");
    setConfirmDeleteOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shift?.id]);

  // Load team — scope to this service, active staff only.
  const { data: team } = useTeam({ service: serviceId });

  // Load shift templates — pre-fills sessionType / start / end / role
  // on the create form. Skipped in edit mode (no point altering an
  // existing shift through a template).
  const { data: templatesResp } = useShiftTemplates(
    mode === "create" ? serviceId : undefined,
  );
  const templates = templatesResp?.templates ?? [];

  function applyTemplate(templateId: string) {
    if (!templateId) return;
    const t = templates.find((x) => x.id === templateId);
    if (!t) return;
    setSessionType(t.sessionType);
    setShiftStart(t.shiftStart);
    setShiftEnd(t.shiftEnd);
    setRole(t.role ?? "");
  }
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

    // The sentinel means "open shift": the API takes an explicit null.
    const payloadUserId = userId === OPEN_SHIFT_VALUE ? null : userId;

    setSaving(true);
    try {
      if (mode === "create") {
        const res = await fetch("/api/roster/shifts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serviceId,
            userId: payloadUserId,
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
            userId: payloadUserId,
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
      setConfirmDeleteOpen(false);
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
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent size="md">
          <DialogTitle className="text-lg font-semibold text-foreground">
            {title}
          </DialogTitle>

          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            {mode === "create" && templates.length > 0 ? (
              <div>
                <label
                  htmlFor="shift-template"
                  className="block text-sm font-medium mb-1 flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  Use template (optional)
                </label>
                <select
                  id="shift-template"
                  onChange={(e) => {
                    applyTemplate(e.target.value);
                    // Reset back to placeholder so user can re-pick after
                    // tweaking — otherwise selecting again is a no-op.
                    e.target.value = "";
                  }}
                  className="w-full rounded-md border border-border px-3 py-2 text-sm bg-background"
                  defaultValue=""
                >
                  <option value="">Pick a saved pattern…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label} · {t.shiftStart}–{t.shiftEnd}
                      {t.role ? ` · ${t.role}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

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
                <option value={OPEN_SHIFT_VALUE}>Open shift (no assignee)</option>
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
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmDeleteOpen(true)}
                  disabled={deleting}
                >
                  Delete
                </Button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" loading={saving}>
                  {saving ? "Saving…" : mode === "create" ? "Create" : "Save"}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Delete shift?"
        description="This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        loading={deleting}
      />
    </>
  );
}
