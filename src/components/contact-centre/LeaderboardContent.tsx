"use client";

import { useState } from "react";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

function formatMinutes(m: number | null): string {
  if (m == null) return "—";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

interface Props {
  /** If true, only render the table (no PageHeader) — used for embedding in /leadership. */
  embedded?: boolean;
}

export function LeaderboardContent({ embedded = false }: Props) {
  const [days, setDays] = useState(30);
  const { data, isLoading, error, refetch } = useLeaderboard(days);

  return (
    <div className={embedded ? "" : "space-y-4"}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-brand" />
          <h3 className="text-lg font-semibold text-foreground">Coordinator Leaderboard</h3>
        </div>
        <div className="inline-flex rounded-lg border border-border bg-surface/50 p-0.5 text-xs">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={cn(
                "px-3 py-1 rounded-md font-medium transition-colors",
                days === d ? "bg-card text-brand shadow-sm" : "text-muted hover:text-foreground"
              )}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : error ? (
        <ErrorState title="Failed to load leaderboard" error={error as Error} onRetry={refetch} />
      ) : !data || data.rows.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No activity in this window"
          description="Try extending the window, or wait for coordinators to pick up tickets and enquiries."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface/50 text-left text-muted">
                <th className="px-4 py-2.5 font-medium">Coordinator</th>
                <th className="px-3 py-2.5 font-medium text-right">Tickets assigned</th>
                <th className="px-3 py-2.5 font-medium text-right">Resolved</th>
                <th className="px-3 py-2.5 font-medium text-right">Avg first response</th>
                <th className="px-3 py-2.5 font-medium text-right">Enquiries</th>
                <th className="px-3 py-2.5 font-medium text-right">Converted</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.userId} className="border-b border-border/50">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {r.avatar ? (
                        <img src={r.avatar} alt={r.name} className="h-7 w-7 rounded-full object-cover" />
                      ) : (
                        <div className="h-7 w-7 rounded-full bg-brand text-white text-[10px] flex items-center justify-center font-medium">
                          {r.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-foreground">{r.name}</p>
                        <p className="text-xs text-muted">{r.role}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-foreground">{r.ticketsAssigned}</td>
                  <td className="px-3 py-2.5 text-right text-emerald-700">{r.ticketsResolved}</td>
                  <td className="px-3 py-2.5 text-right text-muted">{formatMinutes(r.avgFirstResponseMin)}</td>
                  <td className="px-3 py-2.5 text-right text-foreground">{r.enquiriesTotal}</td>
                  <td className="px-3 py-2.5 text-right text-emerald-700">
                    {r.enquiriesConverted}
                    {r.enquiriesTotal > 0 && (
                      <span className="text-xs text-muted ml-1">
                        ({Math.round((r.enquiriesConverted / r.enquiriesTotal) * 100)}%)
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 py-2 text-xs text-muted">
            Sample size: {data.rows.reduce((s, r) => s + r.ticketsAssigned + r.enquiriesTotal, 0)} items over {data.days}d — smaller services naturally have smaller counts.
          </p>
        </div>
      )}
    </div>
  );
}
