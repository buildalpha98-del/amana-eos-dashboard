"use client";

import { useState } from "react";
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

const ARCHIVE_AFTER_MS = 14 * 86_400_000;

function isArchivedDelivery(deliveredAt: string | null): boolean {
  if (!deliveredAt) return false;
  return Date.now() - new Date(deliveredAt).getTime() >= ARCHIVE_AFTER_MS;
}

export function RequestBoard({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, isLoading } = useCreativeRequests();
  const [showArchivedDelivered, setShowArchivedDelivered] = useState(false);

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
        const columnItems = requests.filter((r) => r.status === status);
        const isDelivered = status === "delivered";
        const visibleItems =
          isDelivered && !showArchivedDelivered
            ? columnItems.filter((r) => !isArchivedDelivery(r.deliveredAt))
            : columnItems;
        const archivedCount = isDelivered
          ? columnItems.filter((r) => isArchivedDelivery(r.deliveredAt)).length
          : 0;
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
                {visibleItems.length}
              </span>
            </div>
            <div className="space-y-2">
              {visibleItems.map((r) => (
                <RequestCard key={r.id} request={r} onOpen={onOpen} />
              ))}
              {visibleItems.length === 0 && (
                <p className="text-2xs text-muted px-1 py-3">Nothing here</p>
              )}
            </div>
            {isDelivered && archivedCount > 0 && (
              <button
                type="button"
                onClick={() => setShowArchivedDelivered((v) => !v)}
                className="text-2xs text-muted px-1 pt-2 hover:text-foreground"
              >
                {showArchivedDelivered
                  ? "Hide archived"
                  : `${archivedCount} archived · Show`}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
