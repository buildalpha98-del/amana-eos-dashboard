"use client";

const campaignColors: Record<string, string> = {
  draft: "bg-surface text-foreground/80",
  scheduled: "bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300",
  active: "bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300",
  completed: "bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300",
  paused: "bg-yellow-100 dark:bg-yellow-950/50 text-yellow-700 dark:text-yellow-300",
  cancelled: "bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300",
};

const postColors: Record<string, string> = {
  draft: "bg-surface text-foreground/80",
  in_review: "bg-yellow-100 dark:bg-yellow-950/50 text-yellow-700 dark:text-yellow-300",
  approved: "bg-brand/10 text-brand",
  scheduled: "bg-brand/20 text-brand",
  published: "bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300",
};

interface StatusBadgeProps {
  status: string;
  type?: "campaign" | "post";
}

export function StatusBadge({ status, type = "campaign" }: StatusBadgeProps) {
  const colorMap = type === "post" ? postColors : campaignColors;
  const colors = colorMap[status.toLowerCase()] ?? "bg-surface text-foreground/80";

  const label = status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <span
      className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${colors}`}
    >
      {label}
    </span>
  );
}
