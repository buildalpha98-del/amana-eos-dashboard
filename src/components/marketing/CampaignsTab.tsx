"use client";

import { useState } from "react";
import { Plus, Megaphone } from "lucide-react";
import { useCampaigns } from "@/hooks/useMarketing";
import type { CampaignData } from "@/hooks/useMarketing";
import { StatusBadge } from "./StatusBadge";
import { PlatformBadge } from "./PlatformBadge";
import { CreateCampaignModal } from "./CreateCampaignModal";

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "paused", label: "Paused" },
  { value: "cancelled", label: "Cancelled" },
];

const TYPE_OPTIONS = [
  { value: "", label: "All Types" },
  { value: "campaign", label: "Campaign" },
  { value: "event", label: "Event" },
  { value: "launch", label: "Launch" },
  { value: "promotion", label: "Promotion" },
  { value: "awareness", label: "Awareness" },
  { value: "partnership", label: "Partnership" },
  { value: "activation", label: "Activation" },
];

export function CampaignsTab({
  onSelectCampaign,
  serviceId,
}: {
  onSelectCampaign: (id: string) => void;
  serviceId: string;
}) {
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const { data: campaigns, isLoading } = useCampaigns({
    status: statusFilter || undefined,
    type: typeFilter || undefined,
    serviceId: serviceId || undefined,
  });

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        >
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <div className="ml-auto">
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
          >
            <Plus className="h-4 w-4" />
            New Campaign
          </button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-gray-500">
          Loading campaigns...
        </div>
      ) : !campaigns || campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border bg-white py-16">
          <Megaphone className="mb-3 h-10 w-10 text-gray-300" />
          <p className="text-lg font-medium text-gray-700">
            No campaigns found
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Adjust your filters or create a new campaign to get started.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Platforms</th>
                  <th className="px-4 py-3">Centres</th>
                  <th className="px-4 py-3">Start Date</th>
                  <th className="px-4 py-3">Posts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {campaigns.map((campaign: CampaignData) => (
                  <tr
                    key={campaign.id}
                    onClick={() => onSelectCampaign(campaign.id)}
                    className="cursor-pointer transition-colors hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {campaign.name}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <span className="capitalize">{campaign.type}</span>
                      {campaign.type === "activation" && (
                        <span className="ml-1.5 inline-flex items-center rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700">
                          ACT
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge type="campaign" status={campaign.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {campaign.platforms.map((p) => (
                          <PlatformBadge key={p} platform={p} />
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {campaign.services && campaign.services.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {campaign.services.map((s) => (
                            <span
                              key={s.service.id}
                              className="inline-flex items-center rounded-md bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand"
                            >
                              {s.service.code}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400 italic text-xs">
                          All Centres
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {campaign.startDate
                        ? new Date(campaign.startDate).toLocaleDateString()
                        : "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {campaign._count.posts}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Campaign Modal */}
      <CreateCampaignModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
      />
    </div>
  );
}
