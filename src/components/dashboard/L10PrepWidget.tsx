"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  ChevronRight,
  ClipboardList,
  Mountain,
  AlertCircle,
  BarChart3,
} from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";

interface L10PrepData {
  overdueTodos: number;
  offTrackRocks: number;
  openIssues: number;
  missingMeasurables: number;
  nextMeeting: { id: string; title: string; date: string } | null;
}

export function L10PrepWidget() {
  const { data, isLoading } = useQuery<L10PrepData>({
    queryKey: ["l10-prep-widget"],
    queryFn: async () => {
      // Aggregate from existing dashboard data
      const res = await fetch("/api/dashboard");
      if (!res.ok) throw new Error("Failed to load");
      const dash = await res.json();

      // Get next meeting
      const meetingsRes = await fetch("/api/meetings?limit=1&status=scheduled");
      let nextMeeting = null;
      if (meetingsRes.ok) {
        const meetings = await meetingsRes.json();
        if (Array.isArray(meetings) && meetings.length > 0) {
          nextMeeting = {
            id: meetings[0].id,
            title: meetings[0].title,
            date: meetings[0].scheduledDate || meetings[0].date,
          };
        }
      }

      return {
        overdueTodos: dash.actionItems?.overdueTodos?.length ?? 0,
        offTrackRocks: dash.actionItems?.overdueRocks?.length ?? 0,
        openIssues: dash.actionItems?.idsIssues?.length ?? 0,
        missingMeasurables: 0, // Would require scorecard API
        nextMeeting,
      };
    },
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="bg-card rounded-xl border border-border p-6">
        <Skeleton className="h-5 w-40 mb-4" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const items = [
    {
      label: "Overdue To-Dos",
      value: data.overdueTodos,
      icon: ClipboardList,
      href: "/todos",
      color: data.overdueTodos > 0 ? "text-danger" : "text-success",
      bg: data.overdueTodos > 0 ? "bg-danger/10" : "bg-success/10",
    },
    {
      label: "Off-Track Rocks",
      value: data.offTrackRocks,
      icon: Mountain,
      href: "/rocks",
      color: data.offTrackRocks > 0 ? "text-warning" : "text-success",
      bg: data.offTrackRocks > 0 ? "bg-warning/10" : "bg-success/10",
    },
    {
      label: "Open Issues",
      value: data.openIssues,
      icon: AlertCircle,
      href: "/issues",
      color: data.openIssues > 0 ? "text-warning" : "text-success",
      bg: data.openIssues > 0 ? "bg-warning/10" : "bg-success/10",
    },
    {
      label: "Missing Measurables",
      value: data.missingMeasurables,
      icon: BarChart3,
      href: "/scorecard",
      color: data.missingMeasurables > 0 ? "text-danger" : "text-muted",
      bg: data.missingMeasurables > 0 ? "bg-danger/10" : "bg-surface",
    },
  ];

  const totalAttention = data.overdueTodos + data.offTrackRocks + data.openIssues + data.missingMeasurables;

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">This Week&apos;s L10 Prep</h3>
          {data.nextMeeting && (
            <p className="text-xs text-muted mt-0.5">
              Next: {data.nextMeeting.title}
            </p>
          )}
        </div>
        <Link
          href="/meetings"
          className="text-xs font-medium text-brand hover:underline flex items-center gap-1"
        >
          Meetings <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {totalAttention === 0 ? (
        <div className="text-center py-4">
          <p className="text-sm text-success font-medium">All clear for L10 — nothing needs attention.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-brand/30 transition-colors"
              >
                <div className={`w-8 h-8 rounded-lg ${item.bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-4 h-4 ${item.color}`} />
                </div>
                <div className="min-w-0">
                  <div className={`text-lg font-bold leading-none ${item.color}`}>{item.value}</div>
                  <div className="text-[11px] text-muted mt-0.5 truncate">{item.label}</div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
