"use client";

/**
 * NeedsYouQueue — the action half of the operator home (2026-07-06
 * design system). One ranked list of everything waiting on the reader,
 * replacing the old count-only AlertBanner with the actual items:
 *
 *   now    — overdue to-dos, critical IDS issues
 *   soon   — overdue rocks, non-critical IDS issues
 *   review — unassigned tickets
 *
 * Every row deep-links to the record (the ⌘K id-param routes). Quiet
 * when nothing needs the reader — an "all clear" line, not an empty box.
 */

import Link from "next/link";
import { ChevronRight, CheckCircle2 } from "lucide-react";
import { StatusChip, type StatusChipLevel } from "@/components/ui/StatusChip";

export interface NeedsYouActionItems {
  overdueTodos: { id: string; title: string; assigneeName: string; dueDate: string }[];
  unassignedTickets: { id: string; ticketNumber: number; subject: string }[];
  idsIssues: { id: string; title: string; priority: string }[];
  overdueRocks: { id: string; title: string; ownerName: string; quarter: string }[];
}

const MAX_ROWS = 8;

interface QueueRow {
  key: string;
  level: StatusChipLevel;
  label: string;
  title: string;
  href: string;
}

const LEVEL_ORDER: Record<StatusChipLevel, number> = {
  now: 0,
  soon: 1,
  review: 2,
  queue: 3,
};

export function NeedsYouQueue({
  actionItems,
}: {
  actionItems: NeedsYouActionItems;
}) {
  const rows: QueueRow[] = [
    ...actionItems.overdueTodos.map((t) => ({
      key: `todo-${t.id}`,
      level: "now" as const,
      label: "Now",
      title: `Overdue to-do: ${t.title}`,
      href: `/todos?id=${t.id}`,
    })),
    ...actionItems.idsIssues.map((i) => ({
      key: `issue-${i.id}`,
      level: (i.priority === "critical" ? "now" : "soon") as StatusChipLevel,
      label: i.priority === "critical" ? "Now" : "Soon",
      title: `${i.priority === "critical" ? "Critical issue" : "Open issue"}: ${i.title}`,
      href: `/issues?id=${i.id}`,
    })),
    ...actionItems.overdueRocks.map((r) => ({
      key: `rock-${r.id}`,
      level: "soon" as const,
      label: "Soon",
      title: `Rock overdue (${r.ownerName}): ${r.title}`,
      href: `/rocks?id=${r.id}`,
    })),
    ...actionItems.unassignedTickets.map((t) => ({
      key: `ticket-${t.id}`,
      level: "review" as const,
      label: "Review",
      title: `Unassigned ticket #${t.ticketNumber}: ${t.subject}`,
      href: "/contact-centre?tab=tickets",
    })),
  ].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);

  const total = rows.length;

  if (total === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface/50 px-3 py-2 text-xs text-muted">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
        Nothing needs you right now — all clear.
      </div>
    );
  }

  return (
    <section data-testid="needs-you-queue">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
        Needs you · {total}
      </p>
      <ul className="space-y-1.5">
        {rows.slice(0, MAX_ROWS).map((row) => (
          <li key={row.key}>
            <Link
              href={row.href}
              className="flex min-h-[44px] items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:bg-surface/50"
            >
              <StatusChip level={row.level}>{row.label}</StatusChip>
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {row.title}
              </span>
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted/60" />
            </Link>
          </li>
        ))}
      </ul>
      {total > MAX_ROWS && (
        <p className="mt-1.5 text-xs text-muted">
          +{total - MAX_ROWS} more — see To-Dos, Issues, and Rocks for the rest.
        </p>
      )}
    </section>
  );
}
