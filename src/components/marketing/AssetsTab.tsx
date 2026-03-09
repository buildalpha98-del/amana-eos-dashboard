"use client";

import { useState, useEffect } from "react";
import {
  Image,
  Video,
  FileText,
  Layout,
  Palette,
  Trash2,
  Plus,
  Search,
  X,
  ExternalLink,
  Loader2,
  FolderOpen,
} from "lucide-react";
import {
  useAssets,
  useCreateAsset,
  useDeleteAsset,
} from "@/hooks/useMarketing";

const ASSET_TYPES = ["all", "image", "video", "document", "template", "graphic"] as const;

const typeIcons: Record<string, React.ElementType> = {
  image: Image,
  video: Video,
  document: FileText,
  template: Layout,
  graphic: Palette,
};

const typeBadgeColors: Record<string, string> = {
  image: "bg-blue-100 text-blue-700",
  video: "bg-purple-100 text-purple-700",
  document: "bg-amber-100 text-amber-700",
  template: "bg-teal-100 text-teal-700",
  graphic: "bg-pink-100 text-pink-700",
};

export function AssetsTab() {
  const [typeFilter, setTypeFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data: assets, isLoading } = useAssets({
    type: typeFilter || undefined,
    search: debouncedSearch || undefined,
  });
  const createAsset = useCreateAsset();
  const deleteAsset = useDeleteAsset();

  // Create modal state
  const [form, setForm] = useState({
    name: "",
    type: "image",
    url: "",
    tags: "",
  });

  function handleCreate() {
    if (!form.name.trim() || !form.url.trim()) return;
    const tagsArray = form.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    createAsset.mutate(
      { name: form.name, type: form.type, url: form.url, tags: tagsArray },
      {
        onSuccess: () => {
          setForm({ name: "", type: "image", url: "", tags: "" });
          setShowCreate(false);
        },
      }
    );
  }

  function getIcon(type: string) {
    const Icon = typeIcons[type.toLowerCase()] ?? FileText;
    return <Icon className="h-5 w-5" />;
  }

  return (
    <div className="space-y-6">
      {/* ── Filter Bar ───────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-wrap gap-3 items-center">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
          >
            {ASSET_TYPES.map((t) => (
              <option key={t} value={t === "all" ? "" : t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search assets..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 w-56"
            />
          </div>
        </div>

        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Asset
        </button>
      </div>

      {/* ── Loading State ────────────────────────────── */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-brand" />
        </div>
      )}

      {/* ── Empty State ──────────────────────────────── */}
      {!isLoading && (!assets || assets.length === 0) && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <FolderOpen className="h-12 w-12 mb-3" />
          <p className="text-lg font-medium">No assets found</p>
          <p className="text-sm mt-1">
            Upload your first asset to get started.
          </p>
        </div>
      )}

      {/* ── Card Grid ────────────────────────────────── */}
      {!isLoading && assets && assets.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {assets.map((asset) => {
            const badgeColor =
              typeBadgeColors[asset.type.toLowerCase()] ??
              "bg-gray-100 text-gray-700";
            return (
              <div
                key={asset.id}
                className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3 hover:shadow-md transition-shadow"
              >
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-gray-50 text-brand">
                      {getIcon(asset.type)}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 text-sm leading-tight">
                        {asset.name}
                      </h3>
                      <span
                        className={`inline-flex mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${badgeColor}`}
                      >
                        {asset.type.charAt(0).toUpperCase() +
                          asset.type.slice(1)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm("Delete this asset?"))
                        deleteAsset.mutate(asset.id);
                    }}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Tags */}
                {asset.tags && asset.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {asset.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex px-2 py-0.5 rounded-md bg-accent/20 text-brand text-xs font-medium"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* URL */}
                <a
                  href={asset.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-brand hover:underline truncate mt-auto"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{asset.url}</span>
                </a>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create Modal ─────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                New Asset
              </h2>
              <button
                onClick={() => setShowCreate(false)}
                className="p-1 rounded-lg hover:bg-gray-100"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                  placeholder="Asset name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type
                </label>
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, type: e.target.value }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                >
                  {ASSET_TYPES.filter((t) => t !== "all").map((t) => (
                    <option key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  URL <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  value={form.url}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, url: e.target.value }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                  placeholder="https://..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tags
                </label>
                <input
                  type="text"
                  value={form.tags}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, tags: e.target.value }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                  placeholder="tag1, tag2, tag3"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Comma-separated list
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={
                  !form.name.trim() ||
                  !form.url.trim() ||
                  createAsset.isPending
                }
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-brand hover:bg-brand/90 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {createAsset.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Create Asset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
