"use client";

import { useState, useEffect } from "react";
import { X, Trash2 } from "lucide-react";
import { usePost, useUpdatePost, useDeletePost } from "@/hooks/useMarketing";
import type { PostData } from "@/hooks/useMarketing";

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
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => autoSave("title", title)}
            className="text-lg font-semibold text-gray-900 bg-transparent border-none outline-none focus:ring-0 w-full mr-4"
          />
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
      </div>
    </>
  );
}
