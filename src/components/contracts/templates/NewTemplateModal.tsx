"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useCreateContractTemplate, type ContractTemplateData } from "@/hooks/useContractTemplates";

interface Props {
  onClose: () => void;
}

/**
 * Single-field modal that creates a draft template and routes to its editor.
 */
export function NewTemplateModal({ onClose }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const create = useCreateContractTemplate();

  const canSubmit = name.trim().length > 0 && !create.isPending;

  function handleSubmit() {
    if (!canSubmit) return;
    create.mutate(
      {
        name: name.trim(),
        contentJson: { type: "doc", content: [] },
        manualFields: [],
      },
      {
        onSuccess: (data: ContractTemplateData) => {
          onClose();
          router.push(`/contracts/templates/${data.id}`);
        },
      }
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-foreground">New Contract Template</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-muted" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4">
          <div>
            <label
              htmlFor="template-name"
              className="block text-sm font-medium text-foreground mb-1.5"
            >
              Template Name
            </label>
            <input
              id="template-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
              placeholder="e.g. Permanent Full-Time Educator"
              autoFocus
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-border/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-surface rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-4 py-2 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {create.isPending ? "Creating..." : "Create Template"}
          </button>
        </div>
      </div>
    </div>
  );
}
