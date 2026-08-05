"use client";

import { useCreativeRequests } from "@/hooks/useCreativeRequests";
import { STATUS_LABELS } from "@/lib/creative-request/constants";
import type { CreativeRequestStatus } from "@prisma/client";
import { RequestCard } from "./RequestCard";
import { Skeleton } from "@/components/ui/Skeleton";

const BOARD_COLUMNS: CreativeRequestStatus[] = [
  "new",
  "briefed",
  "in_progress",
  "in_review",
  "changes_requested",
  "approved",
  "delivered",
];

export function RequestBoard({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, isLoading } = useCreativeRequests();

  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2">
        {BOARD_COLUMNS.slice(0, 5).map((c) => (
          <Skeleton key={c} className="h-64 min-w-[220px] flex-1 rounded-lg" />
        ))}
      </div>
    );
  }

  const requests = data?.requests ?? [];

  return (
    <div className="flex gap-3 overflow-x-auto pb-2" aria-label="Request pipeline">
      {BOARD_COLUMNS.map((status) => {
        const items = requests.filter((r) => r.status === status);
        return (
          <div
            key={status}
            className="min-w-[220px] flex-1 bg-surface rounded-lg p-2.5"
          >
            <div className="flex items-center gap-2 px-1 pb-2">
              <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted">
                {STATUS_LABELS[status]}
              </h3>
              <span className="text-2xs bg-card border border-border rounded-full px-1.5 text-foreground">
                {items.length}
              </span>
            </div>
            <div className="space-y-2">
              {items.map((r) => (
                <RequestCard key={r.id} request={r} onOpen={onOpen} />
              ))}
              {items.length === 0 && (
                <p className="text-2xs text-muted px-1 py-3">Nothing here</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
