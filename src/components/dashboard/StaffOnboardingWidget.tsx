"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ChevronRight, GraduationCap, CheckCircle2, Clock, XCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";

interface OnboardingSummary {
  totalUsers: number;
  fullyOnboarded: number;
  inProgress: number;
  notStarted: number;
}

interface OnboardingUser {
  id: string;
  name: string;
  role: string;
  percentage: number;
  completedCount: number;
  totalCount: number;
}

interface OnboardingResponse {
  users: OnboardingUser[];
  summary: OnboardingSummary;
}

export function StaffOnboardingWidget() {
  const { data, isLoading } = useQuery<OnboardingResponse>({
    queryKey: ["staff-onboarding-widget"],
    queryFn: async () => {
      const res = await fetch("/api/getting-started/team");
      if (!res.ok) throw new Error("Failed to load onboarding data");
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="bg-card rounded-xl border border-border p-6">
        <Skeleton className="h-5 w-48 mb-4" />
        <div className="space-y-3">
          <Skeleton className="h-12 rounded-lg" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { summary, users } = data;
  const completionRate = summary.totalUsers > 0
    ? Math.round((summary.fullyOnboarded / summary.totalUsers) * 100)
    : 0;

  // Show staff who haven't finished, sorted by progress
  const incomplete = users
    .filter((u) => u.percentage < 100)
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 5);

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <GraduationCap className="w-4 h-4 text-brand" />
          Staff Onboarding Progress
        </h3>
        <Link
          href="/getting-started"
          className="text-xs font-medium text-brand hover:underline flex items-center gap-1"
        >
          View all <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center p-2 rounded-lg bg-surface">
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-success" />
          </div>
          <div className="text-lg font-bold text-success">{summary.fullyOnboarded}</div>
          <div className="text-[10px] text-muted">Complete</div>
        </div>
        <div className="text-center p-2 rounded-lg bg-surface">
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <Clock className="w-3.5 h-3.5 text-warning" />
          </div>
          <div className="text-lg font-bold text-warning">{summary.inProgress}</div>
          <div className="text-[10px] text-muted">In Progress</div>
        </div>
        <div className="text-center p-2 rounded-lg bg-surface">
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <XCircle className="w-3.5 h-3.5 text-danger" />
          </div>
          <div className="text-lg font-bold text-danger">{summary.notStarted}</div>
          <div className="text-[10px] text-muted">Not Started</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-muted">Overall completion</span>
          <span className="font-medium text-foreground">{completionRate}%</span>
        </div>
        <div className="w-full h-2 bg-surface rounded-full overflow-hidden">
          <div
            className="h-full bg-brand rounded-full transition-all duration-500"
            style={{ width: `${completionRate}%` }}
          />
        </div>
      </div>

      {/* Incomplete staff list */}
      {incomplete.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted font-medium">Needs attention</p>
          {incomplete.map((user) => (
            <div key={user.id} className="flex items-center justify-between py-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-full bg-surface flex items-center justify-center text-[10px] font-bold text-muted flex-shrink-0">
                  {user.name.charAt(0)}
                </div>
                <span className="text-sm text-foreground truncate">{user.name}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="w-16 h-1.5 bg-surface rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${user.percentage === 0 ? "bg-red-400" : "bg-amber-400"}`}
                    style={{ width: `${user.percentage}%` }}
                  />
                </div>
                <span className="text-xs text-muted w-8 text-right">{user.percentage}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
