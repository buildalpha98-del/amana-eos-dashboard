"use client";

import { EnrolmentFormData, Consents } from "../types";

interface Props {
  data: EnrolmentFormData;
  updateData: (d: Partial<EnrolmentFormData>) => void;
}

const CONSENT_ITEMS: { key: keyof Consents; label: string; description: string }[] = [
  {
    key: "firstAid",
    label: "First Aid",
    description: "I authorise the service to administer first aid to my child when necessary.",
  },
  {
    key: "medication",
    label: "Medication Administration",
    description:
      "I authorise the service to administer prescribed and non-prescribed medication as directed.",
  },
  {
    key: "ambulance",
    label: "Ambulance Transport",
    description:
      "I authorise ambulance transport in an emergency if parents/guardians cannot be reached.",
  },
  {
    key: "transport",
    label: "Transportation",
    description: "I consent to my child being transported to/from school by the service.",
  },
  {
    key: "excursions",
    label: "Excursions & Incursions",
    description: "I consent to my child participating in excursions and incursions organised by the service.",
  },
  {
    key: "photos",
    label: "Photographs & Video",
    description:
      "I consent to photographs/video of my child for display, social media, and marketing purposes.",
  },
  {
    key: "sunscreen",
    label: "Sunscreen Application",
    description: "I consent to the application of sunscreen to my child.",
  },
];

export function ConsentsStep({ data, updateData }: Props) {
  const setConsent = (key: keyof Consents, value: boolean) => {
    updateData({
      consents: { ...data.consents, [key]: value },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-2">Consents & Permissions</h3>
        <p className="text-sm text-muted mb-6">
          Please review each item and indicate your consent.
        </p>

        <div className="space-y-3">
          {CONSENT_ITEMS.map((item) => {
            const value = data.consents[item.key];
            return (
              <div
                key={item.key}
                className={`p-4 rounded-xl border transition-colors ${
                  value === true
                    ? "bg-green-50 border-green-200"
                    : value === false
                      ? "bg-red-50 border-red-200"
                      : "bg-surface/50 border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    <p className="text-xs text-muted mt-0.5">{item.description}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {[true, false].map((opt) => (
                      <button
                        key={String(opt)}
                        type="button"
                        onClick={() => setConsent(item.key, opt)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                          value === opt
                            ? opt
                              ? "bg-green-50 border-green-300 text-green-700"
                              : "bg-red-50 border-red-300 text-red-700"
                            : "bg-surface/50 border-border text-muted hover:bg-surface"
                        }`}
                      >
                        {opt ? "Yes" : "No"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
