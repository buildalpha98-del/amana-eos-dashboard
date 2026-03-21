"use client";

import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { ROLE_DISPLAY_NAMES } from "@/lib/role-permissions";
import {
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  Mail,
} from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TeamUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar: string | null;
  completedCount: number;
  totalCount: number;
  percentage: number;
  lastActivity: string | null;
}

interface TeamSummary {
  totalUsers: number;
  fullyOnboarded: number;
  inProgress: number;
  notStarted: number;
}

interface TeamResponse {
  users: TeamUser[];
  summary: TeamSummary;
}

// ---------------------------------------------------------------------------
// Role badge styles (matching TeamListView pattern)
// ---------------------------------------------------------------------------

const roleBadge: Record<string, { label: string; className: string }> = {
  owner: {
    label: ROLE_DISPLAY_NAMES.owner,
    className: "bg-amber-100 text-amber-800",
  },
  head_office: {
    label: ROLE_DISPLAY_NAMES.head_office,
    className: "bg-teal-100 text-teal-800",
  },
  admin: {
    label: ROLE_DISPLAY_NAMES.admin,
    className: "bg-indigo-100 text-indigo-800",
  },
  marketing: {
    label: ROLE_DISPLAY_NAMES.marketing,
    className: "bg-pink-100 text-pink-800",
  },
  coordinator: {
    label: ROLE_DISPLAY_NAMES.coordinator,
    className: "bg-cyan-100 text-cyan-800",
  },
  member: {
    label: ROLE_DISPLAY_NAMES.member,
    className: "bg-gray-100 text-gray-700",
  },
  staff: {
    label: ROLE_DISPLAY_NAMES.staff,
    className: "bg-blue-100 text-blue-800",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getStatusLabel(pct: number): {
  text: string;
  className: string;
} {
  if (pct === 100)
    return { text: "Complete", className: "text-emerald-700 bg-emerald-50" };
  if (pct > 0)
    return { text: "In Progress", className: "text-amber-700 bg-amber-50" };
  return { text: "Not Started", className: "text-gray-500 bg-gray-100" };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TeamOnboardingTracker() {
  const { data, isLoading } = useQuery<TeamResponse>({
    queryKey: ["getting-started-team"],
    queryFn: async () => {
      const res = await fetch("/api/getting-started/team");
      if (!res.ok) throw new Error("Failed to load team progress");
      return res.json();
    },
  });

  const users = data?.users ?? [];
  const summary = data?.summary;

  // Sort by percentage ascending (lowest first so admins see who needs help)
  const sorted = [...users].sort((a, b) => a.percentage - b.percentage);

  // ── Summary cards ────────────────────────────────────────────
  const statCards = [
    {
      label: "Total Staff",
      value: summary?.totalUsers ?? 0,
      icon: Users,
      color: "text-gray-700",
      bg: "bg-gray-50",
    },
    {
      label: "Fully Onboarded",
      value: summary?.fullyOnboarded ?? 0,
      icon: CheckCircle2,
      color: "text-emerald-700",
      bg: "bg-emerald-50",
    },
    {
      label: "In Progress",
      value: summary?.inProgress ?? 0,
      icon: Clock,
      color: "text-amber-700",
      bg: "bg-amber-50",
    },
    {
      label: "Not Started",
      value: summary?.notStarted ?? 0,
      icon: AlertCircle,
      color: "text-red-600",
      bg: "bg-red-50",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className={cn(
                "rounded-xl border border-gray-200 p-4",
                card.bg,
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className={cn("w-4 h-4", card.color)} />
                <span className="text-xs font-medium text-gray-500">
                  {card.label}
                </span>
              </div>
              {isLoading ? (
                <Skeleton className="h-7 w-10" />
              ) : (
                <p className={cn("text-2xl font-bold", card.color)}>
                  {card.value}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))
          : sorted.map((user) => {
              const badge = roleBadge[user.role] ?? roleBadge.member;
              const status = getStatusLabel(user.percentage);
              return (
                <div
                  key={user.id}
                  className="bg-white rounded-xl border border-gray-200 p-4"
                >
                  <div className="flex items-center gap-3 mb-3">
                    {user.avatar ? (
                      <img
                        src={user.avatar}
                        alt={user.name}
                        className="w-9 h-9 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-brand/10 text-brand flex items-center justify-center text-xs font-semibold">
                        {getInitials(user.name)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">
                        {user.name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className={cn(
                            "inline-block px-2 py-0.5 rounded-full text-[10px] font-medium",
                            badge.className,
                          )}
                        >
                          {badge.label}
                        </span>
                        <span
                          className={cn(
                            "inline-block px-2 py-0.5 rounded-full text-[10px] font-medium",
                            status.className,
                          )}
                        >
                          {status.text}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          user.percentage === 100
                            ? "bg-emerald-500"
                            : user.percentage > 0
                              ? "bg-amber-400"
                              : "bg-gray-200",
                        )}
                        style={{ width: `${user.percentage}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 tabular-nums whitespace-nowrap">
                      {user.completedCount}/{user.totalCount}
                    </span>
                    {user.percentage < 100 && (
                      <a
                        href={`mailto:${user.email}?subject=Amana%20EOS%20—%20Complete%20Your%20Setup&body=Hi%20${encodeURIComponent(user.name.split(" ")[0])}%2C%0A%0AJust%20a%20friendly%20reminder%20to%20complete%20your%20Getting%20Started%20guide%20on%20the%20Amana%20EOS%20Dashboard.%0A%0AThanks!`}
                        className="p-1.5 text-brand hover:bg-brand/5 rounded-lg"
                        aria-label={`Send reminder to ${user.name}`}
                      >
                        <Mail className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium text-gray-500">Name</th>
                <th className="px-4 py-3 font-medium text-gray-500">Role</th>
                <th className="px-4 py-3 font-medium text-gray-500">
                  Progress
                </th>
                <th className="px-4 py-3 font-medium text-gray-500 text-center">
                  Status
                </th>
                <th className="px-4 py-3 font-medium text-gray-500 text-right">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-8 w-8 rounded-full" />
                          <div className="space-y-1">
                            <Skeleton className="h-4 w-28" />
                            <Skeleton className="h-3 w-36" />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-5 w-16" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Skeleton className="h-5 w-20 mx-auto" />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Skeleton className="h-7 w-24 ml-auto" />
                      </td>
                    </tr>
                  ))
                : sorted.map((user) => {
                    const badge =
                      roleBadge[user.role] ?? roleBadge.member;
                    const status = getStatusLabel(user.percentage);
                    return (
                      <tr key={user.id} className="hover:bg-gray-50/50">
                        {/* Name + avatar */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {user.avatar ? (
                              <img
                                src={user.avatar}
                                alt={user.name}
                                className="w-8 h-8 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-brand/10 text-brand flex items-center justify-center text-xs font-semibold">
                                {getInitials(user.name)}
                              </div>
                            )}
                            <div>
                              <p className="font-medium text-gray-900 text-sm">
                                {user.name}
                              </p>
                              <p className="text-xs text-gray-400">
                                {user.email}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Role */}
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "inline-block px-2 py-0.5 rounded-full text-xs font-medium",
                              badge.className,
                            )}
                          >
                            {badge.label}
                          </span>
                        </td>

                        {/* Progress bar */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  user.percentage === 100
                                    ? "bg-emerald-500"
                                    : user.percentage > 0
                                      ? "bg-amber-400"
                                      : "bg-gray-200",
                                )}
                                style={{
                                  width: `${user.percentage}%`,
                                }}
                              />
                            </div>
                            <span className="text-xs text-gray-500 w-16 text-right tabular-nums">
                              {user.completedCount}/{user.totalCount} (
                              {user.percentage}%)
                            </span>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3 text-center">
                          <span
                            className={cn(
                              "inline-block px-2 py-0.5 rounded-full text-xs font-medium",
                              status.className,
                            )}
                          >
                            {status.text}
                          </span>
                        </td>

                        {/* Send Reminder */}
                        <td className="px-4 py-3 text-right">
                          {user.percentage < 100 && (
                            <a
                              href={`mailto:${user.email}?subject=Amana%20EOS%20—%20Complete%20Your%20Setup&body=Hi%20${encodeURIComponent(user.name.split(" ")[0])}%2C%0A%0AJust%20a%20friendly%20reminder%20to%20complete%20your%20Getting%20Started%20guide%20on%20the%20Amana%20EOS%20Dashboard.%0A%0AThanks!`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand bg-brand/5 rounded-lg hover:bg-brand/10 transition-colors"
                            >
                              <Mail className="w-3.5 h-3.5" />
                              Send Reminder
                            </a>
                          )}
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
