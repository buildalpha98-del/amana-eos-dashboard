"use client";

import type { RockData } from "@/hooks/useRocks";
import { cn } from "@/lib/utils";
import {
  MessageSquare,
  CheckSquare,
  AlertCircle,
  GripVertical,
  Building2,
  User,
} from "lucide-react";

const priorityConfig = {
  critical: { label: "Critical", bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  high: { label: "High", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  medium: { label: "Medium", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
};

const statusColors = {
  on_track: "#10B981",
  off_track: "#EF4444",
  complete: "#004E64",
  dropped: "#9CA3AF",
};

export function RockCard({
  rock,
  onClick,
  isDragging,
}: {
  rock: RockData;
  onClick: () => void;
  isDragging?: boolean;
}) {
  const priority = priorityConfig[rock.priority];

  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-card rounded-lg border border-border p-4 cursor-pointer hover:shadow-md transition-all duration-150 group",
        isDragging && "shadow-lg rotate-1 opacity-90"
      )}
    >
      {/* Header: Priority + Type + Grip */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider",
              priority.bg,
              priority.text
            )}
          >
            {priority.label}
          </span>
          {rock.rockType === "company" ? (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-purple-50 text-purple-700">
              <Building2 className="w-2.5 h-2.5" />
              Co.
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-surface/50 text-muted">
              <User className="w-2.5 h-2.5" />
              Personal
            </span>
          )}
        </div>
        <GripVertical className="w-4 h-4 text-muted/50 md:opacity-0 md:group-hover:opacity-100 opacity-60 transition-opacity" />
      </div>

      {/* Title */}
      <h4 className="text-sm font-semibold text-foreground mb-2 line-clamp-2">
        {rock.title}
      </h4>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-medium text-muted uppercase tracking-wider">
            Progress
          </span>
          <span className="text-xs font-semibold text-foreground/80">
            {rock.percentComplete}%
          </span>
        </div>
        <div className="w-full h-1.5 bg-surface rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${rock.percentComplete}%`,
              backgroundColor: statusColors[rock.status],
            }}
          />
        </div>
      </div>

      {/* Footer: Owner + Counts */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-brand/10 flex items-center justify-center">
            <span className="text-[10px] font-medium text-brand">
              {(rock.owner?.name ?? "Unassigned")
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2)}
            </span>
          </div>
          <span className="text-xs text-muted truncate max-w-[100px]">
            {rock.owner?.name ?? "Unassigned"}
          </span>
        </div>

        <div className="flex items-center gap-2 text-muted">
          {rock._count.todos > 0 && (
            <span className="flex items-center gap-0.5 text-xs">
              <CheckSquare className="w-3 h-3" />
              {rock._count.todos}
            </span>
          )}
          {rock._count.issues > 0 && (
            <span className="flex items-center gap-0.5 text-xs">
              <AlertCircle className="w-3 h-3" />
              {rock._count.issues}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
