"use client";

/**
 * OffboardingAssignmentsList — in-flight offboardings with per-task
 * progress. Rendered inside the /onboarding Offboarding tab. Rows
 * expand to show the pack's task list; admins can tick tasks off
 * directly (useUpdateOffboardingProgress → same endpoint the staff
 * self-service card uses).
 *
 * 2026-09-04: introduced (Staff Portal v2 Phase 4, Task 4.1).
 */

import { useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Loader2,
} from "lucide-react";
import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import {
  useOffboardingAssignments,
  useUpdateOffboardingProgress,
  type StaffOffboardingData,
} from "@/hooks/useOffboarding";

const STATUS_CHIP: Record<
  StaffOffboardingData["status"],
  { className: string; label: string }
> = {
  not_started: { className: "bg-surface text-muted", label: "Not started" },
  in_progress: {
    className:
      "bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300",
    label: "In progress",
  },
  completed: {
    className:
      "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300",
    label: "Completed",
  },
};

export function OffboardingAssignmentsList({
  canManage,
}: {
  canManage: boolean;
}) {
  const { data: assignments = [], isLoading, error, refetch } =
    useOffboardingAssignments();
  const updateProgress = useUpdateOffboardingProgress();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [togglingTaskId, setTogglingTaskId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading offboarding assignments">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-4 py-6 text-center">
        <p className="text-sm text-rose-800 dark:text-rose-300">
          Couldn&apos;t load offboarding assignments.
        </p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={() => void refetch()}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="No offboarding in progress"
        description="When someone is leaving, start an offboarding to track their exit checklist here."
        variant="inline"
      />
    );
  }

  async function handleToggle(
    assignment: StaffOffboardingData,
    taskId: string,
    currentCompleted: boolean,
  ) {
    setTogglingTaskId(taskId);
    try {
      await updateProgress.mutateAsync({
        offboardingId: assignment.id,
        taskId,
        completed: !currentCompleted,
      });
    } catch {
      // Error toast handled by the mutation's onError.
    } finally {
      setTogglingTaskId(null);
    }
  }

  return (
    <ul className="space-y-3">
      {assignments.map((a) => {
        const total = a.pack._count.tasks;
        const done = a.progress.filter((p) => p.completed).length;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        const expanded = expandedId === a.id;
        const chip = STATUS_CHIP[a.status];

        return (
          <li
            key={a.id}
            className="rounded-xl border border-border bg-card"
            data-testid={`offboarding-assignment-${a.id}`}
          >
            <button
              type="button"
              onClick={() => setExpandedId(expanded ? null : a.id)}
              aria-expanded={expanded}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface/50 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {expanded ? (
                <ChevronDown className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
              )}
              <StaffAvatar
                user={{ id: a.user.id, name: a.user.name, avatar: a.user.avatar }}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">
                  {a.user.name}
                </p>
                <p className="text-xs text-muted truncate">
                  {a.pack.name}
                  {a.lastDay
                    ? ` · last day ${new Date(a.lastDay).toLocaleDateString("en-AU")}`
                    : ""}
                </p>
              </div>
              <div className="hidden sm:flex items-center gap-2 w-36 shrink-0">
                <div
                  className="h-1.5 flex-1 rounded-full bg-surface overflow-hidden"
                  role="progressbar"
                  aria-valuenow={done}
                  aria-valuemin={0}
                  aria-valuemax={total}
                  aria-label={`${done} of ${total} tasks complete`}
                >
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-2xs text-muted tabular-nums">
                  {done}/{total}
                </span>
              </div>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-bold uppercase tracking-wide shrink-0",
                  chip.className,
                )}
              >
                {chip.label}
              </span>
            </button>

            {expanded ? (
              <div className="border-t border-border px-4 py-3">
                {a.progress.length === 0 ? (
                  <p className="text-sm text-muted italic">
                    This pack has no tasks.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {a.progress.map((p) => {
                      const toggling =
                        updateProgress.isPending && togglingTaskId === p.taskId;
                      return (
                        <li key={p.id} className="flex items-center gap-2">
                          {canManage ? (
                            <button
                              type="button"
                              onClick={() =>
                                void handleToggle(a, p.taskId, p.completed)
                              }
                              disabled={updateProgress.isPending}
                              aria-label={
                                p.completed
                                  ? `Mark "${p.task.title}" as not done`
                                  : `Mark "${p.task.title}" as done`
                              }
                              className="p-0.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
                            >
                              {toggling ? (
                                <Loader2 className="w-4 h-4 animate-spin text-muted" aria-hidden="true" />
                              ) : p.completed ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                              ) : (
                                <Circle className="w-4 h-4 text-muted" aria-hidden="true" />
                              )}
                            </button>
                          ) : p.completed ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                          ) : (
                            <Circle className="w-4 h-4 text-muted" aria-hidden="true" />
                          )}
                          <span
                            className={cn(
                              "text-sm",
                              p.completed
                                ? "text-muted line-through"
                                : "text-foreground",
                            )}
                          >
                            {p.task.title}
                          </span>
                          {p.task.isRequired ? (
                            <span className="text-2xs text-muted uppercase tracking-wide">
                              Required
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <Link
                  href={`/staff/${a.user.id}`}
                  className="mt-3 inline-block text-sm text-brand underline hover:no-underline"
                >
                  View {a.user.name.split(" ")[0]}&apos;s profile
                </Link>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
