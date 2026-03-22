"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Clock,
  MessageSquare,
  CheckCircle2,
  Users,
  Building2,
  AlertCircle,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TicketAnalyticsData {
  totalTickets: number;
  avgFirstResponseHours: number | null;
  avgResolutionHours: number | null;
  volumeTrend: { date: string; count: number }[];
  byPriority: Record<string, number>;
  byStatus: Record<string, number>;
  byCentre: { name: string; code: string; count: number }[];
  agentWorkload: { id: string; name: string; ticketCount: number; avgResponseHours: number | null }[];
}

const priorityColors: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-blue-500",
};

const statusColors: Record<string, string> = {
  new: "bg-blue-500",
  open: "bg-amber-500",
  pending_parent: "bg-purple-500",
  resolved: "bg-emerald-500",
  closed: "bg-gray-400",
};

const statusLabels: Record<string, string> = {
  new: "New",
  open: "Open",
  pending_parent: "Pending Parent",
  resolved: "Resolved",
  closed: "Closed",
};

function formatHours(hours: number | null): string {
  if (hours === null) return "\u2014";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours * 10) / 10}h`;
  return `${Math.round(hours / 24 * 10) / 10}d`;
}

export function TicketAnalytics() {
  const [rangeDays, setRangeDays] = useState(30);

  const { data, isLoading } = useQuery<TicketAnalyticsData>({
    queryKey: ["ticket-analytics", rangeDays],
    queryFn: async () => {
      const res = await fetch(`/api/tickets/analytics?days=${rangeDays}`);
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin w-8 h-8 border-2 border-brand border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!data) return null;

  const maxPriority = Math.max(...Object.values(data.byPriority), 1);
  const maxStatus = Math.max(...Object.values(data.byStatus), 1);

  return (
    <div className="space-y-6">
      {/* Date Range Selector */}
      <div className="flex items-center gap-2">
        {[7, 30, 90].map((days) => (
          <button
            key={days}
            onClick={() => setRangeDays(days)}
            className={cn(
              "px-3 py-1.5 text-sm font-medium rounded-lg transition-colors",
              rangeDays === days
                ? "bg-brand text-white"
                : "bg-surface text-muted hover:bg-border"
            )}
          >
            {days}d
          </button>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="w-4 h-4 text-brand" />
            <span className="text-xs font-medium text-muted uppercase tracking-wider">Total Tickets</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{data.totalTickets}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-medium text-muted uppercase tracking-wider">Avg First Response</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatHours(data.avgFirstResponseHours)}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-medium text-muted uppercase tracking-wider">Avg Resolution</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatHours(data.avgResolutionHours)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Priority */}
        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-muted" />
            By Priority
          </h3>
          <div className="space-y-3">
            {Object.entries(data.byPriority).sort(([,a], [,b]) => b - a).map(([priority, count]) => (
              <div key={priority} className="flex items-center gap-3">
                <span className="text-xs font-medium text-muted w-16 capitalize">{priority}</span>
                <div className="flex-1 h-6 bg-surface rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", priorityColors[priority] || "bg-gray-400")}
                    style={{ width: `${(count / maxPriority) * 100}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-foreground w-8 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* By Status */}
        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-muted" />
            By Status
          </h3>
          <div className="space-y-3">
            {Object.entries(data.byStatus).sort(([,a], [,b]) => b - a).map(([status, count]) => (
              <div key={status} className="flex items-center gap-3">
                <span className="text-xs font-medium text-muted w-24">{statusLabels[status] || status}</span>
                <div className="flex-1 h-6 bg-surface rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", statusColors[status] || "bg-gray-400")}
                    style={{ width: `${(count / maxStatus) * 100}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-foreground w-8 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* By Centre */}
        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-muted" />
            By Centre
          </h3>
          {data.byCentre.length > 0 ? (
            <div className="space-y-2">
              {data.byCentre.map((centre) => (
                <div key={centre.code} className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-surface">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-brand bg-brand/10 px-1.5 py-0.5 rounded">{centre.code}</span>
                    <span className="text-sm text-foreground/80">{centre.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-foreground">{centre.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted italic">No centre data</p>
          )}
        </div>

        {/* Agent Leaderboard */}
        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" />
            Agent Leaderboard
          </h3>
          {data.agentWorkload.length > 0 ? (
            <div className="space-y-2">
              {data.agentWorkload.map((agent, i) => (
                <div key={agent.id} className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-surface">
                  <span className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                    i === 0 ? "bg-amber-100 text-amber-700" : i === 1 ? "bg-border text-muted" : i === 2 ? "bg-orange-100 text-orange-700" : "bg-surface text-muted"
                  )}>
                    {i + 1}
                  </span>
                  <span className="text-sm text-foreground/80 flex-1">{agent.name}</span>
                  <span className="text-sm font-semibold text-foreground">{agent.ticketCount} tickets</span>
                  <span className="text-xs text-muted">
                    {agent.avgResponseHours !== null ? `${formatHours(agent.avgResponseHours)} avg` : ""}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted italic">No assigned tickets</p>
          )}
        </div>
      </div>
    </div>
  );
}
