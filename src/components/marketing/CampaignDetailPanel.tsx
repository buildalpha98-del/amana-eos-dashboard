"use client";

import { useState, useEffect } from "react";
import { X, Trash2, Send } from "lucide-react";
import {
  useCampaign,
  useUpdateCampaign,
  useDeleteCampaign,
  useAddCampaignComment,
} from "@/hooks/useMarketing";
import type { MarketingPlatform } from "@prisma/client";
import { StatusBadge } from "./StatusBadge";
import { PlatformBadge } from "./PlatformBadge";

const CAMPAIGN_STATUSES = [
  "draft",
  "scheduled",
  "active",
  "completed",
  "paused",
  "cancelled",
] as const;

const CAMPAIGN_TYPES = [
  "campaign",
  "event",
  "launch",
  "promotion",
  "awareness",
  "partnership",
] as const;

const ALL_PLATFORMS: MarketingPlatform[] = [
  "facebook",
  "instagram",
  "linkedin",
  "email",
  "newsletter",
  "website",
  "flyer",
];

export function CampaignDetailPanel({
  campaignId,
  onClose,
}: {
  campaignId: string;
  onClose: () => void;
}) {
  const { data: campaign, isLoading } = useCampaign(campaignId);
  const updateCampaign = useUpdateCampaign();
  const deleteCampaign = useDeleteCampaign();
  const addComment = useAddCampaignComment();

  // Local editable state
  const [name, setName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [platforms, setPlatforms] = useState<MarketingPlatform[]>([]);
  const [goal, setGoal] = useState("");
  const [notes, setNotes] = useState("");
  const [designLink, setDesignLink] = useState("");
  const [commentText, setCommentText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Sync local state when data loads or changes
  useEffect(() => {
    if (campaign) {
      setName(campaign.name);
      setStatus(campaign.status);
      setType(campaign.type);
      setStartDate(
        campaign.startDate
          ? new Date(campaign.startDate).toISOString().split("T")[0]
          : ""
      );
      setEndDate(
        campaign.endDate
          ? new Date(campaign.endDate).toISOString().split("T")[0]
          : ""
      );
      setPlatforms(campaign.platforms);
      setGoal(campaign.goal || "");
      setNotes(campaign.notes || "");
      setDesignLink(campaign.designLink || "");
    }
  }, [campaign]);

  const handleUpdate = (
    field: string,
    value: string | string[] | null
  ) => {
    updateCampaign.mutate({ id: campaignId, [field]: value });
  };

  const handleNameBlur = () => {
    setEditingName(false);
    if (name && name !== campaign?.name) {
      handleUpdate("name", name);
    }
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    deleteCampaign.mutate(campaignId, {
      onSuccess: () => onClose(),
    });
  };

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    addComment.mutate(
      { campaignId, text: commentText.trim() },
      {
        onSuccess: () => setCommentText(""),
      }
    );
  };

  const togglePlatform = (platform: MarketingPlatform) => {
    const updated = platforms.includes(platform)
      ? platforms.filter((p) => p !== platform)
      : [...platforms, platform];
    setPlatforms(updated);
    handleUpdate("platforms", updated);
  };

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="min-w-0 flex-1">
            {editingName ? (
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={handleNameBlur}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleNameBlur();
                }}
                autoFocus
                className="w-full rounded border border-[#004E64] px-2 py-1 text-lg font-semibold text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#004E64]"
              />
            ) : (
              <h2
                onClick={() => setEditingName(true)}
                className="cursor-pointer truncate text-lg font-semibold text-gray-900 hover:text-[#004E64]"
              >
                {isLoading ? "Loading..." : name}
              </h2>
            )}
          </div>
          <div className="ml-3 flex items-center gap-2">
            <button
              onClick={handleDelete}
              className={`rounded-lg p-2 transition-colors ${
                confirmDelete
                  ? "bg-red-100 text-red-600 hover:bg-red-200"
                  : "text-gray-400 hover:bg-gray-100 hover:text-red-500"
              }`}
              title={confirmDelete ? "Click again to confirm delete" : "Delete campaign"}
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center text-gray-500">
            Loading campaign...
          </div>
        ) : (
          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
            {/* Fields Section */}
            <div className="space-y-4">
              {/* Status */}
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    handleUpdate("status", e.target.value);
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
                >
                  {CAMPAIGN_STATUSES.map((s) => (
                    <option key={s} value={s} className="capitalize">
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Type */}
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                  Type
                </label>
                <select
                  value={type}
                  onChange={(e) => {
                    setType(e.target.value);
                    handleUpdate("type", e.target.value);
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
                >
                  {CAMPAIGN_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Start Date */}
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  onBlur={() =>
                    handleUpdate(
                      "startDate",
                      startDate ? new Date(startDate).toISOString() : null
                    )
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
                />
              </div>

              {/* End Date */}
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  onBlur={() =>
                    handleUpdate(
                      "endDate",
                      endDate ? new Date(endDate).toISOString() : null
                    )
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
                />
              </div>

              {/* Platforms */}
              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-gray-500">
                  Platforms
                </label>
                <div className="flex flex-wrap gap-2">
                  {ALL_PLATFORMS.map((p) => (
                    <label
                      key={p}
                      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        platforms.includes(p)
                          ? "border-[#004E64] bg-[#004E64]/10 text-[#004E64]"
                          : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={platforms.includes(p)}
                        onChange={() => togglePlatform(p)}
                        className="sr-only"
                      />
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </label>
                  ))}
                </div>
              </div>

              {/* Goal */}
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                  Goal
                </label>
                <textarea
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  onBlur={() => handleUpdate("goal", goal || null)}
                  rows={2}
                  placeholder="Campaign goal..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={() => handleUpdate("notes", notes || null)}
                  rows={2}
                  placeholder="Additional notes..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
                />
              </div>

              {/* Design Link */}
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                  Design Link
                </label>
                <input
                  type="url"
                  value={designLink}
                  onChange={(e) => setDesignLink(e.target.value)}
                  onBlur={() =>
                    handleUpdate("designLink", designLink || null)
                  }
                  placeholder="https://..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
                />
              </div>
            </div>

            {/* Linked Posts */}
            {campaign?.posts && campaign.posts.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">
                  Linked Posts ({campaign.posts.length})
                </h3>
                <div className="space-y-2">
                  {campaign.posts.map((post) => (
                    <div
                      key={post.id}
                      className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                    >
                      <span className="text-sm font-medium text-gray-800">
                        {post.title}
                      </span>
                      <div className="flex items-center gap-2">
                        <PlatformBadge platform={post.platform} />
                        <StatusBadge type="post" status={post.status} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Comments Thread */}
            <div>
              <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-500">
                Comments{" "}
                {campaign?.comments
                  ? `(${campaign.comments.length})`
                  : ""}
              </h3>

              {campaign?.comments && campaign.comments.length > 0 ? (
                <div className="mb-4 space-y-3">
                  {campaign.comments.map((comment) => (
                    <div
                      key={comment.id}
                      className="rounded-lg bg-gray-50 px-3 py-2"
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-700">
                          {comment.author.name}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(comment.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">{comment.text}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mb-4 text-sm text-gray-400">
                  No comments yet.
                </p>
              )}

              {/* Add Comment Form */}
              <form onSubmit={handleAddComment} className="flex gap-2">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add a comment..."
                  rows={2}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
                />
                <button
                  type="submit"
                  disabled={!commentText.trim() || addComment.isPending}
                  className="self-end rounded-lg bg-[#004E64] p-2.5 text-white transition-colors hover:bg-[#003d4f] disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
