"use client";

const STATUS_META: Record<string, { label: string; classes: string }> = {
  logged: { label: "Logged", classes: "bg-surface text-muted border border-border" },
  director_verified: {
    label: "Verified",
    classes: "bg-brand/10 text-brand border border-brand/20",
  },
  sm_approved: {
    label: "SM approved",
    classes: "bg-brand text-white",
  },
  sent_to_payroll: {
    label: "Sent to payroll",
    classes: "bg-accent text-brand",
  },
  paid: {
    label: "Paid",
    classes: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  rejected: {
    label: "Rejected",
    classes: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  },
};

export function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? {
    label: status,
    classes: "bg-surface text-muted border border-border",
  };
  return (
    <span
      className={`text-2xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${meta.classes}`}
    >
      {meta.label}
    </span>
  );
}
