"use client";

import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { usePatchMember, useDeleteMember, type TeamMember } from "@/hooks/useContentTeam";
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
  { value: "paused", label: "Paused" },
  { value: "departed", label: "Departed" },
];

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

function weeksFromStart(startedAt: string | null): number {
  if (!startedAt) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / (7 * 86_400_000)));
}

interface MemberDetailPanelProps {
  member: TeamMember | null;
  onClose: () => void;
}

export function MemberDetailPanel({ member, onClose }: MemberDetailPanelProps) {
  const patch = usePatchMember();
  const del = useDeleteMember();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState<ContentTeamRole | "">(member?.role ?? "");
  const [status, setStatus] = useState<ContentTeamStatus | "">(member?.status ?? "");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [startedAt, setStartedAt] = useState("");
  const [pauseReason, setPauseReason] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (member) {
      setName(member.name);
      setRole(member.role);
      setStatus(member.status);
      setEmail(member.email ?? "");
      setPhone(member.phone ?? "");
      setStartedAt(member.startedAt?.slice(0, 10) ?? "");
      setPauseReason(member.pauseReason ?? "");
      setNotes(member.notes ?? "");
      setEditing(false);
    }
  }, [member?.id]);

  if (!member) {
    return (
      <Sheet open={false} onOpenChange={(o) => !o && onClose()}>
        <SheetContent>
          <span aria-hidden />
        </SheetContent>
      </Sheet>
    );
  }

  async function onSave() {
    try {
      await patch.mutateAsync({
        id: member!.id,
        name: name.trim(),
        role: (role || undefined) as ContentTeamRole | undefined,
        status: (status || undefined) as ContentTeamStatus | undefined,
        email: email.trim() || null,
        phone: phone.trim() || null,
        startedAt: startedAt || null,
        pausedAt: status === "paused" ? new Date().toISOString() : null,
        pauseReason: status === "paused" ? pauseReason : null,
        notes: notes.trim() || null,
      });
      toast({ description: "Member updated" });
      setEditing(false);
    } catch {
      // hook toast
    }
  }

  async function onDelete() {
    if (!confirm(`Remove ${member!.name} from the content team?`)) return;
    try {
      await del.mutateAsync(member!.id);
      toast({ description: "Member removed" });
      onClose();
    } catch {
      // hook toast
    }
  }

  return (
    <Sheet open={!!member} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetTitle>{member.name}</SheetTitle>
        <SheetDescription>{member.email ?? member.phone ?? member.role.replace(/_/g, " ")}</SheetDescription>

        <div className="mt-4 space-y-4">
          {!editing ? (
            <>
              <section className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted">Role</div>
                  <div className="font-medium capitalize">{member.role.replace(/_/g, " ")}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Status</div>
                  <div className="font-medium capitalize">{member.status}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Started</div>
                  <div className="font-medium">{fmtDate(member.startedAt)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Weeks with team</div>
                  <div className="font-medium">{weeksFromStart(member.startedAt)}</div>
                </div>
                {member.email && (
                  <div>
                    <div className="text-xs text-muted">Email</div>
                    <div className="font-medium">{member.email}</div>
                  </div>
                )}
                {member.phone && (
                  <div>
                    <div className="text-xs text-muted">Phone</div>
                    <div className="font-medium">{member.phone}</div>
                  </div>
                )}
                {member.pausedAt && (
                  <div>
                    <div className="text-xs text-muted">Paused</div>
                    <div className="font-medium">{fmtDate(member.pausedAt)}</div>
                  </div>
                )}
              </section>
              {member.pauseReason && (
                <section>
                  <div className="text-xs text-muted">Pause reason</div>
                  <p className="text-sm">{member.pauseReason}</p>
                </section>
              )}
              {member.notes && (
                <section>
                  <div className="text-xs text-muted">Notes</div>
                  <p className="text-sm whitespace-pre-wrap">{member.notes}</p>
                </section>
              )}
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>Edit</Button>
                <Button variant="destructive" size="sm" onClick={onDelete} loading={del.isPending}>Remove</Button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-border bg-card p-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Role</label>
                <select value={role} onChange={(e) => setRole(e.target.value as ContentTeamRole | "")} className="w-full rounded-md border border-border bg-card p-2 text-sm">
                  {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value as ContentTeamStatus | "")} className="w-full rounded-md border border-border bg-card p-2 text-sm">
                  {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-md border border-border bg-card p-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Phone</label>
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-md border border-border bg-card p-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Started</label>
                <input type="date" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} className="w-full rounded-md border border-border bg-card p-2 text-sm" />
              </div>
              {status === "paused" && (
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Pause reason</label>
                  <textarea value={pauseReason} onChange={(e) => setPauseReason(e.target.value)} rows={2} className="w-full rounded-md border border-border bg-card p-2 text-sm" />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full rounded-md border border-border bg-card p-2 text-sm" />
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
                <Button variant="primary" size="sm" onClick={onSave} loading={patch.isPending}>Save</Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
