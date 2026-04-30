"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { usePatchMember, type TeamMember } from "@/hooks/useContentTeam";
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

interface MemberDetailPanelProps {
  member: TeamMember | null;
  onClose: () => void;
}

export function MemberDetailPanel({ member, onClose }: MemberDetailPanelProps) {
  const patch = usePatchMember();
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState<ContentTeamRole | "">(member?.contentTeamRole ?? "");
  const [status, setStatus] = useState<ContentTeamStatus | "">(member?.contentTeamStatus ?? "");
  const [startedAt, setStartedAt] = useState(member?.contentTeamStartedAt?.slice(0, 10) ?? "");
  const [pauseReason, setPauseReason] = useState(member?.contentTeamPauseReason ?? "");

  if (!member) {
    return (
      <Sheet open={false} onOpenChange={(o) => !o && onClose()}>
        <SheetContent>
          <span aria-hidden />
        </SheetContent>
      </Sheet>
    );
  }

  // Reset local state when a different member is opened.
  if (member.id && (role || "") !== (member.contentTeamRole || "") && !editing) {
    setRole(member.contentTeamRole ?? "");
    setStatus(member.contentTeamStatus ?? "");
    setStartedAt(member.contentTeamStartedAt?.slice(0, 10) ?? "");
    setPauseReason(member.contentTeamPauseReason ?? "");
  }

  async function onSave() {
    try {
      await patch.mutateAsync({
        userId: member!.id,
        contentTeamRole: (role || null) as ContentTeamRole | null,
        contentTeamStatus: (status || null) as ContentTeamStatus | null,
        contentTeamStartedAt: startedAt ? new Date(startedAt).toISOString() : null,
        contentTeamPausedAt: status === "paused" ? new Date().toISOString() : null,
        contentTeamPauseReason: status === "paused" ? pauseReason : null,
      });
      toast({ description: "Member updated" });
      setEditing(false);
    } catch {
      // hook toast
    }
  }

  return (
    <Sheet open={!!member} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetTitle>{member.name}</SheetTitle>
        <SheetDescription>{member.email}</SheetDescription>

        <div className="mt-4 space-y-4">
          {!editing ? (
            <>
              <section className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted">Role</div>
                  <div className="font-medium capitalize">{member.contentTeamRole?.replace(/_/g, " ") ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Status</div>
                  <div className="font-medium capitalize">{member.contentTeamStatus ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Started</div>
                  <div className="font-medium">{fmtDate(member.contentTeamStartedAt)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Weeks with team</div>
                  <div className="font-medium">{member.weeksWithTeam}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Output (this week)</div>
                  <div className="font-medium">{member.outputThisWeek} posts</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Avg / week (4w)</div>
                  <div className="font-medium">{member.avgWeeklyOutput} posts</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Active tasks</div>
                  <div className="font-medium">{member.activeTaskCount}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Paused</div>
                  <div className="font-medium">{member.contentTeamPausedAt ? fmtDate(member.contentTeamPausedAt) : "—"}</div>
                </div>
              </section>
              {member.contentTeamPauseReason && (
                <section>
                  <div className="text-xs text-muted">Pause reason</div>
                  <p className="text-sm">{member.contentTeamPauseReason}</p>
                </section>
              )}
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>Edit</Button>
            </>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Role</label>
                <select value={role} onChange={(e) => setRole(e.target.value as ContentTeamRole | "")} className="w-full rounded-md border border-border bg-card p-2 text-sm">
                  <option value="">— Clear —</option>
                  {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value as ContentTeamStatus | "")} className="w-full rounded-md border border-border bg-card p-2 text-sm">
                  <option value="">— Clear —</option>
                  {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
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
