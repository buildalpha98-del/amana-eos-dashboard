"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Role } from "@prisma/client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { ROLE_DISPLAY_NAMES } from "@/lib/role-permissions";

interface ServiceOption {
  id: string;
  name: string;
}

interface AddStaffModalProps {
  open: boolean;
  onClose: () => void;
  services: ServiceOption[];
  /** The viewer's role — owners may also create head_office; only owner sees that option. */
  currentUserRole: Role;
}

// Roles offerable from the Team invite. Owner is deliberately excluded (owners
// are created elsewhere); head_office only when the viewer is an owner.
const BASE_ROLES: Role[] = [
  "staff",
  "member",
  "marketing",
  "admin",
  "eos_viewer",
  "eos_implementer",
];

const CENTRE_ROLES: Role[] = ["staff", "member"];

export function AddStaffModal({
  open,
  onClose,
  services,
  currentUserRole,
}: AddStaffModalProps) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [serviceId, setServiceId] = useState("");
  const [newStarter, setNewStarter] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [saving, setSaving] = useState(false);

  const roleOptions = currentUserRole === "owner" ? [...BASE_ROLES, "head_office" as Role] : BASE_ROLES;
  const needsCentre = CENTRE_ROLES.includes(role);

  function reset() {
    setName("");
    setEmail("");
    setRole("staff");
    setServiceId("");
    setNewStarter(false);
    setStartDate("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    if (needsCentre && !serviceId) {
      toast({ variant: "destructive", description: "Select a centre for this role." });
      return;
    }
    if (newStarter && !startDate) {
      toast({ variant: "destructive", description: "A start date is required for a new starter." });
      return;
    }

    setSaving(true);
    try {
      // Invite mode: no password — the API mints one and emails a welcome.
      await mutateApi("/api/users", {
        method: "POST",
        body: {
          name: name.trim(),
          email: email.trim(),
          role,
          serviceId: needsCentre ? serviceId : null,
          ...(newStarter
            ? { newStarter: true, startDate: new Date(startDate).toISOString() }
            : {}),
        },
      });
      qc.invalidateQueries({ queryKey: ["employees"] });
      toast({
        description: newStarter
          ? `${name.trim()} invited as a new starter — they'll clear induction before rostering.`
          : `${name.trim()} invited. A welcome email with sign-in details is on the way.`,
      });
      reset();
      onClose();
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Could not add the staff member.",
      });
    } finally {
      setSaving(false);
    }
  }

  const labelCls = "block text-sm font-medium text-foreground/80 mb-1";
  const inputCls =
    "w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle className="text-lg font-heading font-semibold text-foreground mb-1">
          Add staff member
        </DialogTitle>
        <p className="text-sm text-muted mb-4">
          Creates the account and emails a welcome with sign-in details.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="add-staff-name" className={labelCls}>Name</label>
            <input
              id="add-staff-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Smith"
              className={inputCls}
              required
            />
          </div>

          <div>
            <label htmlFor="add-staff-email" className={labelCls}>Email</label>
            <input
              id="add-staff-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="john@amanaoshc.com.au"
              className={inputCls}
              required
            />
          </div>

          <div>
            <label htmlFor="add-staff-role" className={labelCls}>Role</label>
            <select
              id="add-staff-role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className={inputCls}
            >
              {roleOptions.map((r) => (
                <option key={r} value={r}>{ROLE_DISPLAY_NAMES[r]}</option>
              ))}
            </select>
          </div>

          {needsCentre && (
            <div>
              <label htmlFor="add-staff-centre" className={labelCls}>Centre</label>
              <select
                id="add-staff-centre"
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                className={inputCls}
                required
              >
                <option value="">Select a centre…</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="rounded-lg border border-border bg-surface/50 p-3">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={newStarter}
                onChange={(e) => setNewStarter(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-border text-brand focus:ring-brand"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">
                  This is a new starter — require induction
                </span>
                <span className="block text-xs text-muted mt-0.5">
                  They can&apos;t be rostered or clock in until essential training is
                  complete and their week-1 practical is signed off.
                </span>
              </span>
            </label>

            {newStarter && (
              <div className="mt-3 pl-6">
                <label htmlFor="add-staff-start" className={labelCls}>Start date</label>
                <input
                  id="add-staff-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={inputCls}
                  required
                />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={saving}>
              {newStarter ? "Invite new starter" : "Send invite"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
