"use client";

import type { VendorBriefStatus } from "@prisma/client";

const STYLES: Record<VendorBriefStatus, { className: string; label: string }> = {
  draft: { className: "bg-surface text-foreground/70 border-border", label: "Draft" },
  brief_sent: {
    className: "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800",
    label: "Brief sent",
  },
  awaiting_ack: {
    className: "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800",
    label: "Awaiting ack",
  },
  awaiting_quote: {
    className: "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800",
    label: "Awaiting quote",
  },
  quote_received: {
    className: "bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800",
    label: "Quote received",
  },
  approved: {
    className: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    label: "Approved",
  },
  ordered: {
    className: "bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800",
    label: "Ordered",
  },
  delivered: {
    className: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    label: "Delivered",
  },
  installed: {
    className: "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800",
    label: "Installed",
  },
  cancelled: {
    className: "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800",
    label: "Cancelled",
  },
};

export function StatusPill({ status }: { status: VendorBriefStatus }) {
  const s = STYLES[status];
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${s.className}`}
    >
      {s.label}
    </span>
  );
}
