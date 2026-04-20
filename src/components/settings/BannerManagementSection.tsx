"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Megaphone,
  Plus,
  X,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Info,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  PartyPopper,
  ExternalLink,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/useToast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface Banner {
  id: string;
  title: string;
  body: string;
  type: string;
  linkUrl: string | null;
  linkLabel: string | null;
  active: boolean;
  dismissible: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  _count?: { dismissals: number };
}

const BANNER_TYPES = [
  { value: "info", label: "Info", icon: Info, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
  { value: "success", label: "Success", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
  { value: "warning", label: "Warning", icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
  { value: "feature", label: "Feature", icon: Sparkles, color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-200" },
  { value: "celebration", label: "Celebration", icon: PartyPopper, color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-300" },
] as const;

function getTypeConfig(type: string) {
  return BANNER_TYPES.find((t) => t.value === type) || BANNER_TYPES[0];
}

function getBannerStatus(banner: Banner): { label: string; color: string } {
  if (!banner.active) return { label: "Inactive", color: "bg-surface text-muted" };
  const now = new Date();
  if (banner.startsAt && new Date(banner.startsAt) > now) return { label: "Scheduled", color: "bg-blue-100 text-blue-700" };
  if (banner.expiresAt && new Date(banner.expiresAt) <= now) return { label: "Expired", color: "bg-red-100 text-red-700" };
  return { label: "Active", color: "bg-emerald-100 text-emerald-700" };
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toLocalDatetimeValue(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

interface BannerFormData {
  title: string;
  body: string;
  type: string;
  linkUrl: string;
  linkLabel: string;
  dismissible: boolean;
  startsAt: string;
  expiresAt: string;
}

const EMPTY_FORM: BannerFormData = {
  title: "",
  body: "",
  type: "info",
  linkUrl: "",
  linkLabel: "",
  dismissible: true,
  startsAt: "",
  expiresAt: "",
};

function BannerFormModal({
  open,
  onClose,
  editBanner,
}: {
  open: boolean;
  onClose: () => void;
  editBanner?: Banner | null;
}) {
  const queryClient = useQueryClient();
  const isEditing = !!editBanner;

  const [form, setForm] = useState<BannerFormData>(() => {
    if (editBanner) {
      return {
        title: editBanner.title,
        body: editBanner.body,
        type: editBanner.type,
        linkUrl: editBanner.linkUrl || "",
        linkLabel: editBanner.linkLabel || "",
        dismissible: editBanner.dismissible,
        startsAt: toLocalDatetimeValue(editBanner.startsAt),
        expiresAt: toLocalDatetimeValue(editBanner.expiresAt),
      };
    }
    return { ...EMPTY_FORM };
  });

  const [showPreview, setShowPreview] = useState(false);

  const saveMutation = useMutation({
    mutationFn: async (data: BannerFormData) => {
      const url = isEditing
        ? `/api/system-banners/${editBanner!.id}`
        : "/api/system-banners";
      const method = isEditing ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: data.title,
          body: data.body,
          type: data.type,
          linkUrl: data.linkUrl || null,
          linkLabel: data.linkLabel || null,
          dismissible: data.dismissible,
          startsAt: data.startsAt ? new Date(data.startsAt).toISOString() : null,
          expiresAt: data.expiresAt ? new Date(data.expiresAt).toISOString() : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save banner");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-banners"] });
      queryClient.invalidateQueries({ queryKey: ["system-banners"] });
      toast({ description: isEditing ? "Banner updated" : "Banner created" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ description: err.message });
    },
  });

  if (!open) return null;

  const typeConfig = getTypeConfig(form.type);
  const TypeIcon = typeConfig.icon;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 pb-4 border-b border-border/50">
          <h3 className="text-lg font-semibold text-foreground">
            {isEditing ? "Edit Banner" : "Create Banner"}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Welcome to the Dashboard!"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              Message <span className="text-red-500">*</span>
            </label>
            <textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="Banner message content..."
              rows={3}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:ring-1 focus:ring-brand resize-none"
            />
          </div>

          {/* Type selector */}
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1.5">
              Type
            </label>
            <div className="flex flex-wrap gap-2">
              {BANNER_TYPES.map((t) => {
                const BtnIcon = t.icon;
                const selected = form.type === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setForm({ ...form, type: t.value })}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors",
                      selected
                        ? `${t.bg} ${t.border} ${t.color}`
                        : "bg-card border-border text-muted hover:bg-surface",
                    )}
                  >
                    <BtnIcon className="w-3.5 h-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Link */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                Link URL
              </label>
              <input
                type="text"
                value={form.linkUrl}
                onChange={(e) => setForm({ ...form, linkUrl: e.target.value })}
                placeholder="/getting-started"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                Link Label
              </label>
              <input
                type="text"
                value={form.linkLabel}
                onChange={(e) => setForm({ ...form, linkLabel: e.target.value })}
                placeholder="Get Started"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </div>
          </div>

          {/* Schedule */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                <Calendar className="w-3.5 h-3.5 inline mr-1" />
                Starts At
              </label>
              <input
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                <Calendar className="w-3.5 h-3.5 inline mr-1" />
                Expires At
              </label>
              <input
                type="datetime-local"
                value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </div>
          </div>

          {/* Dismissible toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.dismissible}
              onChange={(e) => setForm({ ...form, dismissible: e.target.checked })}
              className="rounded border-border text-brand focus:ring-brand"
            />
            <span className="text-sm text-foreground/80">Users can dismiss this banner</span>
          </label>

          {/* Preview toggle */}
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className="text-sm text-brand font-medium hover:underline"
          >
            {showPreview ? "Hide Preview" : "Show Preview"}
          </button>

          {/* Preview */}
          {showPreview && form.title && (
            <div
              className={cn(
                "rounded-lg border px-4 py-3",
                typeConfig.bg,
                typeConfig.border,
              )}
            >
              <div className="flex items-start gap-3">
                <TypeIcon className={cn("mt-0.5 h-5 w-5 flex-shrink-0", typeConfig.color)} />
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm font-semibold", typeConfig.color)}>
                    {form.title}
                  </p>
                  <p className={cn("mt-0.5 text-sm", typeConfig.color, "opacity-80")}>
                    {form.body}
                  </p>
                  {form.linkUrl && (
                    <span
                      className={cn(
                        "mt-1 inline-flex items-center gap-1 text-sm font-medium underline underline-offset-2",
                        typeConfig.color,
                      )}
                    >
                      {form.linkLabel || "Learn more"}
                      {!form.linkUrl.startsWith("/") && (
                        <ExternalLink className="h-3.5 w-3.5" />
                      )}
                    </span>
                  )}
                </div>
                {form.dismissible && (
                  <div className={cn("flex-shrink-0 rounded-md p-1", typeConfig.color)}>
                    <X className="h-4 w-4" />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-6 pt-4 border-t border-border/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-foreground/80 rounded-lg border border-border hover:bg-surface"
          >
            Cancel
          </button>
          <button
            onClick={() => saveMutation.mutate(form)}
            disabled={!form.title.trim() || !form.body.trim() || saveMutation.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saveMutation.isPending ? "Saving..." : isEditing ? "Update Banner" : "Create Banner"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function BannerManagementSection() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editBanner, setEditBanner] = useState<Banner | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ banners: Banner[] }>({
    queryKey: ["admin-banners"],
    queryFn: async () => {
      const res = await fetch("/api/system-banners?all=true");
      if (!res.ok) throw new Error("Failed to fetch banners");
      return res.json();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const res = await fetch(`/api/system-banners/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      if (!res.ok) throw new Error("Failed to update banner");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-banners"] });
      queryClient.invalidateQueries({ queryKey: ["system-banners"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/system-banners/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete banner");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-banners"] });
      queryClient.invalidateQueries({ queryKey: ["system-banners"] });
      toast({ description: "Banner deleted" });
      setDeleteId(null);
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });

  const banners = data?.banners ?? [];

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-muted" />
          <h3 className="text-lg font-semibold text-foreground">
            System Banners
          </h3>
          <span className="text-xs text-muted bg-surface px-2 py-0.5 rounded-full">
            {banners.length}
          </span>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Banner
        </button>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-muted text-sm">Loading banners...</div>
      ) : banners.length === 0 ? (
        <div className="py-8 text-center">
          <Megaphone className="w-8 h-8 text-muted/50 mx-auto mb-2" />
          <p className="text-sm text-muted">No banners yet. Create one to announce something to your team.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {banners.map((banner) => {
            const typeConfig = getTypeConfig(banner.type);
            const TypeIcon = typeConfig.icon;
            const status = getBannerStatus(banner);

            return (
              <div
                key={banner.id}
                className={cn(
                  "rounded-lg border p-4 transition-colors",
                  banner.active ? "border-border bg-card" : "border-border/50 bg-surface/50 opacity-60",
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn("p-1.5 rounded-md", typeConfig.bg)}>
                    <TypeIcon className={cn("w-4 h-4", typeConfig.color)} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {banner.title}
                      </p>
                      <span
                        className={cn(
                          "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                          status.color,
                        )}
                      >
                        {status.label}
                      </span>
                      {!banner.dismissible && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-surface text-muted">
                          Pinned
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted mt-0.5 line-clamp-1">
                      {banner.body}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted">
                      {banner.startsAt && (
                        <span>Starts: {formatDate(banner.startsAt)}</span>
                      )}
                      {banner.expiresAt && (
                        <span>Expires: {formatDate(banner.expiresAt)}</span>
                      )}
                      {banner._count && (
                        <span>{banner._count.dismissals} dismissed</span>
                      )}
                      <span>Created: {formatDate(banner.createdAt)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => toggleMutation.mutate({ id: banner.id, active: !banner.active })}
                      className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface transition-colors"
                      title={banner.active ? "Deactivate" : "Activate"}
                    >
                      {banner.active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => setEditBanner(banner)}
                      className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface transition-colors"
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteId(banner.id)}
                      className="p-1.5 rounded-md text-muted hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      <BannerFormModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
      />

      {/* Edit modal */}
      {editBanner && (
        <BannerFormModal
          key={editBanner.id}
          open={!!editBanner}
          onClose={() => setEditBanner(null)}
          editBanner={editBanner}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title="Delete Banner"
        description="Are you sure you want to permanently delete this banner? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
