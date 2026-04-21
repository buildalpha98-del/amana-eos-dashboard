"use client";

import { usePulseAdminSummary, type PulseServiceRow } from "@/hooks/useCommunication";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { Smile, Meh, Frown, AlertTriangle, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  weekOf: string;
}

function SentimentBar({ row, total }: { row: PulseServiceRow; total: number }) {
  if (total === 0) return <div className="h-2 bg-border rounded-full" />;
  const pos = (row.positive / total) * 100;
  const neu = (row.neutral / total) * 100;
  const con = (row.concerning / total) * 100;
  return (
    <div className="h-2 w-full rounded-full bg-border overflow-hidden flex">
      <div className="h-full bg-emerald-500" style={{ width: `${pos}%` }} />
      <div className="h-full bg-amber-400" style={{ width: `${neu}%` }} />
      <div className="h-full bg-red-500" style={{ width: `${con}%` }} />
    </div>
  );
}

export function PulseAdminView({ weekOf }: Props) {
  const { data, isLoading, error, refetch } = usePulseAdminSummary(weekOf, true);

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (error) return <ErrorState title="Failed to load admin pulse view" error={error as Error} onRetry={refetch} />;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted" />
            <span className="text-xs text-muted">Submitted</span>
          </div>
          <p className="text-2xl font-bold text-foreground mt-1">
            {data.org.submitted} <span className="text-sm text-muted">/ {data.org.totalUsers}</span>
          </p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <div className="flex items-center gap-2">
            <Smile className="h-4 w-4 text-emerald-600" />
            <span className="text-xs text-emerald-700">Positive</span>
          </div>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{data.org.positive}</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center gap-2">
            <Meh className="h-4 w-4 text-amber-600" />
            <span className="text-xs text-amber-700">Neutral</span>
          </div>
          <p className="text-2xl font-bold text-amber-700 mt-1">{data.org.neutral}</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <div className="flex items-center gap-2">
            <Frown className="h-4 w-4 text-red-600" />
            <span className="text-xs text-red-700">Concerning</span>
          </div>
          <p className="text-2xl font-bold text-red-700 mt-1">{data.org.concerning}</p>
        </div>
      </div>

      {data.org.blockerCount > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">
              {data.org.blockerCount} blocker{data.org.blockerCount === 1 ? "" : "s"} flagged this week
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Drill into a service for per-service breakdowns. Individual responses are visible only to service leaders in the Team Pulse view.
            </p>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface/50 text-left text-muted">
              <th className="px-4 py-2.5 font-medium">Service</th>
              <th className="px-3 py-2.5 font-medium text-right">Submitted</th>
              <th className="px-3 py-2.5 font-medium">Sentiment</th>
              <th className="px-3 py-2.5 font-medium text-right">Blockers</th>
            </tr>
          </thead>
          <tbody>
            {data.byService.map((row) => (
              <tr key={row.serviceId} className="border-b border-border/50">
                <td className="px-4 py-2.5 font-medium text-foreground">{row.serviceName}</td>
                <td className="px-3 py-2.5 text-right text-foreground whitespace-nowrap">
                  {row.submitted} / {row.totalUsers}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <SentimentBar row={row} total={row.submitted} />
                    <div className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                      <span className="text-emerald-700">{row.positive}</span>
                      <span className="text-amber-700">/ {row.neutral}</span>
                      <span className="text-red-700">/ {row.concerning}</span>
                    </div>
                  </div>
                </td>
                <td className={cn(
                  "px-3 py-2.5 text-right font-medium whitespace-nowrap",
                  row.blockerCount > 0 ? "text-amber-700" : "text-muted"
                )}>
                  {row.blockerCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted italic">
        Anonymous admin view — individual staff names and response content are never shown here. For named responses (leader-tier only), use the Team Pulse view.
      </p>
    </div>
  );
}
