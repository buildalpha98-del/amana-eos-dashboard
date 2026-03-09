"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { useSaveScenario } from "@/hooks/useScenarios";
import type { ScenarioInputs, ScenarioOutputs } from "@/lib/scenario-engine";

interface Props {
  open: boolean;
  onClose: () => void;
  inputs: ScenarioInputs;
  outputs: ScenarioOutputs;
}

export function SaveScenarioDialog({ open, onClose, inputs, outputs }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const save = useSaveScenario();

  if (!open) return null;

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    save.mutate(
      { name: name.trim(), description: description.trim() || undefined, inputs, outputs },
      {
        onSuccess: () => {
          setName("");
          setDescription("");
          onClose();
        },
      },
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="w-full max-w-md rounded-xl bg-white shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Save Scenario</h2>
            <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
              <X className="h-5 w-5" />
            </button>
          </div>
          <form onSubmit={handleSave} className="px-6 py-5 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Q3 Growth Scenario"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Optional notes about this scenario..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={save.isPending || !name.trim()}
                className="flex-1 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
              >
                {save.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Save"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
