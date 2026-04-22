"use client";

import { CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_CONFIG } from "./constants";

/**
 * Small status pill used in both list rows and the detail panel.
 */
export function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.contract_draft;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full",
        config.bg,
        config.text
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", config.dot)} />
      {config.label}
    </span>
  );
}

/**
 * Acknowledgement indicator — green when staff has acknowledged,
 * amber otherwise.
 */
export function AcknowledgeBadge({ acknowledged }: { acknowledged: boolean }) {
  return acknowledged ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
      <CheckCircle2 className="w-3 h-3" />
      Acknowledged
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
      <Clock className="w-3 h-3" />
      Pending
    </span>
  );
}
