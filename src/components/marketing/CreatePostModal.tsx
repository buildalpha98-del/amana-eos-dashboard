"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useCreatePost, useCampaigns } from "@/hooks/useMarketing";

interface CreatePostModalProps {
  open: boolean;
  onClose: () => void;
}

const PLATFORM_OPTIONS = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "email", label: "Email" },
  { value: "newsletter", label: "Newsletter" },
  { value: "website", label: "Website" },
  { value: "flyer", label: "Flyer" },
] as const;

const RECURRING_OPTIONS = [
  { value: "none", label: "None" },
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthly", label: "Monthly" },
] as const;

export function CreatePostModal({ open, onClose }: CreatePostModalProps) {
  const createPost = useCreatePost();
  const { data: campaigns } = useCampaigns();
  const { data: users } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState("");
  const [content, setContent] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [pillar, setPillar] = useState("");
  const [recurring, setRecurring] = useState("none");
  const [notes, setNotes] = useState("");
  const [designLink, setDesignLink] = useState("");
  const [error, setError] = useState("");

  function resetForm() {
    setTitle("");
    setPlatform("");
    setContent("");
    setScheduledDate("");
    setAssigneeId("");
    setCampaignId("");
    setPillar("");
    setRecurring("none");
    setNotes("");
    setDesignLink("");
    setError("");
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!platform) {
      setError("Platform is required.");
      return;
    }

    createPost.mutate(
      {
        title: title.trim(),
        platform: platform as (typeof PLATFORM_OPTIONS)[number]["value"],
        content: content || undefined,
        scheduledDate: scheduledDate
          ? new Date(scheduledDate).toISOString()
          : undefined,
        assigneeId: assigneeId || undefined,
        campaignId: campaignId || undefined,
        pillar: pillar || undefined,
        recurring: recurring as (typeof RECURRING_OPTIONS)[number]["value"],
        notes: notes || undefined,
        designLink: designLink || undefined,
      },
      {
        onSuccess: () => {
          handleClose();
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : "Failed to create post.");
        },
      }
    );
  }

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="w-full max-w-2xl rounded-xl bg-white shadow-xl max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">New Post</h2>
            <button
              onClick={handleClose}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 px-6 py-4">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Title */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
                placeholder="Post title"
              />
            </div>

            {/* Platform */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Platform <span className="text-red-500">*</span>
              </label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
              >
                <option value="">Select platform</option>
                {PLATFORM_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Content */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Content
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64] resize-none"
                placeholder="Post content..."
              />
            </div>

            {/* Scheduled Date */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Scheduled Date
              </label>
              <input
                type="datetime-local"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
              />
            </div>

            {/* Two-column row: Assignee & Campaign */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Assignee */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Assignee
                </label>
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
                >
                  <option value="">Unassigned</option>
                  {users?.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Campaign */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Campaign
                </label>
                <select
                  value={campaignId}
                  onChange={(e) => setCampaignId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
                >
                  <option value="">None</option>
                  {campaigns?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Two-column row: Pillar & Recurring */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Pillar */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Pillar
                </label>
                <input
                  type="text"
                  value={pillar}
                  onChange={(e) => setPillar(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
                  placeholder="Content pillar"
                />
              </div>

              {/* Recurring */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Recurring
                </label>
                <select
                  value={recurring}
                  onChange={(e) => setRecurring(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
                >
                  {RECURRING_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64] resize-none"
                placeholder="Internal notes..."
              />
            </div>

            {/* Design Link */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Design Link
              </label>
              <input
                type="url"
                value={designLink}
                onChange={(e) => setDesignLink(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
                placeholder="https://..."
              />
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createPost.isPending}
                className="rounded-lg bg-[#004E64] px-4 py-2 text-sm font-medium text-white hover:bg-[#003d4f] transition-colors disabled:opacity-50"
              >
                {createPost.isPending ? "Creating..." : "Create Post"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
