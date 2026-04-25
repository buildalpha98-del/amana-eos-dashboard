"use client";

import type { VendorBriefStatus } from "@prisma/client";

const STYLES: Record<VendorBriefStatus, { className: string; label: string }> = {
  draft: { className: "bg-surface text-foreground/70 border-border", label: "Draft" },
  brief_sent: {
    className: "bg-sky-50 text-sky-700 border-sky-200",
    label: "Brief sent",
  },
  awaiting_ack: {
    className: "bg-sky-50 text-sky-700 border-sky-200",
    label: "Awaiting ack",
  },
  awaiting_quote: {
    className: "bg-indigo-50 text-indigo-700 border-indigo-200",
    label: "Awaiting quote",
  },
  quote_received: {
    className: "bg-violet-50 text-violet-700 border-violet-200",
    label: "Quote received",
  },
  approved: {
    className: "bg-blue-50 text-blue-700 border-blue-200",
    label: "Approved",
  },
  ordered: {
    className: "bg-cyan-50 text-cyan-700 border-cyan-200",
    label: "Ordered",
  },
  delivered: {
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    label: "Delivered",
  },
  installed: {
    className: "bg-emerald-100 text-emerald-800 border-emerald-300",
    label: "Installed",
  },
  cancelled: {
    className: "bg-rose-50 text-rose-700 border-rose-200",
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
