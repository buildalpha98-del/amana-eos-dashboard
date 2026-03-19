"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Clock, ChevronRight, Loader2, User, FileText, Settings, Users, DollarSign, Shield, Mountain, CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";

interface ActivityLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown> | null;
  createdAt: string;
  user: { id: string; name: string; email: string };
}

const entityIcons: Record<string, React.ElementType> = {
  user: Users,
  service: Settings,
  financial: DollarSign,
  compliance: Shield,
  rock: Mountain,
  todo: CheckSquare,
  lead: FileText,
};

const actionLabels: Record<string, string> = {
  create: "created",
  update: "updated",
  delete: "deleted",
  import: "imported",
  acknowledge: "acknowledged",
  approve: "approved",
  submit: "submitted",
  sync: "synced",
};

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const seconds = Math.floor((now - date) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function humaniseAction(action: string): string {
  return actionLabels[action] || action;
}

function humaniseEntity(entityType: string): string {
  return entityType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function DashboardRecentActivity() {
  const { data, isLoading } = useQuery<{ logs: ActivityLogEntry[] }>({
    queryKey: ["activity-log-dashboard"],
    queryFn: async () => {
      const res = await fetch("/api/activity-log?limit=8");
      if (!res.ok) throw new Error("Failed to fetch activity log");
      return res.json();
    },
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-brand" />
          <h3 className="text-sm font-semibold text-gray-700">Recent Activity</h3>
        </div>
        <div className="flex items-center justify-center py-6 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  const logs = data?.logs || [];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-brand" />
          <h3 className="text-sm font-semibold text-gray-700">Recent Activity</h3>
        </div>
        <Link
          href="/audit-log"
          className="text-xs font-medium text-brand hover:text-brand-hover transition-colors"
        >
          View All
        </Link>
      </div>

      {logs.length === 0 ? (
        <EmptyState icon={Clock} title="No Recent Activity" description="Actions will appear here as users interact with the dashboard." variant="inline" />
      ) : (
        <div className="space-y-1">
          {logs.map((log) => {
            const Icon = entityIcons[log.entityType] || FileText;
            const entityName =
              (log.details as Record<string, string> | null)?.name ||
              (log.details as Record<string, string> | null)?.title ||
              "";
            const initial = (log.user.name?.[0] || "?").toUpperCase();

            return (
              <div
                key={log.id}
                className="flex items-start gap-3 py-2 px-2 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="mt-0.5 w-7 h-7 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
                  <span className="text-[11px] font-semibold text-brand">{initial}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-700 leading-relaxed">
                    <span className="font-semibold">{log.user.name?.split(" ")[0] || "System"}</span>{" "}
                    {humaniseAction(log.action)}{" "}
                    <span className="text-gray-500">{humaniseEntity(log.entityType)}</span>
                    {entityName && (
                      <>
                        {" "}
                        <span className="font-medium text-gray-800 truncate">&ldquo;{entityName}&rdquo;</span>
                      </>
                    )}
                  </p>
                </div>
                <span className="text-[10px] text-gray-400 shrink-0 mt-0.5 whitespace-nowrap">
                  {formatTimeAgo(log.createdAt)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
