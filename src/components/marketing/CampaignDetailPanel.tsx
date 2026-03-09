"use client";

import { useState, useEffect } from "react";
import { X, Trash2, Send, Pencil, Plus, CheckSquare } from "lucide-react";
import {
  useCampaign,
  useUpdateCampaign,
  useDeleteCampaign,
  useAddCampaignComment,
  useMarketingTasks,
} from "@/hooks/useMarketing";
import type { MarketingPlatform } from "@prisma/client";
import { StatusBadge } from "./StatusBadge";
import { PlatformBadge } from "./PlatformBadge";
import { ServiceMultiSelect } from "./ServiceMultiSelect";
import { CreateTaskModal } from "./CreateTaskModal";
import { ActivationAssignmentGrid } from "./ActivationAssignmentGrid";

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
  "activation",
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
  const [editingCentres, setEditingCentres] = useState(false);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [budget, setBudget] = useState("");
  const [location, setLocation] = useState("");
  const [deliverables, setDeliverables] = useState("");
  const [showCreateTask, setShowCreateTask] = useState(false);

  const { data: campaignTasks } = useMarketingTasks({
    campaignId: campaignId,
  });

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
      setServiceIds(
        campaign.services?.map((s) => s.service.id) ?? []
      );
      setBudget(campaign.budget != null ? String(campaign.budget) : "");
      setLocation(campaign.location || "");
      setDeliverables(campaign.deliverables || "");
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

  function handleSaveCentres(ids: string[]) {
    setServiceIds(ids);
    updateCampaign.mutate({ id: campaignId, serviceIds: ids });
  }

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
                className="w-full rounded border border-brand px-2 py-1 text-lg font-semibold text-gray-900 focus:outline-none focus:ring-1 focus:ring-brand"
              />
            ) : (
              <h2
                onClick={() => setEditingName(true)}
                className="cursor-pointer truncate text-lg font-semibold text-gray-900 hover:text-brand"
              >
                {isLoading ? "Loading..." : name}
              </h2>
            )}
            {/* Service Badges */}
            {campaign?.services && campaign.services.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {campaign.services.map((s) => (
                  <span
                    key={s.service.id}
                    className="inline-flex items-center rounded-md bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand"
                  >
                    {s.service.code}
                  </span>
                ))}
              </div>
            )}
            {campaign && (!campaign.services || campaign.services.length === 0) && (
              <p className="text-xs text-gray-400 italic mt-1">All Centres</p>
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
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
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
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
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
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
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
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
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
                          ? "border-brand bg-brand/10 text-brand"
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

              {/* Target Centres */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">
                    Target Centres
                  </label>
                  <button
                    type="button"
                    onClick={() => setEditingCentres(!editingCentres)}
                    className="text-xs text-brand hover:underline inline-flex items-center gap-1"
                  >
                    <Pencil className="h-3 w-3" />
                    {editingCentres ? "Done" : "Edit"}
                  </button>
                </div>
                {editingCentres ? (
                  <ServiceMultiSelect
                    selectedIds={serviceIds}
                    onChange={handleSaveCentres}
                  />
                ) : (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                    {serviceIds.length === 0 ? (
                      <span className="text-sm text-gray-500 italic">
                        All Centres
                      </span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {campaign?.services?.map((s) => (
                          <span
                            key={s.service.id}
                            className="inline-flex items-center rounded-md bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand"
                          >
                            {s.service.name} ({s.service.code})
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
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
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
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
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
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
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
              {/* Activation / Event Fields */}
              {(type === "activation" || type === "event") && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                        Budget ($)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={budget}
                        onChange={(e) => setBudget(e.target.value)}
                        onBlur={() =>
                          handleUpdate(
                            "budget",
                            budget ? parseFloat(budget).toString() : null
                          )
                        }
                        placeholder="0.00"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                        Location
                      </label>
                      <input
                        type="text"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        onBlur={() =>
                          handleUpdate("location", location || null)
                        }
                        placeholder="Venue or address"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                      Deliverables
                    </label>
                    <textarea
                      value={deliverables}
                      onChange={(e) => setDeliverables(e.target.value)}
                      onBlur={() =>
                        handleUpdate("deliverables", deliverables || null)
                      }
                      rows={2}
                      placeholder="Key deliverables..."
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Centre Assignments (activation / event only) */}
            {(type === "activation" || type === "event") && (
              <div>
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                  Centre Assignments
                </h3>
                <ActivationAssignmentGrid campaignId={campaignId} />
              </div>
            )}

            {/* Tasks */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                  <CheckSquare className="h-3.5 w-3.5" />
                  Tasks{" "}
                  {campaignTasks && campaignTasks.length > 0
                    ? `(${campaignTasks.length})`
                    : ""}
                </h3>
                <button
                  onClick={() => setShowCreateTask(true)}
                  className="inline-flex items-center gap-1 rounded-md bg-brand/10 px-2 py-1 text-xs font-medium text-brand hover:bg-brand/20 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Add Task
                </button>
              </div>
              {campaignTasks && campaignTasks.length > 0 ? (
                <div className="space-y-1.5">
                  {campaignTasks.map((task) => {
                    const statusColors: Record<string, string> = {
                      todo: "bg-gray-100 text-gray-600",
                      in_progress: "bg-blue-100 text-blue-700",
                      in_review: "bg-amber-100 text-amber-700",
                      done: "bg-emerald-100 text-emerald-700",
                    };
                    return (
                      <div
                        key={task.id}
                        className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                      >
                        <span
                          className={`text-sm font-medium ${
                            task.status === "done"
                              ? "text-gray-400 line-through"
                              : "text-gray-800"
                          }`}
                        >
                          {task.title}
                        </span>
                        <div className="flex items-center gap-2">
                          {task.assignee && (
                            <span className="text-[10px] text-gray-400">
                              {task.assignee?.name ?? "Unassigned"}
                            </span>
                          )}
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              statusColors[task.status] ?? "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {task.status.replace("_", " ")}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-400">
                  No tasks linked to this campaign.
                </p>
              )}
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
                          {comment.author?.name ?? "Unknown"}
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
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
                <button
                  type="submit"
                  disabled={!commentText.trim() || addComment.isPending}
                  className="self-end rounded-lg bg-brand p-2.5 text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Create Task Modal */}
      <CreateTaskModal
        open={showCreateTask}
        onClose={() => setShowCreateTask(false)}
        defaultCampaignId={campaignId}
      />
    </>
  );
}
