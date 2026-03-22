"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useCreatePost, useCampaigns } from "@/hooks/useMarketing";
import { ServiceMultiSelect } from "./ServiceMultiSelect";
import { AiButton } from "@/components/ui/AiButton";

interface CreatePostModalProps {
  open: boolean;
  onClose: () => void;
  defaultDate?: string;
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

export function CreatePostModal({ open, onClose, defaultDate }: CreatePostModalProps) {
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
  const [scheduledDate, setScheduledDate] = useState(defaultDate ?? "");
  const [assigneeId, setAssigneeId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [pillar, setPillar] = useState("");
  const [recurring, setRecurring] = useState("none");
  const [notes, setNotes] = useState("");
  const [designLink, setDesignLink] = useState("");
  const [canvaDesignUrl, setCanvaDesignUrl] = useState("");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  // Sync scheduledDate when the modal opens with a defaultDate
  useEffect(() => {
    if (open && defaultDate) {
      setScheduledDate(defaultDate);
    }
  }, [open, defaultDate]);

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
    setCanvaDesignUrl("");
    setServiceIds([]);
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
        canvaDesignUrl: canvaDesignUrl || undefined,
        serviceIds: serviceIds.length > 0 ? serviceIds : undefined,
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
          className="flex w-full max-w-2xl flex-col rounded-xl bg-card shadow-xl max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold text-foreground">New Post</h2>
            <button
              onClick={handleClose}
              className="rounded-lg p-2 text-muted hover:bg-surface hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto space-y-4 px-6 py-4">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Title */}
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground/80">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                placeholder="Post title"
              />
            </div>

            {/* Platform */}
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground/80">
                Platform <span className="text-red-500">*</span>
              </label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
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
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-foreground/80">
                  Content
                </label>
                <AiButton
                  templateSlug="marketing/post-writer"
                  variables={{
                    platform: platform || "social media",
                    pillar: pillar || "general",
                    topic: title || "Amana OSHC update",
                    serviceName: "Amana OSHC",
                    campaignContext: campaignId ? "Part of an active campaign" : "Standalone post",
                  }}
                  onResult={(text) => setContent(text)}
                  label="Write with AI"
                  size="sm"
                  section="marketing"
                />
              </div>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand resize-none"
                placeholder="Post content..."
              />
              {platform && (
                <ContentCharacterCounter content={content} platform={platform} />
              )}
            </div>

            {/* Scheduled Date */}
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground/80">
                Scheduled Date
              </label>
              <input
                type="datetime-local"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>

            {/* Two-column row: Assignee & Campaign */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Assignee */}
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground/80">
                  Assignee
                </label>
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
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
                <label className="mb-1 block text-sm font-medium text-foreground/80">
                  Campaign
                </label>
                <select
                  value={campaignId}
                  onChange={(e) => setCampaignId(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
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
                <label className="mb-1 block text-sm font-medium text-foreground/80">
                  Pillar
                </label>
                <input
                  type="text"
                  value={pillar}
                  onChange={(e) => setPillar(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                  placeholder="Content pillar"
                />
              </div>

              {/* Recurring */}
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground/80">
                  Recurring
                </label>
                <select
                  value={recurring}
                  onChange={(e) => setRecurring(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                >
                  {RECURRING_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Target Centres */}
            <div>
              <ServiceMultiSelect
                selectedIds={serviceIds}
                onChange={setServiceIds}
                label="Target Centres"
              />
              <p className="mt-1 text-xs text-muted">
                Leave empty for all centres
              </p>
            </div>

            {/* Notes */}
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground/80">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand resize-none"
                placeholder="Internal notes..."
              />
            </div>

            {/* Design Link */}
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground/80">
                Design Link
              </label>
              <input
                type="url"
                value={designLink}
                onChange={(e) => setDesignLink(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                placeholder="https://..."
              />
            </div>

            {/* Canva Design URL */}
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground/80">
                Canva Design URL
              </label>
              <input
                type="url"
                value={canvaDesignUrl}
                onChange={(e) => setCanvaDesignUrl(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                placeholder="https://www.canva.com/design/..."
              />
            </div>

            </div>

            {/* Submit */}
            <div className="flex shrink-0 justify-end gap-3 border-t border-border px-6 py-4">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-surface transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createPost.isPending}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover transition-colors disabled:opacity-50"
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

const PLATFORM_CHAR_LIMITS: Record<string, number> = {
  facebook: 63206,
  instagram: 2200,
  linkedin: 3000,
  email: 0,
  newsletter: 0,
  website: 0,
  flyer: 0,
};

function ContentCharacterCounter({ content, platform }: { content: string; platform: string }) {
  const limit = PLATFORM_CHAR_LIMITS[platform] || 0;
  if (!limit) return null;

  const count = content.length;
  const pct = Math.round((count / limit) * 100);
  const isOver = count > limit;
  const isNear = pct >= 80;

  return (
    <div className={`flex items-center justify-between mt-1 text-xs ${isOver ? "text-red-600 font-medium" : isNear ? "text-amber-600" : "text-muted"}`}>
      <span>{count.toLocaleString()} / {limit.toLocaleString()}</span>
      {isOver && <span>{(count - limit).toLocaleString()} over limit</span>}
    </div>
  );
}
