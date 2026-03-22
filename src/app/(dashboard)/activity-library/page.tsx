"use client";

import { useState, useRef } from "react";
import { useSession } from "next-auth/react";
import {
  Library,
  Search,
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  Upload,
  Download,
  FileText,
  Clock,
  Users,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageHeader } from "@/components/layout/PageHeader";
import { toast } from "@/hooks/useToast";
import { hasMinRole } from "@/lib/permissions";
import type { Role } from "@prisma/client";
import {
  useActivityTemplates,
  useCreateActivityTemplate,
  useUpdateActivityTemplate,
  useDeleteActivityTemplate,
  useUploadTemplateFile,
  useDeleteTemplateFile,
  type ActivityTemplate,
  type CreateTemplateInput,
} from "@/hooks/useActivityLibrary";

const CATEGORIES = [
  { value: "physical_play", label: "Physical Play" },
  { value: "creative_arts", label: "Creative Arts" },
  { value: "music_movement", label: "Music & Movement" },
  { value: "literacy", label: "Literacy" },
  { value: "numeracy", label: "Numeracy" },
  { value: "nature_outdoors", label: "Nature & Outdoors" },
  { value: "cooking_nutrition", label: "Cooking & Nutrition" },
  { value: "social_emotional", label: "Social & Emotional" },
  { value: "quiet_time", label: "Quiet Time" },
  { value: "free_play", label: "Free Play" },
  { value: "other", label: "Other" },
];

const CATEGORY_COLORS: Record<string, string> = {
  physical_play: "bg-blue-100 text-blue-700",
  creative_arts: "bg-pink-100 text-pink-700",
  music_movement: "bg-purple-100 text-purple-700",
  literacy: "bg-amber-100 text-amber-700",
  numeracy: "bg-emerald-100 text-emerald-700",
  nature_outdoors: "bg-green-100 text-green-700",
  cooking_nutrition: "bg-orange-100 text-orange-700",
  social_emotional: "bg-rose-100 text-rose-700",
  quiet_time: "bg-sky-100 text-sky-700",
  free_play: "bg-teal-100 text-teal-700",
  other: "bg-surface text-foreground/80",
};

function getCategoryLabel(value: string) {
  return CATEGORIES.find((c) => c.value === value)?.label || value;
}

function formatFileSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ActivityLibraryPage() {
  const { data: session } = useSession();
  const userRole = session?.user?.role as Role | undefined;
  const isAdmin = hasMinRole(userRole, "admin");

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ActivityTemplate | null>(null);

  const { data, isLoading, error, refetch } = useActivityTemplates({
    search: search || undefined,
    category: categoryFilter || undefined,
    page,
    limit: 20,
  });

  const deleteTemplate = useDeleteActivityTemplate();

  const handleEdit = (template: ActivityTemplate) => {
    setEditingTemplate(template);
    setModalOpen(true);
  };

  const handleDelete = async (template: ActivityTemplate) => {
    if (!confirm(`Delete "${template.title}"?`)) return;
    try {
      await deleteTemplate.mutateAsync(template.id);
      toast({ description: "Template deleted" });
    } catch {
      toast({ description: "Failed to delete template", variant: "destructive" });
    }
  };

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Activity Library"
        description="Reusable activity templates for weekly programming. Browse, search, and use templates to pre-fill your program."
        primaryAction={
          isAdmin
            ? {
                label: "Add Template",
                icon: Plus,
                onClick: () => { setEditingTemplate(null); setModalOpen(true); },
              }
            : undefined
        }
      >
        {/* Action bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              placeholder="Search activities..."
              aria-label="Search activities"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 py-2 text-sm border border-border rounded-lg focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-border rounded-lg focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
          >
            <option value="">All Categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
      </PageHeader>

      {/* Grid */}
      {error ? (
        <ErrorState
          title="Failed to load activity library"
          error={error as Error}
          onRetry={refetch}
        />
      ) : isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-brand animate-spin" />
        </div>
      ) : !data?.templates.length ? (
        <div className="text-center py-20 text-muted">
          <Library className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg font-medium">No templates yet</p>
          <p className="text-sm mt-1">
            {isAdmin ? "Click \"Add Template\" to create your first activity template." : "No templates available."}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.templates.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                isAdmin={isAdmin}
                onEdit={() => handleEdit(t)}
                onDelete={() => handleDelete(t)}
                onClick={() => handleEdit(t)}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 text-sm border border-border rounded-md disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-muted">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 text-sm border border-border rounded-md disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Modal */}
      {modalOpen && (
        <TemplateModal
          template={editingTemplate}
          isAdmin={isAdmin}
          onClose={() => { setModalOpen(false); setEditingTemplate(null); }}
        />
      )}
    </div>
  );
}

// ── Template Card ──────────────────────────────────────────────

function TemplateCard({
  template,
  isAdmin,
  onEdit,
  onDelete,
  onClick,
}: {
  template: ActivityTemplate;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onClick: () => void;
}) {
  return (
    <div
      className="group bg-card rounded-xl border border-border p-4 hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-2">
        <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", CATEGORY_COLORS[template.category] || CATEGORY_COLORS.other)}>
          {getCategoryLabel(template.category)}
        </span>
        {isAdmin && (
          <div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 opacity-60 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="p-1 rounded hover:bg-surface"
            >
              <Pencil className="w-3.5 h-3.5 text-muted" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="p-1 rounded hover:bg-red-50"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
            </button>
          </div>
        )}
      </div>
      <h3 className="font-semibold text-foreground text-sm mb-1">{template.title}</h3>
      {template.description && (
        <p className="text-xs text-muted line-clamp-2 mb-3">{template.description}</p>
      )}
      <div className="flex items-center gap-3 text-xs text-muted">
        {template.ageGroup && (
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {template.ageGroup}
          </span>
        )}
        {template.durationMinutes && (
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {template.durationMinutes}min
          </span>
        )}
        {template.files.length > 0 && (
          <span className="flex items-center gap-1">
            <FileText className="w-3 h-3" />
            {template.files.length} file{template.files.length > 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Template Modal ─────────────────────────────────────────────

function TemplateModal({
  template,
  isAdmin,
  onClose,
}: {
  template: ActivityTemplate | null;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const isEdit = !!template;
  const [title, setTitle] = useState(template?.title || "");
  const [description, setDescription] = useState(template?.description || "");
  const [howTo, setHowTo] = useState(template?.howTo || "");
  const [resourcesNeeded, setResourcesNeeded] = useState(template?.resourcesNeeded || "");
  const [category, setCategory] = useState(template?.category || "other");
  const [ageGroup, setAgeGroup] = useState(template?.ageGroup || "");
  const [durationMinutes, setDurationMinutes] = useState(template?.durationMinutes?.toString() || "");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createTemplate = useCreateActivityTemplate();
  const updateTemplate = useUpdateActivityTemplate();
  const uploadFile = useUploadTemplateFile();
  const deleteFile = useDeleteTemplateFile();

  const [files, setFiles] = useState(template?.files || []);

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ description: "Title is required", variant: "destructive" });
      return;
    }

    const input: CreateTemplateInput = {
      title: title.trim(),
      description: description.trim() || null,
      howTo: howTo.trim() || null,
      resourcesNeeded: resourcesNeeded.trim() || null,
      category,
      ageGroup: ageGroup.trim() || null,
      durationMinutes: durationMinutes ? parseInt(durationMinutes) : null,
    };

    try {
      if (isEdit) {
        await updateTemplate.mutateAsync({ ...input, id: template!.id });
        toast({ description: "Template updated" });
      } else {
        await createTemplate.mutateAsync(input);
        toast({ description: "Template created" });
      }
      onClose();
    } catch {
      toast({ description: "Failed to save template", variant: "destructive" });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !template) return;
    try {
      const record = await uploadFile.mutateAsync({ templateId: template.id, file });
      setFiles((prev) => [record, ...prev]);
      toast({ description: "File uploaded" });
    } catch {
      toast({ description: "Failed to upload file", variant: "destructive" });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!template) return;
    try {
      await deleteFile.mutateAsync({ templateId: template.id, fileId });
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      toast({ description: "File removed" });
    } catch {
      toast({ description: "Failed to remove file", variant: "destructive" });
    }
  };

  const saving = createTemplate.isPending || updateTemplate.isPending;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-border/50">
          <h2 className="text-lg font-semibold text-foreground">
            {isEdit ? (isAdmin ? "Edit Template" : "View Template") : "New Template"}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-surface">
            <X className="w-5 h-5 text-muted" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!isAdmin}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none disabled:bg-surface/50"
              placeholder="e.g. Obstacle Course Relay"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!isAdmin}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none disabled:bg-surface/50 resize-none"
              placeholder="Short description of the activity"
            />
          </div>

          {/* How To */}
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">How To Instructions</label>
            <textarea
              value={howTo}
              onChange={(e) => setHowTo(e.target.value)}
              disabled={!isAdmin}
              rows={5}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none disabled:bg-surface/50 resize-none"
              placeholder="Step-by-step instructions for running this activity..."
            />
          </div>

          {/* Resources Needed */}
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">Resources / Materials Needed</label>
            <textarea
              value={resourcesNeeded}
              onChange={(e) => setResourcesNeeded(e.target.value)}
              disabled={!isAdmin}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none disabled:bg-surface/50 resize-none"
              placeholder="List materials, equipment, or resources needed..."
            />
          </div>

          {/* Category / Age / Duration row */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                <Tag className="w-3.5 h-3.5 inline mr-1" />
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={!isAdmin}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none disabled:bg-surface/50"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                <Users className="w-3.5 h-3.5 inline mr-1" />
                Age Group
              </label>
              <input
                type="text"
                value={ageGroup}
                onChange={(e) => setAgeGroup(e.target.value)}
                disabled={!isAdmin}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none disabled:bg-surface/50"
                placeholder="e.g. 5-8"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                <Clock className="w-3.5 h-3.5 inline mr-1" />
                Duration (min)
              </label>
              <input
                type="number"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                disabled={!isAdmin}
                min={1}
                max={480}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none disabled:bg-surface/50"
                placeholder="30"
              />
            </div>
          </div>

          {/* Files */}
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-2">Attached Files</label>
            {files.length > 0 ? (
              <div className="space-y-2 mb-3">
                {files.map((f) => (
                  <div key={f.id} className="flex items-center justify-between bg-surface/50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-muted shrink-0" />
                      <span className="text-sm text-foreground/80 truncate">{f.fileName}</span>
                      {f.fileSize && (
                        <span className="text-xs text-muted shrink-0">{formatFileSize(f.fileSize)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <a
                        href={f.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 rounded hover:bg-border"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Download className="w-3.5 h-3.5 text-muted" />
                      </a>
                      {isAdmin && (
                        <button
                          onClick={() => handleDeleteFile(f.id)}
                          className="p-1 rounded hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted mb-2">No files attached</p>
            )}
            {isAdmin && isEdit && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                  accept=".pdf,.doc,.docx,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.gif,.webp"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadFile.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-surface text-muted disabled:opacity-50"
                >
                  {uploadFile.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  Upload File
                </button>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        {isAdmin && (
          <div className="flex items-center justify-end gap-3 p-5 border-t border-border/50">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-surface"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-brand text-white hover:bg-brand-hover disabled:opacity-50 transition-colors"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEdit ? "Save Changes" : "Create Template"}
            </button>
          </div>
        )}
        {!isAdmin && (
          <div className="flex items-center justify-end p-5 border-t border-border/50">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-surface"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
