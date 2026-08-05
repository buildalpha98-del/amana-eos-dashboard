"use client";

import type { CreativeRequestItem } from "@/hooks/useCreativeRequests";
import { TYPE_LABELS, effectiveDueDate } from "@/lib/creative-request/constants";

function pausedChip() {
  return (
    <span className="text-2xs italic font-semibold rounded px-1.5 py-0.5 bg-surface text-muted">
      ⏸ Waiting on centre
    </span>
  );
}

function dueChip(dueDate: Date, status: string) {
  if (["delivered", "cancelled"].includes(status)) return null;
  const days = Math.ceil((dueDate.getTime() - Date.now()) / 86_400_000);
  if (days < 0)
    return (
      <span className="text-2xs font-semibold rounded px-1.5 py-0.5 bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300">
        {Math.abs(days)}d overdue
      </span>
    );
  if (days === 0)
    return (
      <span className="text-2xs font-semibold rounded px-1.5 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
        Due today
      </span>
    );
  if (days <= 2)
    return (
      <span className="text-2xs font-semibold rounded px-1.5 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
        Due in {days}d
      </span>
    );
  return (
    <span className="text-2xs font-semibold rounded px-1.5 py-0.5 bg-surface text-muted">
      Due in {days}d
    </span>
  );
}

export function RequestCard({
  request,
  onOpen,
}: {
  request: CreativeRequestItem;
  onOpen: (id: string) => void;
}) {
  const due = effectiveDueDate(
    new Date(request.dueDate),
    request.pausedMs,
    request.pausedAt ? new Date(request.pausedAt) : null,
  );
  return (
    <button
      type="button"
      onClick={() => onOpen(request.id)}
      className="w-full text-left bg-card border border-border rounded-lg p-3 hover:shadow-sm transition-shadow"
    >
      <div className="text-2xs font-mono text-muted">{request.requestNumber}</div>
      <div className="text-sm font-medium text-foreground mt-0.5 line-clamp-2">
        {request.title}
      </div>
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <span className="text-2xs font-semibold rounded px-1.5 py-0.5 bg-surface text-muted">
          {TYPE_LABELS[request.type]}
        </span>
        {request.pausedAt ? pausedChip() : dueChip(due, request.status)}
        {request.service && (
          <span className="text-2xs text-muted">{request.service.name}</span>
        )}
        {request.assignee?.name && (
          <span
            className="ml-auto w-5 h-5 rounded-full bg-brand text-white text-2xs font-bold flex items-center justify-center"
            title={request.assignee.name}
          >
            {request.assignee.name.slice(0, 1).toUpperCase()}
          </span>
        )}
      </div>
    </button>
  );
}
