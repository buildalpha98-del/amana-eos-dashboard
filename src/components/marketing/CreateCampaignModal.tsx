"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useCreateCampaign } from "@/hooks/useMarketing";
import type { MarketingPlatform, MarketingCampaignType } from "@prisma/client";

const CAMPAIGN_TYPES: MarketingCampaignType[] = [
  "campaign",
  "event",
  "launch",
  "promotion",
  "awareness",
  "partnership",
];

const ALL_PLATFORMS: MarketingPlatform[] = [
  "facebook",
  "instagram",
  "linkedin",
  "email",
  "newsletter",
  "website",
  "flyer",
];

export function CreateCampaignModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const createCampaign = useCreateCampaign();

  const [name, setName] = useState("");
  const [type, setType] = useState<MarketingCampaignType>("campaign");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [platforms, setPlatforms] = useState<MarketingPlatform[]>([]);
  const [goal, setGoal] = useState("");
  const [notes, setNotes] = useState("");
  const [designLink, setDesignLink] = useState("");
  const [error, setError] = useState("");

  const resetForm = () => {
    setName("");
    setType("campaign");
    setStartDate("");
    setEndDate("");
    setPlatforms([]);
    setGoal("");
    setNotes("");
    setDesignLink("");
    setError("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const togglePlatform = (platform: MarketingPlatform) => {
    setPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Campaign name is required.");
      return;
    }

    createCampaign.mutate(
      {
        name: name.trim(),
        type,
        ...(startDate && { startDate: new Date(startDate).toISOString() }),
        ...(endDate && { endDate: new Date(endDate).toISOString() }),
        ...(platforms.length > 0 && { platforms }),
        ...(goal.trim() && { goal: goal.trim() }),
        ...(notes.trim() && { notes: notes.trim() }),
        ...(designLink.trim() && { designLink: designLink.trim() }),
      },
      {
        onSuccess: () => {
          handleClose();
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : "Failed to create campaign.");
        },
      }
    );
  };

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/30"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="w-full max-w-lg rounded-xl bg-white shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">
              New Campaign
            </h2>
            <button
              onClick={handleClose}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="max-h-[70vh] overflow-y-auto px-6 py-5">
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Campaign name"
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
                />
              </div>

              {/* Type */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Type
                </label>
                <select
                  value={type}
                  onChange={(e) =>
                    setType(e.target.value as MarketingCampaignType)
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
                >
                  {CAMPAIGN_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
                  />
                </div>
              </div>

              {/* Platforms */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Platforms
                </label>
                <div className="flex flex-wrap gap-2">
                  {ALL_PLATFORMS.map((p) => (
                    <label
                      key={p}
                      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        platforms.includes(p)
                          ? "border-[#004E64] bg-[#004E64]/10 text-[#004E64]"
                          : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={platforms.includes(p)}
                        onChange={() => togglePlatform(p)}
                        className="sr-only"
                      />
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </label>
                  ))}
                </div>
              </div>

              {/* Goal */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Goal
                </label>
                <textarea
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  rows={2}
                  placeholder="What is the campaign goal?"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Additional notes..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
                />
              </div>

              {/* Design Link */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Design Link
                </label>
                <input
                  type="url"
                  value={designLink}
                  onChange={(e) => setDesignLink(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
                />
              </div>

              {/* Error */}
              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                  {error}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createCampaign.isPending}
                className="rounded-lg bg-[#004E64] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#003d4f] disabled:opacity-50"
              >
                {createCampaign.isPending ? "Creating..." : "Create Campaign"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
