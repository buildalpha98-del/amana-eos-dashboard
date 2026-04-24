"use client";

import { cn } from "@/lib/utils";

export type StatusVariant =
  | "in-care"
  | "confirmed"
  | "requested"
  | "waitlisted"
  | "declined"
  | "new"
  | "overdue";

const VARIANT_STYLES: Record<StatusVariant, { bg: string; fg: string; label: string }> = {
  "in-care": {
    bg: "var(--color-status-in-care-bg)",
    fg: "var(--color-status-in-care-fg)",
    label: "In care",
  },
  confirmed: {
    bg: "var(--color-status-confirmed-bg)",
    fg: "var(--color-status-confirmed-fg)",
    label: "Confirmed",
  },
  requested: {
    bg: "var(--color-status-pending-bg)",
    fg: "var(--color-status-pending-fg)",
    label: "Requested",
  },
  waitlisted: {
    bg: "var(--color-status-pending-bg)",
    fg: "var(--color-status-pending-fg)",
    label: "Requested",
  },
  declined: {
    bg: "var(--color-status-alert-bg)",
    fg: "var(--color-status-alert-fg)",
    label: "Declined",
  },
  new: {
    bg: "var(--color-status-confirmed-bg)",
    fg: "var(--color-status-confirmed-fg)",
    label: "New",
  },
  overdue: {
    bg: "var(--color-status-alert-bg)",
    fg: "var(--color-status-alert-fg)",
    label: "Overdue",
  },
};

interface StatusBadgeProps {
  variant: StatusVariant;
  label?: string;
  className?: string;
}

export function StatusBadge({ variant, label, className }: StatusBadgeProps) {
  const style = VARIANT_STYLES[variant];
  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        className,
      )}
      style={{ background: style.bg, color: style.fg }}
    >
      {label ?? style.label}
    </span>
  );
}
