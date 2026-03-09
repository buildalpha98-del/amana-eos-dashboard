"use client";

import type { IssueData } from "@/hooks/useIssues";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  AlertTriangle,
  ArrowUp,
  Minus,
  ArrowDown,
  Mountain,
  CheckSquare,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Clock,
  GripVertical,
} from "lucide-react";

const priorityConfig = {
  critical: {
    label: "Critical",
    icon: AlertCircle,
    color: "text-red-600",
    bg: "bg-red-50 border-red-200",
    badge: "bg-red-100 text-red-700",
  },
  high: {
    label: "High",
    icon: ArrowUp,
    color: "text-orange-600",
    bg: "bg-orange-50 border-orange-200",
    badge: "bg-orange-100 text-orange-700",
  },
  medium: {
    label: "Medium",
    icon: Minus,
    color: "text-yellow-600",
    bg: "bg-white border-gray-200",
    badge: "bg-yellow-100 text-yellow-700",
  },
  low: {
    label: "Low",
    icon: ArrowDown,
    color: "text-blue-600",
    bg: "bg-white border-gray-200",
    badge: "bg-blue-100 text-blue-700",
  },
};

const statusConfig = {
  open: {
    label: "Identify",
    icon: AlertTriangle,
    color: "text-amber-600",
    bg: "bg-amber-50",
  },
  in_discussion: {
    label: "Discuss",
    icon: MessageSquare,
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
  solved: {
    label: "Solve",
    icon: CheckCircle2,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
  },
  closed: {
    label: "Closed",
    icon: XCircle,
    color: "text-gray-400",
    bg: "bg-gray-50",
  },
};

export function IssueCard({
  issue,
  onClick,
  isDragging,
}: {
  issue: IssueData;
  onClick: () => void;
  isDragging?: boolean;
}) {
  const p = priorityConfig[issue.priority];
  const s = statusConfig[issue.status];
  const PriorityIcon = p.icon;
  const StatusIcon = s.icon;

  // Calculate days open
  const daysOpen = issue.status !== "closed" && issue.status !== "solved"
    ? Math.floor((Date.now() - new Date(issue.identifiedAt).getTime()) / 86400000)
    : null;

  return (
    <div
      onClick={onClick}
      className={cn(
        "w-full text-left p-4 rounded-xl border transition-all hover:shadow-md cursor-pointer group/card",
        issue.status === "closed" ? "opacity-60" : "",
        isDragging && "shadow-lg rotate-1 opacity-90",
        p.bg
      )}
    >
      <div className="flex items-start gap-3">
        {/* Drag Handle */}
        <GripVertical className="w-4 h-4 text-gray-300 opacity-0 group-hover/card:opacity-100 transition-opacity mt-0.5 flex-shrink-0" />

        {/* Priority Icon */}
        <div className={cn("mt-0.5 flex-shrink-0", p.color)}>
          <PriorityIcon className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0">
          {/* Title */}
          <h4 className="text-sm font-semibold text-gray-900 leading-snug">
            {issue.title}
          </h4>

          {/* Description preview */}
          {issue.description && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">
              {issue.description}
            </p>
          )}

          {/* Meta */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {/* Status badge */}
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
                s.bg,
                s.color
              )}
            >
              <StatusIcon className="w-3 h-3" />
              {s.label}
            </span>

            {/* Priority badge */}
            <span
              className={cn(
                "text-xs font-medium px-2 py-0.5 rounded-full",
                p.badge
              )}
            >
              {p.label}
            </span>

            {/* Linked Rock */}
            {issue.rock && (
              <span className="inline-flex items-center gap-1 text-xs text-brand bg-brand/5 px-1.5 py-0.5 rounded">
                <Mountain className="w-3 h-3" />
                <span className="truncate max-w-[100px]">{issue.rock.title}</span>
              </span>
            )}

            {/* Spawned Todos count */}
            {issue._count.spawnedTodos > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                <CheckSquare className="w-3 h-3" />
                {issue._count.spawnedTodos}
              </span>
            )}

            {/* Days open badge */}
            {daysOpen !== null && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full",
                  daysOpen >= 14
                    ? "bg-red-100 text-red-700"
                    : daysOpen >= 7
                    ? "bg-amber-100 text-amber-700"
                    : "bg-gray-100 text-gray-500"
                )}
              >
                <Clock className="w-3 h-3" />
                {daysOpen}d
              </span>
            )}
          </div>

          {/* Owner / Raised by */}
          <div className="flex items-center gap-3 mt-2">
            {issue.owner && (
              <span className="text-xs text-gray-400">
                Owner: <span className="text-gray-600">{issue.owner.name}</span>
              </span>
            )}
            <span className="text-xs text-gray-400">
              Raised by{" "}
              <span className="text-gray-500">{issue.raisedBy.name}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
