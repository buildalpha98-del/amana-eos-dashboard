"use client";

import { useUpdateService } from "@/hooks/useServices";
import { cn } from "@/lib/utils";

const statusOptions = [
  { key: "active", label: "Active", color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  { key: "onboarding", label: "Onboarding", color: "bg-blue-100 text-blue-700 border-blue-300" },
  { key: "pipeline", label: "Pipeline", color: "bg-purple-100 text-purple-700 border-purple-300" },
  { key: "closing", label: "Closing", color: "bg-amber-100 text-amber-700 border-amber-300" },
  { key: "closed", label: "Closed", color: "bg-gray-100 text-gray-500 border-gray-300" },
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
