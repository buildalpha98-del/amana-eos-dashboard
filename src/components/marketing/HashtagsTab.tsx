"use client";

import { useState } from "react";
import {
  Plus,
  Trash2,
  X,
  Loader2,
  Hash,
  Copy,
  Check,
} from "lucide-react";
import {
  useHashtagSets,
  useCreateHashtagSet,
  useDeleteHashtagSet,
} from "@/hooks/useMarketing";

const CATEGORIES = ["All", "Brand", "Campaign", "Platform", "Trending"] as const;

const categoryBadgeColors: Record<string, string> = {
  brand: "bg-purple-100 text-purple-700",
  campaign: "bg-blue-100 text-blue-700",
  platform: "bg-green-100 text-green-700",
  trending: "bg-orange-100 text-orange-700",
};

export function HashtagsTab() {
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: hashtagSets, isLoading } = useHashtagSets(
    categoryFilter || undefined
  );
  const createHashtagSet = useCreateHashtagSet();
  const deleteHashtagSet = useDeleteHashtagSet();

  // Create modal state
  const [form, setForm] = useState({
    name: "",
    category: "brand",
    tags: "",
  });

  function handleCreate() {
    if (!form.name.trim() || !form.tags.trim()) return;
    createHashtagSet.mutate(
      { name: form.name, category: form.category, tags: form.tags },
      {
        onSuccess: () => {
          setForm({ name: "", category: "brand", tags: "" });
          setShowCreate(false);
        },
      }
    );
  }

  function handleCopy(id: string, tags: string) {
    navigator.clipboard.writeText(tags).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  return (
    <div className="space-y-6">
      {/* ── Filter Bar ───────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => {
            const value = cat === "All" ? "" : cat.toLowerCase();
            const isActive = categoryFilter === value;
            return (
              <button
                key={cat}
                onClick={() => setCategoryFilter(value)}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand text-white"
                    : "bg-card border border-border text-muted hover:bg-surface"
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Set
        </button>
      </div>

      {/* ── Loading State ────────────────────────────── */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-brand" />
        </div>
      )}

      {/* ── Empty State ──────────────────────────────── */}
      {!isLoading && (!hashtagSets || hashtagSets.length === 0) && (
        <div className="flex flex-col items-center justify-center py-20 text-muted">
          <Hash className="h-12 w-12 mb-3" />
          <p className="text-lg font-medium">No hashtag sets found</p>
          <p className="text-sm mt-1">
            Create a collection of hashtags to reuse across posts.
          </p>
        </div>
      )}

      {/* ── Card Grid ────────────────────────────────── */}
      {!isLoading && hashtagSets && hashtagSets.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {hashtagSets.map((set) => {
            const badgeColor =
              categoryBadgeColors[set.category.toLowerCase()] ??
              "bg-surface text-foreground/80";
            const isCopied = copiedId === set.id;

            return (
              <div
                key={set.id}
                className="bg-card rounded-xl border border-border p-5 flex flex-col gap-3 hover:shadow-md transition-shadow"
              >
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="space-y-1.5">
                    <h3 className="font-semibold text-foreground text-sm leading-tight">
                      {set.name}
                    </h3>
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${badgeColor}`}
                    >
                      {set.category.charAt(0).toUpperCase() +
                        set.category.slice(1)}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm("Delete this hashtag set?"))
                        deleteHashtagSet.mutate(set.id);
                    }}
                    className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Tags content */}
                <p className="text-sm text-muted leading-relaxed whitespace-pre-wrap">
                  {set.tags}
                </p>

                {/* Copy button */}
                <div className="flex items-center justify-end mt-auto pt-2 border-t border-border/50">
                  <button
                    onClick={() => handleCopy(set.id, set.tags)}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      isCopied
                        ? "bg-green-100 text-green-700"
                        : "bg-surface text-muted hover:bg-border"
                    }`}
                  >
                    {isCopied ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copy All
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create Modal ─────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                New Hashtag Set
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
                  placeholder="Set name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  Category <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.category}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, category: e.target.value }))
                  }
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                >
                  {CATEGORIES.filter((c) => c !== "All").map((c) => (
                    <option key={c} value={c.toLowerCase()}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  Tags <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={4}
                  value={form.tags}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, tags: e.target.value }))
                  }
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
                  placeholder="Enter hashtags, one per line or comma-separated"
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
                  !form.tags.trim() ||
                  createHashtagSet.isPending
                }
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-brand hover:bg-brand/90 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {createHashtagSet.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Create Set
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
