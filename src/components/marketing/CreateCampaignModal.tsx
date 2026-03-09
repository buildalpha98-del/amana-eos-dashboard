"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useCreateCampaign } from "@/hooks/useMarketing";
import type { MarketingPlatform, MarketingCampaignType } from "@prisma/client";
import { ServiceMultiSelect } from "./ServiceMultiSelect";

const CAMPAIGN_TYPES: MarketingCampaignType[] = [
  "campaign",
  "event",
  "launch",
  "promotion",
  "awareness",
  "partnership",
  "activation",
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
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [budget, setBudget] = useState("");
  const [location, setLocation] = useState("");
  const [deliverables, setDeliverables] = useState("");
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
    setServiceIds([]);
    setBudget("");
    setLocation("");
    setDeliverables("");
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
        ...(serviceIds.length > 0 && { serviceIds }),
        ...(budget && { budget: parseFloat(budget) }),
        ...(location.trim() && { location: location.trim() }),
        ...(deliverables.trim() && { deliverables: deliverables.trim() }),
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
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
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
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
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
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
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
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
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
                          ? "border-brand bg-brand/10 text-brand"
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

              {/* Activation / Event Fields */}
              {(type === "activation" || type === "event") && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Budget ($)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={budget}
                        onChange={(e) => setBudget(e.target.value)}
                        placeholder="0.00"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Location
                      </label>
                      <input
                        type="text"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder="Venue or address"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Deliverables
                    </label>
                    <textarea
                      value={deliverables}
                      onChange={(e) => setDeliverables(e.target.value)}
                      rows={2}
                      placeholder="Key deliverables for this activation..."
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                    />
                  </div>
                </>
              )}

              {/* Target Centres */}
              <div>
                <ServiceMultiSelect
                  selectedIds={serviceIds}
                  onChange={setServiceIds}
                  label="Target Centres"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Leave empty for all centres
                </p>
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
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
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
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
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
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
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
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
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
