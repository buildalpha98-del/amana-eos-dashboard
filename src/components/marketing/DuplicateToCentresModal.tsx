"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ServiceMultiSelect } from "./ServiceMultiSelect";
import { useEscapeClose } from "@/hooks/useEscapeClose";

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
  useEscapeClose(onClose);
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
              aria-label="Close"
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
              <Button type="button" variant="secondary" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={selectedServiceIds.length === 0}
                loading={isLoading}
              >
                {isLoading ? "Duplicating..." : "Duplicate"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
