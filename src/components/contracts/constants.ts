/**
 * Shared labels, formatters and status config for the Contracts module.
 *
 * Copied verbatim from the previous monolithic page.tsx so the refactor
 * produces zero behavioural drift.
 */

export const CONTRACT_TYPE_LABELS: Record<string, string> = {
  ct_casual: "Casual",
  ct_part_time: "Part-Time",
  ct_permanent: "Permanent",
  ct_fixed_term: "Fixed Term",
};

export const AWARD_LEVEL_LABELS: Record<string, string> = {
  es1: "Education Support L1",
  es2: "Education Support L2",
  es3: "Education Support L3",
  es4: "Education Support L4",
  cs1: "Children's Services L1",
  cs2: "Children's Services L2",
  cs3: "Children's Services L3",
  cs4: "Children's Services L4",
  director: "Director",
  coordinator: "Coordinator",
  custom: "Custom",
};

export const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; dot: string }
> = {
  contract_draft: {
    label: "Draft",
    bg: "bg-surface",
    text: "text-foreground/80",
    dot: "bg-gray-400",
  },
  active: {
    label: "Active",
    bg: "bg-emerald-100",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
  },
  superseded: {
    label: "Superseded",
    bg: "bg-amber-100",
    text: "text-amber-700",
    dot: "bg-amber-500",
  },
  terminated: {
    label: "Terminated",
    bg: "bg-red-100",
    text: "text-red-700",
    dot: "bg-red-500",
  },
};

export const CONTRACT_TYPES = [
  "ct_casual",
  "ct_part_time",
  "ct_permanent",
  "ct_fixed_term",
];

export const AWARD_LEVELS = [
  "es1",
  "es2",
  "es3",
  "es4",
  "cs1",
  "cs2",
  "cs3",
  "cs4",
  "director",
  "member",
  "custom",
];

export interface UserOption {
  id: string;
  name: string;
  email: string;
  role: string;
}

export function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  }).format(amount);
}

export function daysUntilDate(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function getAwardLabel(
  level: string | null,
  custom: string | null
): string {
  if (!level) return "N/A";
  if (level === "custom") return custom || "Custom";
  return AWARD_LEVEL_LABELS[level] || level;
}
