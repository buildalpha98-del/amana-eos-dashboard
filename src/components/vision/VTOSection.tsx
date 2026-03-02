"use client";

import { useState } from "react";
import { useUpdateVTO } from "@/hooks/useVTO";
import { Pencil, Check, X } from "lucide-react";

export function VTOSection({
  title,
  field,
  value,
  multiline,
}: {
  title: string;
  field: string;
  value: string | null;
  multiline?: boolean;
}) {
  const updateVTO = useUpdateVTO();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");

  const handleSave = () => {
    updateVTO.mutate({ [field]: draft });
    setEditing(false);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/50">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        {!editing && (
          <button
            onClick={() => {
              setDraft(value || "");
              setEditing(true);
            }}
            className="p-1 text-gray-400 hover:text-[#1B4D3E] transition-colors"
            title="Edit"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
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
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B4D3E] resize-none"
              />
            ) : (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B4D3E]"
              />
            )}
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={updateVTO.isPending}
                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 bg-[#1B4D3E] text-white rounded-md hover:bg-[#164032] transition-colors"
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
