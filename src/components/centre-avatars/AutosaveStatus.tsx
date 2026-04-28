"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, AlertTriangle, CircleDot } from "lucide-react";
import type { AutosaveStatus as AutosaveStatusValue } from "@/hooks/useAutosave";

interface AutosaveStatusProps {
  status: AutosaveStatusValue;
  lastSavedAt: number | null;
  errorMessage?: string | null;
}

function formatRelative(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const sec = Math.floor(diff / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min === 1) return "1 min ago";
  if (min < 60) return `${min} min ago`;
  return new Date(ts).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });
}

export function AutosaveStatus({ status, lastSavedAt, errorMessage }: AutosaveStatusProps) {
  // Force re-render every 15s so "Saved 2 min ago" stays current without polling.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!lastSavedAt) return;
    const id = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, [lastSavedAt]);

  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted">
        <Loader2 className="w-3 h-3 animate-spin" />
        Saving…
      </span>
    );
  }
  if (status === "dirty") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-amber-700">
        <CircleDot className="w-3 h-3" />
        Unsaved changes
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-red-700" title={errorMessage ?? "Save failed"}>
        <AlertTriangle className="w-3 h-3" />
        Save failed — keep editing or hit Save to retry
      </span>
    );
  }
  if (status === "saved" && lastSavedAt) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-green-700">
        <Check className="w-3 h-3" />
        Saved {formatRelative(lastSavedAt)}
      </span>
    );
  }
  if (lastSavedAt) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted">
        <Check className="w-3 h-3" />
        Last saved {formatRelative(lastSavedAt)}
      </span>
    );
  }
  return null;
}
