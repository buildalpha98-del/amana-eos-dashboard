"use client";

const platformColors: Record<string, string> = {
  facebook: "bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300",
  instagram: "bg-pink-100 dark:bg-pink-950/50 text-pink-700 dark:text-pink-300",
  linkedin: "bg-sky-100 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300",
  email: "bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300",
  newsletter: "bg-teal-100 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300",
  website: "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300",
  flyer: "bg-orange-100 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300",
};

interface PlatformBadgeProps {
  platform: string;
}

export function PlatformBadge({ platform }: PlatformBadgeProps) {
  const colors =
    platformColors[platform.toLowerCase()] ?? "bg-surface text-foreground/80";

  const label = platform.charAt(0).toUpperCase() + platform.slice(1);

  return (
    <span
      className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${colors}`}
    >
      {label}
    </span>
  );
}
