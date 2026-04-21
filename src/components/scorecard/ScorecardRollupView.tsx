"use client";

import { useScorecardRollup } from "@/hooks/useScorecardRollup";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

function formatCell(value: number | null, unit: string | null): string {
  if (value == null) return "—";
  const formatted = Number.isInteger(value) ? value.toString() : value.toFixed(1);
  return unit ? `${formatted}${unit}` : formatted;
}

export function ScorecardRollupView({ enabled }: { enabled: boolean }) {
  const { data, isLoading, error, refetch } = useScorecardRollup(enabled);

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (error) return <ErrorState title="Failed to load rollup" error={error as Error} onRetry={refetch} />;
  if (!data || data.rows.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No measurables to roll up"
        description="Add measurables on /scorecard to see them aggregated here."
      />
    );
  }

  const hasOrgColumn = data.rows.some((r) => r.byService._org);

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface/50">
            <th className="sticky left-0 bg-surface/50 text-left font-medium text-muted px-4 py-3 z-10">Measurable</th>
            <th className="text-right font-medium text-muted px-3 py-3 whitespace-nowrap">Goal</th>
            {hasOrgColumn && <th className="text-center font-medium text-muted px-3 py-3 whitespace-nowrap">Org</th>}
            {data.services.map((s) => (
              <th key={s.id} className="text-center font-medium text-muted px-3 py-3 whitespace-nowrap" title={s.name}>
                {s.code || s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => {
            const goalLabel =
              row.goalDirection === "above" ? `≥ ${row.goalValue}`
              : row.goalDirection === "below" ? `≤ ${row.goalValue}`
              : `= ${row.goalValue}`;
            return (
              <tr key={row.title} className="border-b border-border/50 hover:bg-surface/50">
                <td className="sticky left-0 bg-card hover:bg-surface/50 font-medium text-foreground px-4 py-2.5">{row.title}</td>
                <td className="text-right text-muted px-3 py-2.5 whitespace-nowrap">
                  {goalLabel}{row.unit ?? ""}
                </td>
                {hasOrgColumn && (
                  <td className={cn(
                    "text-center px-3 py-2.5",
                    row.byService._org?.onTrack === false && "text-red-600 font-medium",
                    row.byService._org?.onTrack === true && "text-emerald-700"
                  )}>
                    {formatCell(row.byService._org?.value ?? null, row.unit)}
                  </td>
                )}
                {data.services.map((s) => {
                  const cell = row.byService[s.id];
                  return (
                    <td key={s.id} className={cn(
                      "text-center px-3 py-2.5",
                      cell?.onTrack === false && "text-red-600 font-medium",
                      cell?.onTrack === true && "text-emerald-700"
                    )}>
                      {formatCell(cell?.value ?? null, row.unit)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
