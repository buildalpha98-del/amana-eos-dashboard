"use client";

import type { ResolvedMilestone } from "@/hooks/useContentTeam";
import { CheckCircle2, AlertCircle, AlertTriangle, Clock } from "lucide-react";

const STATUS_VISUAL: Record<ResolvedMilestone["status"], { className: string; icon: React.ComponentType<{ className?: string }>; label: string }> = {
  complete: { className: "border-green-200 bg-green-50 text-green-900", icon: CheckCircle2, label: "Complete" },
  on_track: { className: "border-border bg-card text-foreground", icon: Clock, label: "On track" },
  at_risk: { className: "border-amber-200 bg-amber-50 text-amber-900", icon: AlertTriangle, label: "At risk" },
  overdue: { className: "border-red-200 bg-red-50 text-red-900", icon: AlertCircle, label: "Overdue" },
};

const ROLE_LABEL: Record<string, string> = {
  video_editor: "Video editor",
  designer: "Designer",
  copywriter: "Copywriter",
  community_manager: "Community manager",
  content_creator: "Content creator",
  photographer: "Photographer",
};

function formatDays(days: number): string {
  if (days === 0) return "today";
  if (days > 0) return `${days}d remaining`;
  return `${-days}d overdue`;
}

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

interface MilestoneCardsProps {
  milestones: Record<"day60" | "day90" | "day120", ResolvedMilestone>;
  resetStartDate: string;
}

export function MilestoneCards({ milestones, resetStartDate }: MilestoneCardsProps) {
  const ordered: ResolvedMilestone[] = [milestones.day60, milestones.day90, milestones.day120];
  return (
    <section>
      <header className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Hiring milestones</h3>
        <span className="text-xs text-muted">Reset start: {formatDate(resetStartDate)}</span>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {ordered.map((m) => {
          const visual = STATUS_VISUAL[m.status];
          const Icon = visual.icon;
          return (
            <div key={m.key} className={`rounded-xl border p-4 ${visual.className}`}>
              <header className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold uppercase tracking-wide opacity-70">{m.label}</div>
                <span className="inline-flex items-center gap-1 text-xs font-medium">
                  <Icon className="w-3.5 h-3.5" aria-hidden />
                  {visual.label}
                </span>
              </header>
              <div className="text-sm font-medium mb-1">Target {formatDate(m.targetDate)}</div>
              <div className="text-xs opacity-80 mb-3">{formatDays(m.daysUntilTarget)}</div>
              <ul className="space-y-1 text-xs">
                {m.requiredRoles.map((role) => {
                  const hired = m.hiredRoles.includes(role);
                  return (
                    <li key={role} className="flex items-center gap-2">
                      {hired ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-600" aria-hidden />
                      ) : (
                        <span className="w-3.5 h-3.5 rounded-full border border-current opacity-50 inline-block" aria-hidden />
                      )}
                      <span className={hired ? "" : "opacity-70"}>{ROLE_LABEL[role] ?? role}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
