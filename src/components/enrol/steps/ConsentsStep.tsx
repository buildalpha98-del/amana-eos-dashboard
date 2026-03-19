"use client";

import { useState } from "react";
import { Upload, Trash2 } from "lucide-react";
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
  const [uploading, setUploading] = useState(false);

  const setConsent = (key: keyof Consents, value: boolean) => {
    updateData({
      consents: { ...data.consents, [key]: value },
    });
  };

  const handleCourtOrderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        const res = await fetch("/api/upload/enrolment-file", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file: base64, filename: file.name, contentType: file.type }),
        });
        if (res.ok) {
          const { fileUrl, fileName } = await res.json();
          updateData({
            courtOrderFiles: [...data.courtOrderFiles, { filename: fileName, url: fileUrl }],
          });
        }
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-2">Consents & Permissions</h3>
        <p className="text-sm text-gray-500 mb-6">
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
                      : "bg-gray-50 border-gray-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800">{item.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
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
                            : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
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

      <hr className="border-gray-200" />

      <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-2">Court Orders</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Are there any court orders or parenting orders related to this child?
            </label>
            <div className="flex gap-3">
              {[true, false].map((opt) => (
                <button
                  key={String(opt)}
                  type="button"
                  onClick={() => updateData({ courtOrders: opt })}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                    data.courtOrders === opt
                      ? opt
                        ? "bg-red-50 border-red-300 text-red-700"
                        : "bg-green-50 border-green-300 text-green-700"
                      : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  {opt ? "Yes" : "No"}
                </button>
              ))}
            </div>
          </div>

          {data.courtOrders && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm text-amber-800 mb-3 font-medium">
                Please upload any relevant court orders or parenting plans.
              </p>

              {data.courtOrderFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-green-700 bg-green-50 px-3 py-1.5 rounded-lg mb-2">
                  <span>{f.filename}</span>
                  <button
                    type="button"
                    onClick={() =>
                      updateData({ courtOrderFiles: data.courtOrderFiles.filter((_, fi) => fi !== i) })
                    }
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}

              <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-brand hover:text-brand cursor-pointer transition-colors">
                <Upload className="h-4 w-4" />
                {uploading ? "Uploading..." : "Upload court order document"}
                <input type="file" className="sr-only" onChange={handleCourtOrderUpload} accept=".pdf,.jpg,.jpeg,.png" />
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
