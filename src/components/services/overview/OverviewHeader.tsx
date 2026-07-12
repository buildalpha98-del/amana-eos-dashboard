"use client";

import { useUpdateService } from "@/hooks/useServices";
import { cn } from "@/lib/utils";

const statusOptions = [
  { key: "active", label: "Active", color: "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800" },
  { key: "onboarding", label: "Onboarding", color: "bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-800" },
  { key: "pipeline", label: "Pipeline", color: "bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-800" },
  { key: "closing", label: "Closing", color: "bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800" },
  { key: "closed", label: "Closed", color: "bg-surface text-muted border-border" },
] as const;

export function OverviewHeader({
  service,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: any;
}) {
  const updateService = useUpdateService();

  return (
    <div>
      <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">
        Status
      </label>
      <div className="flex gap-1">
        {statusOptions.map((s) => (
          <button
            key={s.key}
            onClick={() =>
              updateService.mutate({ id: service.id, status: s.key })
            }
            className={cn(
              "flex-1 py-1.5 text-xs font-medium rounded-md border transition-colors",
              service.status === s.key
                ? s.color
                : "bg-card border-border text-muted hover:border-border"
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
