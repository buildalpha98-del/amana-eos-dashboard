"use client";

import {
  FileText,
  Megaphone,
  CheckCircle2,
  FolderOpen,
  Building2,
  AlertTriangle,
} from "lucide-react";
import { useMarketingOverview } from "@/hooks/useMarketing";
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

interface OverviewTabProps {
  serviceId: string;
}

export function OverviewTab({ serviceId }: OverviewTabProps) {
  const { data, isLoading, error } = useMarketingOverview(
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
      <div className="flex items-center justify-center py-20 text-red-500">
        {error instanceof Error ? error.message : "Failed to load overview"}
      </div>
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
