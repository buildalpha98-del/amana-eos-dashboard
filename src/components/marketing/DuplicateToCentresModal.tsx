"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { ServiceMultiSelect } from "./ServiceMultiSelect";

interface DuplicateToCentresModalProps {
  postIds: string[];
  onClose: () => void;
  onDuplicate: (serviceIds: string[]) => void;
  isLoading?: boolean;
}

export function DuplicateToCentresModal({
  postIds,
  onClose,
  onDuplicate,
  isLoading,
}: DuplicateToCentresModalProps) {
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedServiceIds.length === 0) return;
    onDuplicate(selectedServiceIds);
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/30"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="w-full max-w-md rounded-xl bg-card shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold text-foreground">
              Duplicate to Centres
            </h2>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-muted hover:bg-surface hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            <p className="text-sm text-muted">
              Duplicate{" "}
              <span className="font-semibold text-foreground">
                {postIds.length}
              </span>{" "}
              post{postIds.length === 1 ? "" : "s"} to selected centres.
            </p>

            <ServiceMultiSelect
              selectedIds={selectedServiceIds}
              onChange={setSelectedServiceIds}
              label="Target Centres"
            />

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-surface transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={selectedServiceIds.length === 0 || isLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover transition-colors disabled:opacity-50"
              >
                {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                {isLoading ? "Duplicating..." : "Duplicate"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
