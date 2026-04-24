"use client";

/**
 * OfflineSyncBadge — top-bar chip that surfaces pending + failed mutations
 * from the IndexedDB queue. Invisible when zero of both.
 */

import { useEffect, useState } from "react";
import { offlineQueue } from "@/lib/offline-queue";
import { CloudOff, AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export function OfflineSyncBadge() {
  const [counts, setCounts] = useState<{ pending: number; failed: number }>({
    pending: 0,
    failed: 0,
  });
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    return offlineQueue.subscribe(setCounts);
  }, []);

  if (counts.pending === 0 && counts.failed === 0) return null;

  async function retry() {
    setRetrying(true);
    await offlineQueue.drain();
    setRetrying(false);
  }

  return (
    <button
      type="button"
      onClick={retry}
      disabled={retrying}
      aria-label="Retry offline sync"
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-[var(--radius-sm)]",
        "text-[11px] font-medium transition-colors",
        counts.failed > 0
          ? "bg-rose-100 text-rose-800 hover:bg-rose-200"
          : "bg-amber-100 text-amber-800 hover:bg-amber-200",
      )}
    >
      {retrying ? (
        <RefreshCw className="w-3 h-3 animate-spin" />
      ) : counts.failed > 0 ? (
        <AlertCircle className="w-3 h-3" />
      ) : (
        <CloudOff className="w-3 h-3" />
      )}
      <span>
        {retrying
          ? "Syncing…"
          : counts.failed > 0
            ? `${counts.failed} failed`
            : `${counts.pending} pending`}
      </span>
    </button>
  );
}
