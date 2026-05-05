"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { Button } from "@/components/ui/Button";
import { useTeam, type TeamMember } from "@/hooks/useContentTeam";
import { MilestoneCards } from "./MilestoneCards";
import { AddMemberModal } from "./AddMemberModal";
import { MemberDetailPanel } from "./MemberDetailPanel";
import { Plus } from "lucide-react";

const STATUS_PILL: Record<string, string> = {
  active: "bg-green-50 text-green-700 border-green-200",
  onboarding: "bg-amber-50 text-amber-700 border-amber-200",
  hired: "bg-blue-50 text-blue-700 border-blue-200",
  paused: "bg-purple-50 text-purple-700 border-purple-200",
  prospect: "bg-surface text-muted border-border",
  interview: "bg-surface text-muted border-border",
  departed: "bg-red-50 text-red-700 border-red-200",
};

function weeksFromStart(startedAt: string | null): number {
  if (!startedAt) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / (7 * 86_400_000)));
}

export default function TeamContent() {
  const { data, isLoading, isError, error, refetch } = useTeam();
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<TeamMember | null>(null);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Content Team"
        description="Manage your content team — freelancers, contractors, and in-house creatives. No dashboard account required."
        primaryAction={{ label: "Add member", icon: Plus, onClick: () => setAddOpen(true) }}
      />

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {isError && (
        <ErrorState title="Couldn't load team data" error={error ?? undefined} onRetry={() => refetch()} />
      )}

      {data && (
        <>
          <MilestoneCards milestones={data.milestones} resetStartDate={data.resetStartDate} />

          <section>
            <header className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Team members ({data.members.length})</h3>
            </header>
            {data.members.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted">
                No team members yet. Click &ldquo;Add member&rdquo; to get started.
              </p>
            ) : (
              <div className="rounded-xl border border-border bg-card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface text-xs text-muted">
                    <tr>
                      <th className="text-left p-3 font-medium">Name</th>
                      <th className="text-left p-3 font-medium">Role</th>
                      <th className="text-left p-3 font-medium">Status</th>
                      <th className="text-left p-3 font-medium">Weeks</th>
                      <th className="text-left p-3 font-medium">Contact</th>
                      <th className="text-right p-3 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.members.map((m) => (
                      <tr key={m.id} className="border-t border-border hover:bg-surface/50 cursor-pointer" onClick={() => setSelected(m)}>
                        <td className="p-3">
                          <div className="font-medium text-foreground">{m.name}</div>
                          {m.notes && <div className="text-xs text-muted truncate max-w-[200px]">{m.notes}</div>}
                        </td>
                        <td className="p-3 text-foreground capitalize">
                          {m.role.replace(/_/g, " ")}
                        </td>
                        <td className="p-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_PILL[m.status] ?? ""}`}>
                            {m.status}
                          </span>
                        </td>
                        <td className="p-3 text-foreground">{weeksFromStart(m.startedAt)}</td>
                        <td className="p-3 text-foreground text-xs">
                          {m.email && <div>{m.email}</div>}
                          {m.phone && <div className="text-muted">{m.phone}</div>}
                          {!m.email && !m.phone && <span className="text-muted">—</span>}
                        </td>
                        <td className="p-3 text-right">
                          <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); setSelected(m); }}>View</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <AddMemberModal open={addOpen} onClose={() => setAddOpen(false)} />
      <MemberDetailPanel member={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
