"use client";

import { useState } from "react";
import {
  Plus,
  Trash2,
  X,
  Loader2,
  FileStack,
  Hash,
  Play,
} from "lucide-react";
import {
  useTemplates,
  useCreateTemplate,
  useDeleteTemplate,
  useUseTemplate,
} from "@/hooks/useMarketing";
import { PlatformBadge } from "./PlatformBadge";

const PLATFORMS = [
  "all",
  "facebook",
  "instagram",
  "linkedin",
  "email",
  "newsletter",
  "website",
  "flyer",
] as const;

export function TemplatesTab() {
  const [platformFilter, setPlatformFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const { data: templates, isLoading } = useTemplates(
    platformFilter || undefined
  );
  const createTemplate = useCreateTemplate();
  const deleteTemplate = useDeleteTemplate();
  const useTemplate = useUseTemplate();

  // Create modal state
  const [form, setForm] = useState({
    name: "",
    platform: "facebook",
    pillar: "",
    content: "",
    notes: "",
    hashtags: "",
  });

  function handleCreate() {
    if (!form.name.trim() || !form.content.trim()) return;
    createTemplate.mutate(
      {
        name: form.name,
        platform: form.platform,
        pillar: form.pillar || undefined,
        content: form.content,
        notes: form.notes || undefined,
        hashtags: form.hashtags || undefined,
      },
      {
        onSuccess: () => {
          setForm({
            name: "",
            platform: "facebook",
            pillar: "",
            content: "",
            notes: "",
            hashtags: "",
          });
          setShowCreate(false);
        },
      }
    );
  }

  function handleUseTemplate(id: string) {
    useTemplate.mutate(id);
  }

  return (
    <div className="space-y-6">
      {/* ── Filter Bar ───────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <select
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value)}
          className="rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
        >
          {PLATFORMS.map((p) => (
            <option key={p} value={p === "all" ? "" : p}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </option>
          ))}
        </select>

        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Template
        </button>
      </div>

      {/* ── Loading State ────────────────────────────── */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-brand" />
        </div>
      )}

      {/* ── Empty State ──────────────────────────────── */}
      {!isLoading && (!templates || templates.length === 0) && (
        <div className="flex flex-col items-center justify-center py-20 text-muted">
          <FileStack className="h-12 w-12 mb-3" />
          <p className="text-lg font-medium">No templates found</p>
          <p className="text-sm mt-1">
            Create a reusable template to speed up your workflow.
          </p>
        </div>
      )}

      {/* ── Card Grid ────────────────────────────────── */}
      {!isLoading && templates && templates.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className="bg-card rounded-xl border border-border p-5 flex flex-col gap-3 hover:shadow-md transition-shadow"
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="space-y-1.5">
                  <h3 className="font-semibold text-foreground text-sm leading-tight">
                    {tpl.name}
                  </h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    <PlatformBadge platform={tpl.platform} />
                    {tpl.pillar && (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-accent/20 text-brand">
                        {tpl.pillar}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (confirm("Delete this template?"))
                      deleteTemplate.mutate(tpl.id);
                  }}
                  className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {/* Content preview */}
              <p className="text-sm text-muted leading-relaxed">
                {tpl.content.length > 100
                  ? tpl.content.slice(0, 100) + "..."
                  : tpl.content}
              </p>

              {/* Hashtags */}
              {tpl.hashtags && (
                <div className="flex items-start gap-1.5 text-xs text-muted">
                  <Hash className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span className="line-clamp-2">{tpl.hashtags}</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 mt-auto pt-2 border-t border-border/50">
                <button
                  onClick={() => handleUseTemplate(tpl.id)}
                  disabled={useTemplate.isPending}
                  className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand/90 disabled:opacity-50 transition-colors"
                >
                  {useTemplate.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  Use Template
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Create Modal ─────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                New Template
              </h2>
              <button
                onClick={() => setShowCreate(false)}
                className="p-1 rounded-lg hover:bg-surface"
              >
                <X className="h-5 w-5 text-muted" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                  placeholder="Template name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  Platform <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.platform}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, platform: e.target.value }))
                  }
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                >
                  {PLATFORMS.filter((p) => p !== "all").map((p) => (
                    <option key={p} value={p}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  Pillar
                </label>
                <input
                  type="text"
                  value={form.pillar}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, pillar: e.target.value }))
                  }
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                  placeholder="e.g. Education, Community"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  Content <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={4}
                  value={form.content}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, content: e.target.value }))
                  }
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
                  placeholder="Template content..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
                  placeholder="Internal notes..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  Hashtags
                </label>
                <input
                  type="text"
                  value={form.hashtags}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, hashtags: e.target.value }))
                  }
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                  placeholder="#amana #oshc #childcare"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-muted hover:bg-surface transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={
                  !form.name.trim() ||
                  !form.content.trim() ||
                  createTemplate.isPending
                }
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-brand hover:bg-brand/90 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {createTemplate.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Create Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
