"use client";

import { useState } from "react";
import { useUpdateVTO } from "@/hooks/useVTO";
import { Pencil, Check, X, Plus, Trash2, Star } from "lucide-react";

export function CoreValuesCard({ values }: { values: string[] }) {
  const updateVTO = useUpdateVTO();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>(values);
  const [newValue, setNewValue] = useState("");

  const handleSave = () => {
    updateVTO.mutate({ coreValues: draft.filter((v) => v.trim()) });
    setEditing(false);
  };

  const addValue = () => {
    if (newValue.trim()) {
      setDraft([...draft, newValue.trim()]);
      setNewValue("");
    }
  };

  const removeValue = (idx: number) => {
    setDraft(draft.filter((_, i) => i !== idx));
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/50">
        <h3 className="text-sm font-semibold text-gray-700">Core Values</h3>
        {!editing && (
          <button
            onClick={() => {
              setDraft([...values]);
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
          <div className="space-y-3">
            <div className="space-y-2">
              {draft.map((val, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[#1B4D3E] w-5 text-center">
                    {idx + 1}
                  </span>
                  <input
                    value={val}
                    onChange={(e) => {
                      const next = [...draft];
                      next[idx] = e.target.value;
                      setDraft(next);
                    }}
                    className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B4D3E]"
                  />
                  <button
                    onClick={() => removeValue(idx)}
                    className="p-1 text-gray-300 hover:text-red-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addValue();
                  }
                }}
                placeholder="Add a core value..."
                className="flex-1 px-3 py-1.5 text-sm border border-dashed border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B4D3E]"
              />
              <button
                onClick={addValue}
                type="button"
                className="p-1.5 text-[#1B4D3E] hover:bg-[#1B4D3E]/5 rounded-md"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={updateVTO.isPending}
                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 bg-[#1B4D3E] text-white rounded-md hover:bg-[#164032]"
              >
                <Check className="w-3 h-3" />
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 text-gray-500"
              >
                <X className="w-3 h-3" />
                Cancel
              </button>
            </div>
          </div>
        ) : values.length > 0 ? (
          <div className="space-y-2.5">
            {values.map((val, idx) => (
              <div key={idx} className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#1B4D3E]/10 flex items-center justify-center mt-0.5">
                  <Star className="w-3 h-3 text-[#1B4D3E]" />
                </div>
                <span className="text-sm text-gray-700 font-medium">{val}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">No core values set</p>
        )}
      </div>
    </div>
  );
}
