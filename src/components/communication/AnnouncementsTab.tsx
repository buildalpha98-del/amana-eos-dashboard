"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import {
  Plus,
  Megaphone,
  Pin,
  X,
  Pencil,
  Trash2,
  CheckCircle2,
  Eye,
  AlertTriangle,
  AlertCircle,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AiButton } from "@/components/ui/AiButton";
import {
  useAnnouncements,
  useCreateAnnouncement,
  useUpdateAnnouncement,
  useDeleteAnnouncement,
  useMarkAnnouncementRead,
} from "@/hooks/useCommunication";

const COMM_TYPE_OPTIONS = [
  { value: "announcement", label: "Announcement" },
  { value: "newsletter", label: "Newsletter Update" },
  { value: "event", label: "Event Notice" },
  { value: "incident", label: "Incident Update" },
  { value: "policy", label: "Policy Change" },
];

const TONE_OPTIONS = [
  { value: "warm", label: "Warm & Friendly" },
  { value: "formal", label: "Formal" },
  { value: "urgent", label: "Urgent" },
  { value: "celebratory", label: "Celebratory" },
];

const AUDIENCE_OPTIONS = [
  { value: "all", label: "All Team" },
  { value: "owners_admins", label: "Owners & Admins" },
  { value: "managers", label: "Managers" },
  { value: "custom", label: "Custom" },
];

const PRIORITY_OPTIONS = [
  { value: "normal", label: "Normal" },
  { value: "important", label: "Important" },
  { value: "urgent", label: "Urgent" },
];

function getPriorityConfig(priority: string) {
  switch (priority) {
    case "urgent":
      return {
        bg: "bg-red-100",
        text: "text-red-700",
        border: "border-red-200",
        icon: AlertTriangle,
        label: "Urgent",
      };
    case "important":
      return {
        bg: "bg-amber-100",
        text: "text-amber-700",
        border: "border-amber-200",
        icon: AlertCircle,
        label: "Important",
      };
    default:
      return {
        bg: "bg-surface",
        text: "text-muted",
        border: "border-border",
        icon: Info,
        label: "Normal",
      };
  }
}

function getAudienceLabel(audience: string) {
  const match = AUDIENCE_OPTIONS.find((o) => o.value === audience);
  return match ? match.label : audience;
}

export function AnnouncementsTab() {
  const { data: session } = useSession();
  const { data: announcements, isLoading } = useAnnouncements();
  const createAnnouncement = useCreateAnnouncement();
  const updateAnnouncement = useUpdateAnnouncement();
  const deleteAnnouncement = useDeleteAnnouncement();
  const markRead = useMarkAnnouncementRead();

  const [showModal, setShowModal] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<any>(null);
  const [markedReadIds, setMarkedReadIds] = useState<Set<string>>(new Set());

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formAudience, setFormAudience] = useState("all");
  const [formPriority, setFormPriority] = useState("normal");
  const [formPublish, setFormPublish] = useState(true);
  const [formCommType, setFormCommType] = useState("announcement");
  const [formTone, setFormTone] = useState("warm");
  const [formError, setFormError] = useState("");

  const userRole = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;
  const isPrivileged = userRole === "owner" || userRole === "admin";

  const resetForm = () => {
    setFormTitle("");
    setFormBody("");
    setFormAudience("all");
    setFormPriority("normal");
    setFormPublish(true);
    setFormCommType("announcement");
    setFormTone("warm");
    setFormError("");
    setEditingAnnouncement(null);
  };

  const openCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const openEdit = (announcement: any) => {
    setEditingAnnouncement(announcement);
    setFormTitle(announcement.title);
    setFormBody(announcement.body);
    setFormAudience(announcement.audience || "all");
    setFormPriority(announcement.priority || "normal");
    setFormPublish(!!announcement.publishedAt);
    setFormError("");
    setShowModal(true);
  };

  const handleClose = () => {
    resetForm();
    setShowModal(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!formTitle.trim()) {
      setFormError("Title is required.");
      return;
    }
    if (!formBody.trim()) {
      setFormError("Body is required.");
      return;
    }

    const payload: any = {
      title: formTitle.trim(),
      body: formBody.trim(),
      audience: formAudience,
      priority: formPriority,
    };

    if (formPublish) {
      payload.publishedAt = new Date().toISOString();
    }

    if (editingAnnouncement) {
      updateAnnouncement.mutate(
        { id: editingAnnouncement.id, ...payload },
        {
          onSuccess: () => handleClose(),
          onError: (err: any) =>
            setFormError(err?.message || "Failed to update announcement."),
        }
      );
    } else {
      createAnnouncement.mutate(payload, {
        onSuccess: () => handleClose(),
        onError: (err: any) =>
          setFormError(err?.message || "Failed to create announcement."),
      });
    }
  };

  const handleDelete = (id: string) => {
    if (!confirm("Are you sure you want to delete this announcement?")) return;
    deleteAnnouncement.mutate(id);
  };

  const handleMarkRead = (id: string) => {
    markRead.mutate(id, {
      onSuccess: () => {
        setMarkedReadIds((prev) => new Set(prev).add(id));
      },
    });
  };

  const isPending =
    createAnnouncement.isPending || updateAnnouncement.isPending;

  // Sort: pinned first, then by date descending
  const sorted = announcements
    ? [...announcements].sort((a: any, b: any) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return (
          new Date(b.publishedAt || b.createdAt).getTime() -
          new Date(a.publishedAt || a.createdAt).getTime()
        );
      })
    : [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Announcements
          </h2>
          <p className="text-sm text-muted">
            Company-wide announcements and updates
          </p>
        </div>
        {isPrivileged && (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
          >
            <Plus className="h-4 w-4" />
            New Announcement
          </button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted">
          Loading announcements...
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border bg-card py-16">
          <Megaphone className="mb-3 h-10 w-10 text-muted/50" />
          <p className="text-lg font-medium text-foreground/80">
            No announcements yet
          </p>
          <p className="mt-1 text-sm text-muted">
            {isPrivileged
              ? "Create your first announcement to keep the team informed."
              : "No announcements have been posted yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((announcement: any) => {
            const priority = getPriorityConfig(announcement.priority);
            const PriorityIcon = priority.icon;
            const isOwner = announcement.author?.id === userId;
            const canEdit = isOwner || isPrivileged;
            const alreadyMarked = markedReadIds.has(announcement.id);
            const isReadByUser = alreadyMarked;
            const readCount = announcement._count?.readReceipts ?? 0;

            return (
              <div
                key={announcement.id}
                className={cn(
                  "rounded-xl border bg-card p-5 transition-shadow hover:shadow-md",
                  announcement.priority === "urgent" && "border-red-200",
                  announcement.priority === "important" && "border-amber-200"
                )}
              >
                {/* Top row: badges and actions */}
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  {/* Priority badge */}
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
                      priority.bg,
                      priority.text
                    )}
                  >
                    <PriorityIcon className="h-3 w-3" />
                    {priority.label}
                  </span>

                  {/* Pinned indicator */}
                  {announcement.pinned && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent/20 px-2.5 py-0.5 text-xs font-medium text-brand">
                      <Pin className="h-3 w-3" />
                      Pinned
                    </span>
                  )}

                  {/* Audience badge */}
                  <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                    {getAudienceLabel(announcement.audience)}
                  </span>

                  {/* Draft indicator */}
                  {!announcement.publishedAt && (
                    <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-medium text-muted">
                      Draft
                    </span>
                  )}

                  {/* Read count */}
                  <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted">
                    <Eye className="h-3 w-3" />
                    {readCount} read
                  </span>
                </div>

                {/* Title */}
                <h3 className="text-base font-semibold text-foreground">
                  {announcement.title}
                </h3>

                {/* Body (truncated) */}
                <p className="mt-1 line-clamp-3 text-sm text-muted">
                  {announcement.body}
                </p>

                {/* Footer: author, date, actions */}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {/* Author + date */}
                  <div className="flex items-center gap-2 text-xs text-muted">
                    {announcement.author?.avatar ? (
                      <img
                        src={announcement.author.avatar}
                        alt={announcement.author?.name ?? "Unknown"}
                        className="h-5 w-5 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-brand text-[10px] font-medium text-white">
                        {announcement.author?.name?.charAt(0) || "?"}
                      </div>
                    )}
                    <span className="font-medium text-muted">
                      {announcement.author?.name || "Unknown"}
                    </span>
                    <span>&middot;</span>
                    <span>
                      {new Date(
                        announcement.publishedAt || announcement.createdAt
                      ).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Action buttons */}
                  <div className="ml-auto flex items-center gap-2">
                    {/* Mark as Read */}
                    {!isReadByUser && (
                      <button
                        onClick={() => handleMarkRead(announcement.id)}
                        disabled={markRead.isPending}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Mark as Read
                      </button>
                    )}
                    {isReadByUser && (
                      <span className="inline-flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Read
                      </span>
                    )}

                    {/* Edit */}
                    {canEdit && (
                      <button
                        onClick={() => openEdit(announcement)}
                        className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface hover:text-foreground"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}

                    {/* Delete */}
                    {canEdit && (
                      <button
                        onClick={() => handleDelete(announcement.id)}
                        disabled={deleteAnnouncement.isPending}
                        className="rounded-lg p-1.5 text-muted transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Create / Edit Modal ──────────────────────────────────────── */}
      {showModal && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 z-50 bg-black/30"
            onClick={handleClose}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="w-full max-w-lg rounded-xl bg-card shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b px-6 py-4">
                <h2 className="text-lg font-semibold text-foreground">
                  {editingAnnouncement
                    ? "Edit Announcement"
                    : "New Announcement"}
                </h2>
                <button
                  onClick={handleClose}
                  className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Form */}
              <form
                onSubmit={handleSubmit}
                className="max-h-[70vh] overflow-y-auto px-6 py-5"
              >
                <div className="space-y-4">
                  {/* Title */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground/80">
                      Title <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      placeholder="Announcement title"
                      required
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                    />
                  </div>

                  {/* Communication Type + Tone row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-foreground/80">
                        Type
                      </label>
                      <select
                        value={formCommType}
                        onChange={(e) => setFormCommType(e.target.value)}
                        className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                      >
                        {COMM_TYPE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-foreground/80">
                        Tone
                      </label>
                      <select
                        value={formTone}
                        onChange={(e) => setFormTone(e.target.value)}
                        className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                      >
                        {TONE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Body */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-sm font-medium text-foreground/80">
                        Body <span className="text-red-500">*</span>
                      </label>
                      <AiButton
                        templateSlug="communication/parent-draft"
                        variables={{
                          commType: COMM_TYPE_OPTIONS.find((o) => o.value === formCommType)?.label || formCommType,
                          details: formTitle || "General update",
                          tone: TONE_OPTIONS.find((o) => o.value === formTone)?.label || formTone,
                          centreName: "Amana OSHC",
                        }}
                        onResult={(text) => setFormBody(text)}
                        label="Draft with AI"
                        size="sm"
                        section="communication"
                      />
                    </div>
                    <textarea
                      value={formBody}
                      onChange={(e) => setFormBody(e.target.value)}
                      rows={5}
                      placeholder="Write your announcement or use AI to draft..."
                      required
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                    />
                  </div>

                  {/* Audience + Priority row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-foreground/80">
                        Audience
                      </label>
                      <select
                        value={formAudience}
                        onChange={(e) => setFormAudience(e.target.value)}
                        className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                      >
                        {AUDIENCE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-foreground/80">
                        Priority
                      </label>
                      <select
                        value={formPriority}
                        onChange={(e) => setFormPriority(e.target.value)}
                        className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                      >
                        {PRIORITY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Publish checkbox */}
                  <label className="flex items-center gap-2 text-sm text-foreground/80">
                    <input
                      type="checkbox"
                      checked={formPublish}
                      onChange={(e) => setFormPublish(e.target.checked)}
                      className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                    />
                    Publish immediately
                    {!formPublish && (
                      <span className="text-xs text-muted">
                        (will be saved as draft)
                      </span>
                    )}
                  </label>

                  {/* Error */}
                  {formError && (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                      {formError}
                    </p>
                  )}
                </div>

                {/* Footer */}
                <div className="mt-6 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-surface"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isPending}
                    className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
                  >
                    {isPending
                      ? editingAnnouncement
                        ? "Updating..."
                        : "Creating..."
                      : editingAnnouncement
                        ? "Update Announcement"
                        : formPublish
                          ? "Publish Announcement"
                          : "Save as Draft"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
