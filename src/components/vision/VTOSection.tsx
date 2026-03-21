"use client";

import { useState } from "react";
import { useUpdateVTO } from "@/hooks/useVTO";
import { Pencil, Check, X } from "lucide-react";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { UnsavedBadge } from "@/components/ui/UnsavedBadge";

export function VTOSection({
  title,
  field,
  value,
  multiline,
  sectionLabels,
}: {
  title: string;
  field: string;
  value: string | null;
  multiline?: boolean;
  sectionLabels?: Record<string, string> | null;
}) {
  const updateVTO = useUpdateVTO();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const displayTitle = sectionLabels?.[field] || title;

  // Track unsaved changes while editing
  const hasDirtyContent = editing && draft !== (value || "");
  useUnsavedChanges(hasDirtyContent);

  const handleSave = () => {
    updateVTO.mutate({ [field]: draft });
    setEditing(false);
  };

  const handleSaveTitle = () => {
    const newLabel = titleDraft.trim();
    if (!newLabel) return;
    const updated = { ...(sectionLabels || {}), [field]: newLabel };
    updateVTO.mutate({ sectionLabels: updated });
    setEditingTitle(false);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/50">
        {editingTitle ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              className="flex-1 px-2 py-1 text-sm font-semibold border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveTitle();
                if (e.key === "Escape") setEditingTitle(false);
              }}
            />
            <button
              onClick={handleSaveTitle}
              className="p-1 text-emerald-600 hover:text-emerald-700"
              title="Save title"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setEditingTitle(false)}
              className="p-1 text-gray-400 hover:text-gray-600"
              title="Cancel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <h3
            className="text-sm font-semibold text-gray-700 cursor-pointer hover:text-brand transition-colors"
            onClick={() => {
              setTitleDraft(displayTitle);
              setEditingTitle(true);
            }}
            title="Click to rename"
          >
            {displayTitle}
          </h3>
        )}
        <div className="flex items-center gap-2">
          {hasDirtyContent && <UnsavedBadge />}
          {!editing && !editingTitle && (
            <button
              onClick={() => {
                setDraft(value || "");
                setEditing(true);
              }}
              className="p-1 text-gray-400 hover:text-brand transition-colors"
              title="Edit"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="px-5 py-4">
        {editing ? (
          <div className="space-y-2">
            {multiline ? (
              <textarea
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand resize-none"
              />
            ) : (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
              />
            )}
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={updateVTO.isPending}
                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 bg-brand text-white rounded-md hover:bg-brand-hover transition-colors"
              >
                <Check className="w-3 h-3" />
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 text-gray-500 hover:text-gray-700"
              >
                <X className="w-3 h-3" />
                Cancel
              </button>
            </div>
          </div>
        ) : value ? (
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
            {value}
          </p>
        ) : (
          <p className="text-sm text-gray-400 italic">Not set — click edit to add</p>
        )}
      </div>
    </div>
  );
}
