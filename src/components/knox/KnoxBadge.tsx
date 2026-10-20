import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { KnoxTier } from "@/lib/knox/format";

const TIER_LABELS: Record<KnoxTier, string> = {
  minor: "Minor",
  moderate: "Moderate",
  serious: "Serious",
};

export function tierLabel(tier: KnoxTier): string {
  return TIER_LABELS[tier];
}

/** Chip colours: minor stays neutral, moderate amber, serious red — each with a dark pair. */
export function tierClasses(tier: KnoxTier): string {
  switch (tier) {
    case "serious":
      return "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200";
    case "moderate":
      return "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200";
    case "minor":
      return "bg-surface text-muted";
  }
}

/** Surface tint for a panel or list item; minor gets no tint. */
export function tierTint(tier: KnoxTier): string {
  switch (tier) {
    case "serious":
      return "bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-900";
    case "moderate":
      return "bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-900";
    case "minor":
      return "bg-card border-border";
  }
}

/** Plain tier chip (no link), e.g. in the Knox panel header. */
export function KnoxTierChip({ tier, className }: { tier: KnoxTier; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium",
        tierClasses(tier),
        className,
      )}
    >
      <ShieldAlert className="h-3 w-3" aria-hidden />
      Knox · {tierLabel(tier)}
    </span>
  );
}

/** Register-row badge linking to the record's Knox view. Renders nothing when there is no tier. */
export function KnoxBadge({ tier, href }: { tier: KnoxTier | null | undefined; href: string }) {
  if (!tier) return null;
  return (
    <Link
      href={href}
      title={`Knox triage: ${tierLabel(tier)} — open`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium whitespace-nowrap hover:underline",
        tierClasses(tier),
      )}
    >
      <ShieldAlert className="h-3 w-3" aria-hidden />
      Knox · {tierLabel(tier)}
    </Link>
  );
}
