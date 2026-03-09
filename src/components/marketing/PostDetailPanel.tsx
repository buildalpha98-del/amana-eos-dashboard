"use client";

import { useState, useEffect } from "react";
import { X, Trash2, Pencil, ExternalLink, Unlink, Link2, Check, XCircle, ShieldCheck, Palette, Image } from "lucide-react";
import { usePost, useUpdatePost, useDeletePost, useSocialConnections, useApprovePost, useRejectPost } from "@/hooks/useMarketing";
import type { PostData } from "@/hooks/useMarketing";
import { ServiceMultiSelect } from "./ServiceMultiSelect";
import { LinkSocialPostModal } from "./LinkSocialPostModal";
import { toast } from "@/hooks/useToast";

interface PostDetailPanelProps {
  postId: string;
  onClose: () => void;
}

const STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "in_review", label: "In Review" },
  { value: "approved", label: "Approved" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
] as const;

const PLATFORM_OPTIONS = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "email", label: "Email" },
  { value: "newsletter", label: "Newsletter" },
  { value: "website", label: "Website" },
  { value: "flyer", label: "Flyer" },
] as const;

export function PostDetailPanel({ postId, onClose }: PostDetailPanelProps) {
  const { data: post, isLoading } = usePost(postId);
  const updatePost = useUpdatePost();
  const deletePost = useDeletePost();
  const approvePost = useApprovePost();
  const rejectPost = useRejectPost();

  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [content, setContent] = useState("");
  const [pillar, setPillar] = useState("");
  const [notes, setNotes] = useState("");
  const [designLink, setDesignLink] = useState("");
  const [likes, setLikes] = useState(0);
  const [comments, setComments] = useState(0);
  const [shares, setShares] = useState(0);
  const [reach, setReach] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingCentres, setEditingCentres] = useState(false);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const { data: socialConnections } = useSocialConnections();

  useEffect(() => {
    if (post) {
      setTitle(post.title);
      setPlatform(post.platform);
      setScheduledDate(
        post.scheduledDate
          ? new Date(post.scheduledDate).toISOString().slice(0, 16)
          : ""
      );
      setContent(post.content ?? "");
      setPillar(post.pillar ?? "");
      setNotes(post.notes ?? "");
      setDesignLink(post.designLink ?? "");
      setLikes(post.likes);
      setComments(post.comments);
      setShares(post.shares);
      setReach(post.reach);
      setServiceIds(
        post.services?.map((s) => s.service.id) ?? []
      );
    }
  }, [post]);

  function autoSave(field: string, value: string | number | null) {
    updatePost.mutate({ id: postId, [field]: value });
  }

  function handleStatusChange(newStatus: string) {
    updatePost.mutate({ id: postId, status: newStatus as PostData["status"] });
  }

  function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    deletePost.mutate(postId, {
      onSuccess: () => onClose(),
    });
  }

  function handleSaveCentres(ids: string[]) {
    setServiceIds(ids);
    updatePost.mutate({ id: postId, serviceIds: ids });
  }

  if (isLoading) {
    return (
      <>
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={onClose}
        />
        <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-lg items-center justify-center bg-white shadow-xl">
          <p className="text-gray-500">Loading post...</p>
        </div>
      </>
    );
  }

  if (!post) {
    return (
      <>
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={onClose}
        />
        <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-lg items-center justify-center bg-white shadow-xl">
          <p className="text-gray-500">Post not found</p>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-lg overflow-y-auto bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex-1 mr-4">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => autoSave("title", title)}
              className="text-lg font-semibold text-gray-900 bg-transparent border-none outline-none focus:ring-0 w-full"
            />
            {/* Service Badges */}
            {post.services && post.services.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {post.services.map((s) => (
                  <span
                    key={s.service.id}
                    className="inline-flex items-center rounded-md bg-[#004E64]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#004E64]"
                  >
                    {s.service.code}
                  </span>
                ))}
              </div>
            )}
            {(!post.services || post.services.length === 0) && (
              <p className="text-xs text-gray-400 italic mt-1">All Centres</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleDelete}
              className={`rounded-lg p-2 text-sm transition-colors ${
                confirmDelete
                  ? "bg-red-600 text-white"
                  : "text-red-500 hover:bg-red-50"
              }`}
              title={confirmDelete ? "Click again to confirm" : "Delete post"}
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Workflow Status Buttons */}
        <div className="flex gap-1 border-b border-gray-200 px-6 py-3 overflow-x-auto">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => handleStatusChange(s.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                post.status === s.value
                  ? "bg-[#004E64] text-white"
                  : "border border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Approval Section */}
        {post.status === "draft" && (
          <div className="border-b border-gray-200 px-6 py-3">
            <button
              onClick={() => handleStatusChange("in_review")}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 transition-colors"
            >
              <ShieldCheck className="h-4 w-4" />
              Request Approval
            </button>
            {post.rejectionReason && (
              <div className="mt-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                <p className="text-xs font-medium text-red-700 mb-0.5">
                  Previously rejected:
                </p>
                <p className="text-sm text-red-600">{post.rejectionReason}</p>
              </div>
            )}
          </div>
        )}

        {post.status === "in_review" && (
          <div className="border-b border-gray-200 px-6 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  approvePost.mutate(postId, {
                    onSuccess: () => {
                      toast({
                        title: "Post Approved",
                        description:
                          "The post has been approved and is ready for scheduling.",
                      });
                    },
                  })
                }
                disabled={approvePost.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                {approvePost.isPending ? "Approving..." : "Approve"}
              </button>
              <button
                onClick={() => setShowRejectForm(!showRejectForm)}
                className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors"
              >
                <XCircle className="h-4 w-4" />
                Reject
              </button>
            </div>
            {showRejectForm && (
              <div className="space-y-2">
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Reason for rejection (optional)..."
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
                />
                <button
                  onClick={() => {
                    rejectPost.mutate(
                      { postId, reason: rejectionReason || undefined },
                      {
                        onSuccess: () => {
                          setShowRejectForm(false);
                          setRejectionReason("");
                          toast({
                            title: "Post Rejected",
                            description:
                              "The post has been sent back for revisions.",
                            variant: "destructive",
                          });
                        },
                      }
                    );
                  }}
                  disabled={rejectPost.isPending}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {rejectPost.isPending ? "Rejecting..." : "Confirm Rejection"}
                </button>
              </div>
            )}
          </div>
        )}

        {post.status === "approved" && post.approvedBy && (
          <div className="border-b border-gray-200 px-6 py-3">
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
              <Check className="h-4 w-4 text-emerald-600" />
              <span className="text-sm text-emerald-700">
                Approved by{" "}
                <span className="font-medium">{post.approvedBy.name}</span>
                {post.approvedAt && (
                  <span className="text-emerald-500">
                    {" "}
                    on {new Date(post.approvedAt).toLocaleDateString()}
                  </span>
                )}
              </span>
            </div>
          </div>
        )}

        {/* Fields */}
        <div className="space-y-4 px-6 py-4">
          {/* Platform */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wider">
              Platform
            </label>
            <select
              value={platform}
              onChange={(e) => {
                setPlatform(e.target.value);
                autoSave("platform", e.target.value);
              }}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
            >
              {PLATFORM_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Scheduled Date */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wider">
              Scheduled Date
            </label>
            <input
              type="datetime-local"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              onBlur={() =>
                autoSave(
                  "scheduledDate",
                  scheduledDate ? new Date(scheduledDate).toISOString() : null
                )
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
            />
          </div>

          {/* Target Centres */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">
                Target Centres
              </label>
              <button
                type="button"
                onClick={() => setEditingCentres(!editingCentres)}
                className="text-xs text-[#004E64] hover:underline inline-flex items-center gap-1"
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
                    {post.services?.map((s) => (
                      <span
                        key={s.service.id}
                        className="inline-flex items-center rounded-md bg-[#004E64]/10 px-2 py-0.5 text-xs font-medium text-[#004E64]"
                      >
                        {s.service.name} ({s.service.code})
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Content */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wider">
              Content
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onBlur={() => autoSave("content", content || null)}
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64] resize-none"
            />
          </div>

          {/* Pillar */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wider">
              Pillar
            </label>
            <input
              type="text"
              value={pillar}
              onChange={(e) => setPillar(e.target.value)}
              onBlur={() => autoSave("pillar", pillar || null)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
            />
          </div>

          {/* Assignee (read-only) */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wider">
              Assignee
            </label>
            <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {post.assignee?.name ?? "Unassigned"}
            </p>
          </div>

          {/* Campaign (read-only) */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wider">
              Campaign
            </label>
            <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {post.campaign?.name ?? "None"}
            </p>
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wider">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => autoSave("notes", notes || null)}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64] resize-none"
            />
          </div>

          {/* Design Link */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wider">
              Design Link
            </label>
            <input
              type="url"
              value={designLink}
              onChange={(e) => setDesignLink(e.target.value)}
              onBlur={() => autoSave("designLink", designLink || null)}
              placeholder="https://..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
            />
          </div>

          {/* Canva Design */}
          {(post.canvaDesignUrl || post.canvaDesignId) && (
            <div className="p-3 rounded-lg bg-purple-50 border border-purple-200">
              <div className="flex items-center gap-2 mb-2">
                <Palette className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-medium text-purple-900">Canva Design</span>
              </div>
              <div className="flex gap-2">
                {post.canvaDesignUrl && (
                  <a
                    href={post.canvaDesignUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-purple-600 text-white hover:bg-purple-700 transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Edit in Canva
                  </a>
                )}
                {post.canvaExportUrl && (
                  <a
                    href={post.canvaExportUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-purple-300 text-purple-700 hover:bg-purple-100 transition-colors"
                  >
                    <Image className="h-3 w-3" />
                    View Export
                  </a>
                )}
              </div>
              {post.canvaDesignId && (
                <p className="text-xs text-purple-500 mt-1.5">Design ID: {post.canvaDesignId}</p>
              )}
            </div>
          )}
        </div>

        {/* Engagement Stats */}
        <div className="border-t border-gray-200 px-6 py-4">
          <h3 className="mb-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
            Engagement Stats
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Likes", value: likes, setter: setLikes, field: "likes" },
              { label: "Comments", value: comments, setter: setComments, field: "comments" },
              { label: "Shares", value: shares, setter: setShares, field: "shares" },
              { label: "Reach", value: reach, setter: setReach, field: "reach" },
            ].map((stat) => (
              <div
                key={stat.field}
                className="rounded-lg border border-gray-200 bg-gray-50 p-3"
              >
                <p className="text-xs text-gray-500 mb-1">{stat.label}</p>
                <input
                  type="number"
                  min={0}
                  value={stat.value}
                  onChange={(e) => stat.setter(Number(e.target.value) || 0)}
                  onBlur={() => autoSave(stat.field, stat.value)}
                  className="w-full bg-transparent text-lg font-semibold text-gray-900 border-none outline-none focus:ring-0 p-0"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Social Metrics Section (published FB/IG posts only) */}
        {post.status === "published" &&
          ["facebook", "instagram"].includes(post.platform) && (
            <div className="border-t border-gray-200 px-6 py-4">
              <h3 className="mb-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Social Metrics
              </h3>

              {post.externalPostId ? (
                <div className="space-y-3">
                  {/* Live metrics indicator */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                        Live
                      </span>
                      {post.engagementSyncedAt && (
                        <span className="text-xs text-gray-400">
                          Last synced:{" "}
                          {(() => {
                            const diff =
                              Date.now() -
                              new Date(post.engagementSyncedAt).getTime();
                            const hours = Math.floor(diff / 3600000);
                            if (hours < 1) return "just now";
                            if (hours < 24) return `${hours}h ago`;
                            return `${Math.floor(hours / 24)}d ago`;
                          })()}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {post.externalUrl && (
                        <a
                          href={post.externalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-[#004E64] hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          View on{" "}
                          {post.platform.charAt(0).toUpperCase() +
                            post.platform.slice(1)}
                        </a>
                      )}
                      <button
                        onClick={() =>
                          updatePost.mutate({
                            id: postId,
                            externalPostId: null,
                            externalUrl: null,
                          })
                        }
                        className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-red-500"
                      >
                        <Unlink className="h-3 w-3" />
                        Unlink
                      </button>
                    </div>
                  </div>

                  {/* Engagement grid */}
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: "Likes", value: post.likes },
                      { label: "Comments", value: post.comments },
                      { label: "Shares", value: post.shares },
                      { label: "Reach", value: post.reach },
                    ].map((m) => (
                      <div
                        key={m.label}
                        className="rounded-lg bg-green-50 border border-green-100 p-2 text-center"
                      >
                        <p className="text-lg font-bold text-green-700">
                          {m.value.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-green-600">{m.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowLinkModal(true)}
                  className="inline-flex items-center gap-2 rounded-lg border border-[#004E64] px-4 py-2 text-sm font-medium text-[#004E64] hover:bg-[#004E64]/5 transition-colors"
                >
                  <Link2 className="h-4 w-4" />
                  Link to Social Post
                </button>
              )}
            </div>
          )}

        {/* Link Social Post Modal */}
        {showLinkModal && (
          <LinkSocialPostModal
            postId={postId}
            platform={post.platform}
            onClose={() => setShowLinkModal(false)}
          />
        )}
      </div>
    </>
  );
}
