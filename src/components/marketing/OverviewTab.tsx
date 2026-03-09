"use client";

import {
  FileText,
  Megaphone,
  CheckCircle2,
  FolderOpen,
  Building2,
  AlertTriangle,
  Clock,
  Activity,
  ListTodo,
  Loader2,
  Eye,
  CircleCheck,
} from "lucide-react";
import { useMarketingOverview } from "@/hooks/useMarketing";
import { ErrorState } from "@/components/ui/ErrorState";
import type { OverviewData } from "@/hooks/useMarketing";
import { StatusBadge } from "./StatusBadge";
import { PlatformBadge } from "./PlatformBadge";

const statCards: {
  key: keyof Pick<
    OverviewData,
    "totalPosts" | "activeCampaigns" | "publishedThisMonth" | "totalCampaigns"
  >;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
}[] = [
  {
    key: "totalPosts",
    label: "Total Posts",
    icon: FileText,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
  },
  {
    key: "activeCampaigns",
    label: "Active Campaigns",
    icon: Megaphone,
    iconBg: "bg-green-100",
    iconColor: "text-green-600",
  },
  {
    key: "publishedThisMonth",
    label: "Published This Month",
    icon: CheckCircle2,
    iconBg: "bg-purple-100",
    iconColor: "text-purple-600",
  },
  {
    key: "totalCampaigns",
    label: "Total Campaigns",
    icon: FolderOpen,
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
  },
];

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "\u2014";
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMonth = Math.floor(diffDay / 30);
  return `${diffMonth}mo ago`;
}

function daysOverdue(dateStr: string): number {
  const now = new Date();
  const due = new Date(dateStr);
  return Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
}

interface OverviewTabProps {
  serviceId: string;
  onSelectTask?: (id: string) => void;
}

export function OverviewTab({ serviceId, onSelectTask }: OverviewTabProps) {
  const { data, isLoading, error, refetch } = useMarketingOverview(
    serviceId || undefined
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Failed to load marketing"
        error={error as Error}
        onRetry={refetch}
      />
    );
  }

  if (!data) return null;

  const showCentreCards = !serviceId;

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.key}
              className="bg-white rounded-xl p-6 border border-gray-200"
            >
              <div className="flex items-center gap-4">
                <div
                  className={`flex items-center justify-center w-10 h-10 rounded-full ${card.iconBg}`}
                >
                  <Icon className={`w-5 h-5 ${card.iconColor}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {data[card.key]}
                  </p>
                  <p className="text-sm text-gray-500">{card.label}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Centre Coverage Cards (only when All Centres selected) */}
      {showCentreCards && (
        <div className="grid grid-cols-2 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-100">
                <Building2 className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {data.centresWithContent ?? 0}
                </p>
                <p className="text-sm text-gray-500">Centres with Content</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {data.centresWithoutContent ?? 0}
                </p>
                <p className="text-sm text-gray-500">
                  Centres without Content
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Task Status Row */}
      {data.taskCounts && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {(
            [
              { status: "todo", label: "To Do", bg: "bg-gray-50", text: "text-gray-700", icon: ListTodo, iconColor: "text-gray-500" },
              { status: "in_progress", label: "In Progress", bg: "bg-blue-50", text: "text-blue-700", icon: Loader2, iconColor: "text-blue-500" },
              { status: "in_review", label: "In Review", bg: "bg-amber-50", text: "text-amber-700", icon: Eye, iconColor: "text-amber-500" },
              { status: "done", label: "Done", bg: "bg-emerald-50", text: "text-emerald-700", icon: CircleCheck, iconColor: "text-emerald-500" },
            ] as const
          ).map((item) => {
            const count =
              data.taskCounts?.find((tc) => tc.status === item.status)?._count
                .id ?? 0;
            const Icon = item.icon;
            return (
              <div
                key={item.status}
                className={`rounded-xl p-4 border border-gray-200 ${item.bg}`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-5 h-5 ${item.iconColor}`} />
                  <div>
                    <p className={`text-xl font-bold ${item.text}`}>{count}</p>
                    <p className="text-xs text-gray-500">{item.label}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Overdue Tasks Alert */}
      {data.overdueTasks && data.overdueTasks.length > 0 && (
        <div className="rounded-xl border-2 border-red-200 bg-red-50">
          <div className="px-6 py-4 border-b border-red-200 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <h3 className="text-lg font-semibold text-red-800">
              Overdue Tasks
            </h3>
            <span className="ml-auto text-sm font-medium text-red-600">
              {data.overdueTasks.length} overdue
            </span>
          </div>
          <div className="divide-y divide-red-100">
            {data.overdueTasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => onSelectTask?.(task.id)}
                className="w-full px-6 py-3 flex items-center justify-between hover:bg-red-100 transition-colors text-left"
              >
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {task.title}
                  </p>
                  <p className="text-sm text-red-600">
                    {daysOverdue(task.dueDate)} day
                    {daysOverdue(task.dueDate) !== 1 ? "s" : ""} overdue
                    {task.assignee && (
                      <span className="text-gray-500">
                        {" "}
                        &middot; {task.assignee.name}
                      </span>
                    )}
                  </p>
                </div>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    task.priority === "high"
                      ? "bg-red-100 text-red-700"
                      : task.priority === "medium"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {task.priority}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Due Today / Tomorrow */}
      {data.dueSoonTasks && data.dueSoonTasks.length > 0 && (
        <div className="rounded-xl border-2 border-amber-200 bg-amber-50">
          <div className="px-6 py-4 border-b border-amber-200 flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-600" />
            <h3 className="text-lg font-semibold text-amber-800">
              Due Today / Tomorrow
            </h3>
            <span className="ml-auto text-sm font-medium text-amber-600">
              {data.dueSoonTasks.length} upcoming
            </span>
          </div>
          <div className="divide-y divide-amber-100">
            {data.dueSoonTasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => onSelectTask?.(task.id)}
                className="w-full px-6 py-3 flex items-center justify-between hover:bg-amber-100 transition-colors text-left"
              >
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {task.title}
                  </p>
                  <p className="text-sm text-amber-600">
                    Due {formatDate(task.dueDate)}
                    {task.assignee && (
                      <span className="text-gray-500">
                        {" "}
                        &middot; {task.assignee.name}
                      </span>
                    )}
                  </p>
                </div>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    task.priority === "high"
                      ? "bg-red-100 text-red-700"
                      : task.priority === "medium"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {task.priority}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity Feed */}
      {data.recentActivity && data.recentActivity.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
            <Activity className="w-5 h-5 text-[#004E64]" />
            <h3 className="text-lg font-semibold text-gray-900">
              Recent Activity
            </h3>
          </div>
          <div className="divide-y divide-gray-50">
            {data.recentActivity.map((entry) => (
              <div
                key={entry.id}
                className="px-6 py-3 flex items-center justify-between"
              >
                <p className="text-sm text-gray-700">
                  <span className="font-medium text-gray-900">
                    {entry.user.name}
                  </span>{" "}
                  {entry.action}
                </p>
                <span className="text-xs text-gray-400 whitespace-nowrap ml-4">
                  {relativeTime(entry.createdAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming This Week */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Upcoming This Week
          </h3>
        </div>
        {data.upcomingPosts.length === 0 ? (
          <div className="px-6 py-10 text-center text-gray-500">
            No upcoming posts
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="px-6 py-3 font-medium">Title</th>
                  <th className="px-6 py-3 font-medium">Platform</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Scheduled Date</th>
                  <th className="px-6 py-3 font-medium">Assignee</th>
                </tr>
              </thead>
              <tbody>
                {data.upcomingPosts.map((post) => (
                  <tr
                    key={post.id}
                    className="border-b border-gray-50 hover:bg-gray-50"
                  >
                    <td className="px-6 py-3 font-medium text-gray-900">
                      {post.title}
                    </td>
                    <td className="px-6 py-3">
                      <PlatformBadge platform={post.platform} />
                    </td>
                    <td className="px-6 py-3">
                      <StatusBadge status={post.status} type="post" />
                    </td>
                    <td className="px-6 py-3 text-gray-600">
                      {formatDate(post.scheduledDate)}
                    </td>
                    <td className="px-6 py-3 text-gray-600">
                      {post.assignee?.name ?? "Unassigned"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Active Campaigns */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Active Campaigns
          </h3>
        </div>
        {data.activeCampaignsList.length === 0 ? (
          <div className="px-6 py-10 text-center text-gray-500">
            No active campaigns
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {data.activeCampaignsList.map((campaign) => (
              <div
                key={campaign.id}
                className="px-6 py-4 flex items-center justify-between hover:bg-gray-50"
              >
                <div>
                  <p className="font-medium text-gray-900">{campaign.name}</p>
                </div>
                <span className="text-sm text-gray-500">
                  {campaign._count.posts}{" "}
                  {campaign._count.posts === 1 ? "post" : "posts"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
