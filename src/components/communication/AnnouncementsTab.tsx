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
import {
  useAnnouncements,
  useCreateAnnouncement,
  useUpdateAnnouncement,
  useDeleteAnnouncement,
  useMarkAnnouncementRead,
} from "@/hooks/useCommunication";

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
        bg: "bg-gray-100",
        text: "text-gray-600",
        border: "border-gray-200",
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
          <h2 className="text-lg font-semibold text-gray-900">
            Announcements
          </h2>
          <p className="text-sm text-gray-500">
            Company-wide announcements and updates
          </p>
        </div>
        {isPrivileged && (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-[#004E64] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#003d4f]"
          >
            <Plus className="h-4 w-4" />
            New Announcement
          </button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-gray-500">
          Loading announcements...
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border bg-white py-16">
          <Megaphone className="mb-3 h-10 w-10 text-gray-300" />
          <p className="text-lg font-medium text-gray-700">
            No announcements yet
          </p>
          <p className="mt-1 text-sm text-gray-500">
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
                  "rounded-xl border bg-white p-5 transition-shadow hover:shadow-md",
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
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#FECE00]/20 px-2.5 py-0.5 text-xs font-medium text-[#004E64]">
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
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                      Draft
                    </span>
                  )}

                  {/* Read count */}
                  <span className="ml-auto inline-flex items-center gap-1 text-xs text-gray-400">
                    <Eye className="h-3 w-3" />
                    {readCount} read
                  </span>
                </div>

                {/* Title */}
                <h3 className="text-base font-semibold text-gray-900">
                  {announcement.title}
                </h3>

                {/* Body (truncated) */}
                <p className="mt-1 line-clamp-3 text-sm text-gray-600">
                  {announcement.body}
                </p>

                {/* Footer: author, date, actions */}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {/* Author + date */}
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    {announcement.author?.avatar ? (
                      <img
                        src={announcement.author.avatar}
                        alt={announcement.author.name}
                        className="h-5 w-5 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#004E64] text-[10px] font-medium text-white">
                        {announcement.author?.name?.charAt(0) || "?"}
                      </div>
                    )}
                    <span className="font-medium text-gray-600">
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
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
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
                        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
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
                        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
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
              className="w-full max-w-lg rounded-xl bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b px-6 py-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  {editingAnnouncement
                    ? "Edit Announcement"
                    : "New Announcement"}
                </h2>
                <button
                  onClick={handleClose}
                  className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
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
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Title <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      placeholder="Announcement title"
                      required
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
                    />
                  </div>

                  {/* Body */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Body <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={formBody}
                      onChange={(e) => setFormBody(e.target.value)}
                      rows={5}
                      placeholder="Write your announcement..."
                      required
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
                    />
                  </div>

                  {/* Audience + Priority row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Audience
                      </label>
                      <select
                        value={formAudience}
                        onChange={(e) => setFormAudience(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
                      >
                        {AUDIENCE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Priority
                      </label>
                      <select
                        value={formPriority}
                        onChange={(e) => setFormPriority(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
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
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={formPublish}
                      onChange={(e) => setFormPublish(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-[#004E64] focus:ring-[#004E64]"
                    />
                    Publish immediately
                    {!formPublish && (
                      <span className="text-xs text-gray-400">
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
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isPending}
                    className="rounded-lg bg-[#004E64] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#003d4f] disabled:opacity-50"
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
