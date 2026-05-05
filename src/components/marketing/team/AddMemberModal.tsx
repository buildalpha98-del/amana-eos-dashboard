"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { useCreateMember } from "@/hooks/useContentTeam";
import { toast } from "@/hooks/useToast";
import type { ContentTeamRole, ContentTeamStatus } from "@prisma/client";

const ROLE_OPTIONS: Array<{ value: ContentTeamRole; label: string }> = [
  { value: "video_editor", label: "Video editor" },
  { value: "designer", label: "Designer" },
  { value: "copywriter", label: "Copywriter" },
  { value: "community_manager", label: "Community manager" },
  { value: "content_creator", label: "Content creator" },
  { value: "photographer", label: "Photographer" },
];

const STATUS_OPTIONS: Array<{ value: ContentTeamStatus; label: string }> = [
  { value: "prospect", label: "Prospect" },
  { value: "interview", label: "Interview" },
  { value: "hired", label: "Hired" },
  { value: "onboarding", label: "Onboarding" },
  { value: "active", label: "Active" },
];

interface AddMemberModalProps {
  open: boolean;
  onClose: () => void;
}

function todayLocalIso(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function AddMemberModal({ open, onClose }: AddMemberModalProps) {
  const create = useCreateMember();
  const [name, setName] = useState("");
  const [role, setRole] = useState<ContentTeamRole | "">("");
  const [status, setStatus] = useState<ContentTeamStatus>("prospect");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [startedAt, setStartedAt] = useState(todayLocalIso());

  function reset() {
    setName("");
    setRole("");
    setStatus("prospect");
    setEmail("");
    setPhone("");
    setStartedAt(todayLocalIso());
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !role) {
      toast({ variant: "destructive", description: "Name and role are required" });
      return;
    }
    try {
      await create.mutateAsync({
        name: name.trim(),
        role,
        status,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        startedAt: startedAt || undefined,
      });
      toast({ description: "Team member added" });
      reset();
      onClose();
    } catch {
      // hook toast
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogTitle>Add content team member</DialogTitle>
        <DialogDescription>
          Add a freelancer, contractor, or team member. They don&apos;t need a dashboard account.
        </DialogDescription>

        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Sarah Ahmed"
              className="w-full rounded-md border border-border bg-card p-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Role *</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as ContentTeamRole | "")}
                required
                className="w-full rounded-md border border-border bg-card p-2 text-sm"
              >
                <option value="">— Select role —</option>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ContentTeamStatus)}
                className="w-full rounded-md border border-border bg-card p-2 text-sm"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                className="w-full rounded-md border border-border bg-card p-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="04xx xxx xxx"
                className="w-full rounded-md border border-border bg-card p-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Started</label>
            <input
              type="date"
              value={startedAt}
              onChange={(e) => setStartedAt(e.target.value)}
              className="w-full rounded-md border border-border bg-card p-2 text-sm"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" loading={create.isPending}>Add</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
