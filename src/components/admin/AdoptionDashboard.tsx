"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  LogIn,
  AlertTriangle,
  CheckCircle2,
  Mail,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Role } from "@prisma/client";

// ---------- Types ----------

interface AdoptionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  lastLoginAt: string | null;
  onboardingPct: number;
  createdAt: string;
}

interface AdoptionData {
  totalUsers: number;
  loggedInToday: number;
  loggedInThisWeek: number;
  neverLoggedIn: number;
  onboardingComplete: number;
  userList: AdoptionUser[];
}

type StatusFilter = "all" | "active_today" | "this_week" | "inactive" | "never";

// ---------- Helpers ----------

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  head_office: "Head Office",
  admin: "Admin",
  marketing: "Marketing",
  coordinator: "Coordinator",
  member: "Member",
  staff: "Staff",
};

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 4) return `${diffWeeks}w ago`;
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function getUserStatus(
  lastLoginAt: string | null,
): { label: string; color: string; filter: StatusFilter } {
  if (!lastLoginAt)
    return { label: "Never", color: "bg-red-100 text-red-700", filter: "never" };

  const date = new Date(lastLoginAt);
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  if (date >= todayStart)
    return { label: "Active today", color: "bg-green-100 text-green-700", filter: "active_today" };
  if (date >= weekAgo)
    return { label: "This week", color: "bg-blue-100 text-blue-700", filter: "this_week" };
  return { label: "Inactive", color: "bg-amber-100 text-amber-700", filter: "inactive" };
}

// ---------- Skeleton ----------

function AdoptionSkeleton() {
  return (
    <div className="space-y-6">
      {/* Stats row skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card rounded-xl border border-border p-5">
            <Skeleton className="h-4 w-24 mb-3" />
            <Skeleton className="h-8 w-16 mb-2" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
      {/* Table skeleton */}
      <div className="bg-card rounded-xl border border-border p-6">
        <Skeleton className="h-5 w-40 mb-4" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-3 border-b border-border/50">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-20 ml-auto" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Stats Card ----------

function StatCard({
  icon: Icon,
  label,
  value,
  subtitle,
  color,
  alert,
  progress,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  subtitle: string;
  color: string;
  alert?: boolean;
  progress?: number;
}) {
  return (
    <div
      className={cn(
        "bg-card rounded-xl border p-5 transition-colors",
        alert ? "border-amber-300 bg-amber-50/30" : "border-border",
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className={cn("p-1.5 rounded-lg", color)}>
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      {progress !== undefined && (
        <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand rounded-full transition-all"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ---------- User Card (mobile) ----------

function UserCard({ user }: { user: AdoptionUser }) {
  const status = getUserStatus(user.lastLoginAt);
  return (
    <div className="bg-card rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">{user.name}</p>
          <p className="text-xs text-muted-foreground">{user.email}</p>
        </div>
        <span
          className={cn(
            "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
            status.color,
          )}
        >
          {status.label}
        </span>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{ROLE_LABELS[user.role] ?? user.role}</span>
        <span>Last login: {relativeTime(user.lastLoginAt)}</span>
      </div>
      <div>
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-muted-foreground">Onboarding</span>
          <span className="font-medium text-foreground">{user.onboardingPct}%</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              user.onboardingPct === 100 ? "bg-green-500" : "bg-brand",
            )}
            style={{ width: `${user.onboardingPct}%` }}
          />
        </div>
      </div>
      {status.filter === "inactive" || status.filter === "never" ? (
        <a
          href={`mailto:${user.email}?subject=Amana Dashboard — We miss you!&body=Hi ${user.name},%0A%0AJust a friendly reminder to log in to the Amana EOS Dashboard. Let us know if you need any help getting started!`}
          className="inline-flex items-center gap-1 text-xs text-brand hover:text-brand-hover font-medium"
        >
          <Mail className="w-3 h-3" />
          Send Reminder
        </a>
      ) : null}
    </div>
  );
}

// ---------- Main Component ----------

export function AdoptionDashboard() {
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const { data, isLoading } = useQuery<AdoptionData>({
    queryKey: ["admin-adoption"],
    queryFn: async () => {
      const res = await fetch("/api/admin/adoption");
      if (!res.ok) throw new Error("Failed to fetch adoption data");
      return res.json();
    },
    refetchInterval: 5 * 60 * 1000,
  });

  const filteredUsers = useMemo(() => {
    if (!data) return [];
    return data.userList.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (statusFilter !== "all") {
        const s = getUserStatus(u.lastLoginAt);
        if (s.filter !== statusFilter) return false;
      }
      return true;
    });
  }, [data, roleFilter, statusFilter]);

  if (isLoading) return <AdoptionSkeleton />;
  if (!data) return null;

  const weekPct =
    data.totalUsers > 0
      ? Math.round((data.loggedInThisWeek / data.totalUsers) * 100)
      : 0;
  const onboardPct =
    data.totalUsers > 0
      ? Math.round((data.onboardingComplete / data.totalUsers) * 100)
      : 0;

  const roles = Array.from(new Set(data.userList.map((u) => u.role)));

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="Active Users"
          value={`${data.loggedInThisWeek} / ${data.totalUsers}`}
          subtitle={`${weekPct}% logged in this week`}
          color="bg-brand/10 text-brand"
        />
        <StatCard
          icon={LogIn}
          label="Today's Logins"
          value={data.loggedInToday}
          subtitle="Users active today"
          color="bg-green-100 text-green-600"
        />
        <StatCard
          icon={AlertTriangle}
          label="Never Logged In"
          value={data.neverLoggedIn}
          subtitle={data.neverLoggedIn > 0 ? "Users need an invite reminder" : "All users have logged in"}
          color="bg-amber-100 text-amber-600"
          alert={data.neverLoggedIn > 0}
        />
        <StatCard
          icon={CheckCircle2}
          label="Onboarding Complete"
          value={`${data.onboardingComplete} / ${data.totalUsers}`}
          subtitle={`${onboardPct}% fully onboarded`}
          color="bg-emerald-100 text-emerald-600"
          progress={onboardPct}
        />
      </div>

      {/* User Table */}
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h3 className="text-lg font-semibold text-foreground">User Adoption</h3>
          <div className="flex items-center gap-2">
            {/* Role filter */}
            <div className="relative">
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-border rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
              >
                <option value="all">All Roles</option>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r] ?? r}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            </div>
            {/* Status filter */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-border rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
              >
                <option value="all">All Statuses</option>
                <option value="active_today">Active Today</option>
                <option value="this_week">This Week</option>
                <option value="inactive">Inactive</option>
                <option value="never">Never Logged In</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-2 px-3">
                  Name
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-2 px-3">
                  Role
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-2 px-3">
                  Last Login
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-2 px-3">
                  Onboarding
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-2 px-3">
                  Status
                </th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const status = getUserStatus(user.lastLoginAt);
                const showReminder =
                  status.filter === "inactive" || status.filter === "never";
                return (
                  <tr
                    key={user.id}
                    className="border-b border-border/50 hover:bg-surface/50"
                  >
                    <td className="py-2.5 px-3">
                      <div>
                        <p className="font-medium text-foreground">{user.name}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground">
                      {ROLE_LABELS[user.role] ?? user.role}
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground">
                      {relativeTime(user.lastLoginAt)}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              user.onboardingPct === 100
                                ? "bg-green-500"
                                : "bg-brand",
                            )}
                            style={{ width: `${user.onboardingPct}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-8 text-right">
                          {user.onboardingPct}%
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                          status.color,
                        )}
                      >
                        {status.label}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      {showReminder && (
                        <a
                          href={`mailto:${user.email}?subject=Amana Dashboard — We miss you!&body=Hi ${user.name},%0A%0AJust a friendly reminder to log in to the Amana EOS Dashboard. Let us know if you need any help getting started!`}
                          className="text-brand hover:text-brand-hover"
                          title="Send reminder email"
                        >
                          <Mail className="w-4 h-4" />
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredUsers.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    No users match the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile card layout */}
        <div className="sm:hidden space-y-3">
          {filteredUsers.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No users match the selected filters.
            </p>
          ) : (
            filteredUsers.map((user) => (
              <UserCard key={user.id} user={user} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
