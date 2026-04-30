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

export default function TeamContent() {
  const { data, isLoading, isError, error, refetch } = useTeam();
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<TeamMember | null>(null);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Content Team"
        description="Hiring milestones, output, and role status. Recruitment continues in the Recruitment tab; this page tracks members post-hire."
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
          <MilestoneCards milestones={data.hiringMilestones} resetStartDate={data.resetStartDate} />

          <section>
            <header className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Team members ({data.members.length})</h3>
              <span className="text-xs text-muted">Output signal: assigned posts in MarketingPost</span>
            </header>
            {data.members.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted">
                No team members yet. Click &ldquo;Add member&rdquo; to tag an existing user.
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
                      <th className="text-left p-3 font-medium">Output (4w avg)</th>
                      <th className="text-left p-3 font-medium">Active tasks</th>
                      <th className="text-right p-3 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.members.map((m) => (
                      <tr key={m.id} className="border-t border-border hover:bg-surface/50 cursor-pointer" onClick={() => setSelected(m)}>
                        <td className="p-3">
                          <div className="font-medium text-foreground">{m.name}</div>
                          <div className="text-xs text-muted">{m.email}</div>
                        </td>
                        <td className="p-3 text-foreground capitalize">
                          {m.contentTeamRole?.replace(/_/g, " ") ?? "—"}
                        </td>
                        <td className="p-3">
                          {m.contentTeamStatus ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_PILL[m.contentTeamStatus]}`}>
                              {m.contentTeamStatus}
                            </span>
                          ) : (
                            <span className="text-muted text-xs">—</span>
                          )}
                        </td>
                        <td className="p-3 text-foreground">{m.weeksWithTeam}</td>
                        <td className="p-3 text-foreground">
                          {m.avgWeeklyOutput}
                          <span className="text-xs text-muted ml-1">/ wk</span>
                        </td>
                        <td className="p-3 text-foreground">{m.activeTaskCount}</td>
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
