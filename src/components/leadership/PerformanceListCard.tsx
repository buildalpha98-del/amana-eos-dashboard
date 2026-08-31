"use client";

/**
 * PerformanceListCard — per-person EOS performance metrics, rendered
 * as a leadership-page card. Re-homed from `/team` (which is now an
 * employee directory, not a metrics dashboard) as part of the Teams
 * tab redesign (spec PR #77, PR 5).
 *
 * Data source: existing `/api/team` endpoint via `useTeam()`. The
 * legacy `TeamListView` component still exists for the
 * `LegacyTeamView` fallback during the redesign rollout; it's deleted
 * in PR 8 cleanup.
 *
 * 2026-05-06: introduced (spec PR #77, PR 5).
 */

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useTeam, type TeamMember } from "@/hooks/useTeam";
import { ROLE_DISPLAY_NAMES } from "@/lib/role-permissions";
import { ScrollableTable } from "@/components/ui/ScrollableTable";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

const roleBadge: Record<string, { label: string; className: string }> = {
  owner: {
    label: ROLE_DISPLAY_NAMES.owner,
    className: "bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200",
  },
  head_office: {
    label: ROLE_DISPLAY_NAMES.head_office,
    className: "bg-teal-100 dark:bg-teal-950/50 text-teal-800 dark:text-teal-200",
  },
  admin: {
    label: ROLE_DISPLAY_NAMES.admin,
    className: "bg-indigo-100 dark:bg-indigo-950/50 text-indigo-800 dark:text-indigo-200",
  },
  marketing: {
    label: ROLE_DISPLAY_NAMES.marketing,
    className: "bg-pink-100 dark:bg-pink-950/50 text-pink-800 dark:text-pink-200",
  },
  member: {
    label: ROLE_DISPLAY_NAMES.member,
    className: "bg-surface text-foreground/80",
  },
  staff: {
    label: ROLE_DISPLAY_NAMES.staff,
    className: "bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-200",
  },
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function PerformanceListCard() {
  const { data, isLoading, error } = useTeam();

  return (
    <section
      className="rounded-xl border border-border bg-card p-6 space-y-4"
      data-testid="performance-list-card"
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            Performance
          </h3>
          <p className="text-sm text-muted">
            Per-person EOS metrics: rocks, todos, issues, centres managed
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-red-700 italic">
          Failed to load performance metrics.
        </p>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-muted italic">
          No performance data yet.
        </p>
      ) : (
        <ScrollableTable>
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="bg-surface/50 text-left">
                <th className="px-4 py-3 font-medium text-muted">Name</th>
                <th className="px-4 py-3 font-medium text-muted">Role</th>
                <th className="hidden md:table-cell px-4 py-3 font-medium text-muted text-center">
                  Active rocks
                </th>
                <th className="px-4 py-3 font-medium text-muted">
                  Todo completion
                </th>
                <th className="hidden md:table-cell px-4 py-3 font-medium text-muted text-center">
                  Open issues
                </th>
                <th className="px-4 py-3 font-medium text-muted text-center">
                  Centres
                </th>
                <th className="w-8" aria-hidden />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {data.map((member) => (
                <PerformanceRow key={member.id} member={member} />
              ))}
            </tbody>
          </table>
        </ScrollableTable>
      )}
    </section>
  );
}

function PerformanceRow({ member }: { member: TeamMember }) {
  const badge = roleBadge[member.role] ?? roleBadge.member;
  return (
    <tr className="group hover:bg-surface transition-colors">
      <td className="px-4 py-3">
        <Link
          href={`/staff/${member.id}`}
          className="flex items-center gap-3"
          data-testid="performance-row-link"
        >
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center">
            {member.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={member.avatar}
                alt={member.name}
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <span className="text-xs font-semibold text-brand">
                {getInitials(member.name)}
              </span>
            )}
          </div>
          <div>
            <p className="font-medium text-foreground group-hover:underline">
              {member.name}
            </p>
            <p className="text-xs text-muted">{member.email}</p>
          </div>
        </Link>
      </td>
      <td className="px-4 py-3">
        <span
          className={cn(
            "text-xs font-medium px-2 py-0.5 rounded-full",
            badge.className,
          )}
        >
          {badge.label}
        </span>
      </td>
      <td className="hidden md:table-cell px-4 py-3 text-center font-medium text-foreground/80">
        {member.activeRocks}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-16 h-2 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-brand rounded-full transition-all"
              style={{ width: `${member.todoCompletionPct}%` }}
            />
          </div>
          <span className="text-xs text-muted w-8">
            {member.todoCompletionPct}%
          </span>
        </div>
      </td>
      <td className="hidden md:table-cell px-4 py-3 text-center">
        {member.openIssues > 0 ? (
          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300">
            {member.openIssues}
          </span>
        ) : (
          <span className="text-xs font-medium text-green-600">Clear</span>
        )}
      </td>
      <td className="px-4 py-3 text-center font-medium text-foreground/80">
        {member.managedServices}
      </td>
      <td className="pr-4">
        <ChevronRight className="h-4 w-4 text-muted group-hover:text-foreground" />
      </td>
    </tr>
  );
}
