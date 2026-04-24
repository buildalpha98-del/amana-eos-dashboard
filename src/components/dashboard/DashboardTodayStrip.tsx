"use client";

/**
 * DashboardTodayStrip — v2 "at a glance" strip surfaced at the top of the
 * dashboard when the staff-v2 flag is active.
 *
 * Uses the four existing priority counters and renders them as warm-card
 * chips that link to the right page. Frame only — the underlying data is
 * fetched by the parent page and passed in.
 */

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  CheckSquare,
  Mountain,
  AlertCircle,
  Inbox,
  type LucideIcon,
} from "lucide-react";

export interface TodayStripCounts {
  overdueTodos: number;
  offTrackRocks: number;
  openIssues: number;
  pendingQueue: number;
}

export function DashboardTodayStrip({ counts }: { counts: TodayStripCounts }) {
  const items: Array<{
    label: string;
    count: number;
    icon: LucideIcon;
    href: string;
    urgent: boolean;
  }> = [
    {
      label: "Overdue to-dos",
      count: counts.overdueTodos,
      icon: CheckSquare,
      href: "/todos?status=overdue",
      urgent: counts.overdueTodos > 0,
    },
    {
      label: "Off-track rocks",
      count: counts.offTrackRocks,
      icon: Mountain,
      href: "/rocks?status=off-track",
      urgent: counts.offTrackRocks > 0,
    },
    {
      label: "Open issues",
      count: counts.openIssues,
      icon: AlertCircle,
      href: "/issues",
      urgent: counts.openIssues > 2,
    },
    {
      label: "My queue",
      count: counts.pendingQueue,
      icon: Inbox,
      href: "/queue",
      urgent: counts.pendingQueue > 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <Link
            key={it.label}
            href={it.href}
            className={cn(
              "warm-card-dense p-3 flex items-center gap-3",
              "hover:shadow-[var(--shadow-warm-md)] transition-shadow",
              it.urgent && "border-rose-300/60 bg-rose-50/40",
            )}
          >
            <div
              className={cn(
                "w-9 h-9 rounded-full shrink-0 flex items-center justify-center",
                it.urgent
                  ? "bg-rose-100 text-rose-700"
                  : "bg-[color:var(--color-brand-soft)] text-[color:var(--color-brand)]",
              )}
            >
              <Icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-[color:var(--color-muted)] uppercase tracking-wide">
                {it.label}
              </p>
              <p
                className={cn(
                  "text-lg font-heading font-bold leading-none mt-0.5",
                  it.urgent
                    ? "text-rose-700"
                    : "text-[color:var(--color-foreground)]",
                )}
              >
                {it.count}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
