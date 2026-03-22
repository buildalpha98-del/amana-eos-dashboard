"use client";

import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import type { DataRoomItem } from "@/hooks/useDataRoom";

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; bg: string; label: string }> = {
  present: { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50", label: "Present" },
  missing: { icon: XCircle, color: "text-red-500", bg: "bg-red-50", label: "Missing" },
  expired: { icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-50", label: "Expired" },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function DocumentRow({ item }: { item: DataRoomItem }) {
  const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.missing;
  const Icon = cfg.icon;

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-surface/50 transition-colors">
      {/* Status icon */}
      <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${cfg.bg}`}>
        <Icon className={`w-4 h-4 ${cfg.color}`} />
      </div>

      {/* Label */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{item.label}</p>
      </div>

      {/* Count badge */}
      <span
        className={`flex-shrink-0 px-2.5 py-0.5 rounded-full text-xs font-medium ${
          item.status === "present"
            ? "bg-emerald-50 text-emerald-700"
            : item.status === "expired"
              ? "bg-amber-50 text-amber-700"
              : "bg-red-50 text-red-600"
        }`}
      >
        {item.status === "missing" ? "Missing" : `${item.count} record${item.count !== 1 ? "s" : ""}`}
      </span>

      {/* Last updated */}
      <span className="flex-shrink-0 text-xs text-muted w-24 text-right hidden sm:block">
        {item.lastUpdated ? formatDate(item.lastUpdated) : "—"}
      </span>
    </div>
  );
}
