"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { useAddMember, useTeamCandidates } from "@/hooks/useContentTeam";
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
  { value: "onboarding", label: "Onboarding (default)" },
  { value: "active", label: "Active" },
  { value: "hired", label: "Hired (not yet started)" },
  { value: "interview", label: "Interview" },
  { value: "prospect", label: "Prospect" },
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
  const candidates = useTeamCandidates();
  const add = useAddMember();
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<ContentTeamRole | "">("");
  const [startedAt, setStartedAt] = useState(todayLocalIso());
  const [initialStatus, setInitialStatus] = useState<ContentTeamStatus>("onboarding");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !role) {
      toast({ variant: "destructive", description: "User and role are required" });
      return;
    }
    try {
      await add.mutateAsync({
        userId,
        role,
        startedAt: new Date(startedAt).toISOString(),
        initialStatus,
      });
      toast({ description: "Team member added" });
      onClose();
      setUserId("");
      setRole("");
    } catch {
      // hook toast
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogTitle>Add content team member</DialogTitle>
        <DialogDescription>
          Pick an existing user. If they were recruited via /recruitment they should already be in the system.
        </DialogDescription>

        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">User *</label>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              required
              className="w-full rounded-md border border-border bg-card p-2 text-sm"
            >
              <option value="">— Select user —</option>
              {(candidates.data?.candidates ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
              ))}
            </select>
            {candidates.isLoading && <p className="text-xs text-muted mt-1">Loading candidates…</p>}
          </div>
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
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Started</label>
              <input
                type="date"
                value={startedAt}
                onChange={(e) => setStartedAt(e.target.value)}
                className="w-full rounded-md border border-border bg-card p-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Initial status</label>
              <select
                value={initialStatus}
                onChange={(e) => setInitialStatus(e.target.value as ContentTeamStatus)}
                className="w-full rounded-md border border-border bg-card p-2 text-sm"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" loading={add.isPending}>Add</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
