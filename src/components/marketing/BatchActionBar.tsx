"use client";

import { useState } from "react";
import { X, Trash2, Calendar, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface BatchActionBarProps {
  selectedCount: number;
  onAction: (action: string, params: Record<string, unknown>) => void;
  onClear: () => void;
  campaigns: { id: string; name: string }[];
}

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "in_review", label: "In Review" },
  { value: "approved", label: "Approved" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
];

export function BatchActionBar({
  selectedCount,
  onAction,
  onClear,
  campaigns,
}: BatchActionBarProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white shadow-lg">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-6 py-3 overflow-x-auto">
        {/* Count */}
        <span className="shrink-0 rounded-full bg-brand px-3 py-1 text-sm font-semibold text-white">
          {selectedCount} selected
        </span>

        {/* Change Status */}
        <select
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) {
              onAction("change_status", { status: e.target.value });
              e.target.value = "";
            }
          }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        >
          <option value="" disabled>
            Change Status
          </option>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Assign Campaign */}
        <select
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) {
              onAction("assign_campaign", { campaignId: e.target.value });
              e.target.value = "";
            }
          }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        >
          <option value="" disabled>
            Assign Campaign
          </option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        {/* Reschedule */}
        <input
          type="date"
          onChange={(e) => {
            if (e.target.value) {
              onAction("reschedule", {
                scheduledDate: new Date(e.target.value).toISOString(),
              });
              e.target.value = "";
            }
          }}
          title="Reschedule"
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />

        {/* Duplicate to Centres */}
        <button
          onClick={() => onAction("duplicate_to_centres", {})}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-hover transition-colors"
        >
          <Copy className="h-4 w-4" />
          Duplicate to Centres
        </button>

        {/* Delete */}
        {showDeleteConfirm ? (
          <div className="inline-flex shrink-0 items-center gap-2">
            <span className="text-sm text-red-600 font-medium">Confirm?</span>
            <button
              onClick={() => {
                onAction("delete", {});
                setShowDeleteConfirm(false);
              }}
              className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
            >
              Delete
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Clear */}
        <button
          onClick={onClear}
          className="shrink-0 rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          title="Clear Selection"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
