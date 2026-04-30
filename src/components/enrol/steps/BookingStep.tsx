"use client";

import { useState, useEffect } from "react";
import { EnrolmentFormData, BookingPrefs } from "../types";
import { ChildTabs } from "../ChildTabs";

interface Props {
  data: EnrolmentFormData;
  updateData: (
    d:
      | Partial<EnrolmentFormData>
      | ((prev: EnrolmentFormData) => Partial<EnrolmentFormData>)
  ) => void;
}

const SESSION_TYPES = [
  { value: "bsc", label: "Before School Care" },
  { value: "asc", label: "After School Care" },
  { value: "vc", label: "Vacation Care" },
];

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

interface ServiceOption {
  id: string;
  name: string;
}

export function BookingStep({ data, updateData }: Props) {
  const [activeChild, setActiveChild] = useState(0);
  const [services, setServices] = useState<ServiceOption[]>([]);

  useEffect(() => {
    fetch("/api/services/public-list")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        if (Array.isArray(list)) {
          setServices(list);
        }
      })
      .catch((err) => {
        if (process.env.NODE_ENV !== "production") console.warn("BookingStep: fetch public services failed:", err);
      });
  }, []);

  const prefs = data.bookingPrefs[activeChild] || data.bookingPrefs[0];

  const updatePrefs = (field: keyof BookingPrefs, value: unknown) => {
    updateData((prev) => {
      const bookingPrefs = [...prev.bookingPrefs];
      bookingPrefs[activeChild] = { ...bookingPrefs[activeChild], [field]: value };
      return { bookingPrefs };
    });
  };

  const toggleSession = (sessionType: string) => {
    const current = prefs.sessionTypes;
    const next = current.includes(sessionType)
      ? current.filter((s) => s !== sessionType)
      : [...current, sessionType];
    updatePrefs("sessionTypes", next);
  };

  const toggleDay = (sessionType: string, day: string) => {
    const currentDays = prefs.days[sessionType] || [];
    const next = currentDays.includes(day)
      ? currentDays.filter((d) => d !== day)
      : [...currentDays, day];
    updatePrefs("days", { ...prefs.days, [sessionType]: next });
  };

  return (
    <div className="space-y-6">
      <ChildTabs children={data.children} activeIndex={activeChild} onChange={setActiveChild} />

      <h3 className="text-lg font-semibold text-foreground">
        Booking Preferences — {data.children[activeChild]?.firstName || `Child ${activeChild + 1}`}
      </h3>

      <div>
        <label className="block text-sm font-medium text-foreground/80 mb-1">
          Which centre/service?
        </label>
        <select
          value={prefs.serviceId}
          onChange={(e) => updatePrefs("serviceId", e.target.value)}
          className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand bg-card"
        >
          <option value="">Select a centre...</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground/80 mb-3">Session Types</label>
        <div className="flex flex-wrap gap-2">
          {SESSION_TYPES.map((st) => (
            <button
              key={st.value}
              type="button"
              onClick={() => toggleSession(st.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                prefs.sessionTypes.includes(st.value)
                  ? "bg-brand/10 border-brand text-brand"
                  : "bg-surface/50 border-border text-muted hover:bg-surface"
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>

      {prefs.sessionTypes.length > 0 && (
        <div className="space-y-4">
          <label className="block text-sm font-medium text-foreground/80">Days Required</label>
          {prefs.sessionTypes.map((st) => (
            <div key={st}>
              <p className="text-sm text-muted mb-2 font-medium">
                {SESSION_TYPES.find((s) => s.value === st)?.label}
              </p>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(st, day)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                      (prefs.days[st] || []).includes(day)
                        ? "bg-brand/10 border-brand text-brand"
                        : "bg-surface/50 border-border text-muted hover:bg-surface"
                    }`}
                  >
                    {day.charAt(0).toUpperCase() + day.slice(1, 3)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-foreground/80 mb-2">Booking Type</label>
        <div className="flex gap-3">
          {(["permanent", "casual"] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => updatePrefs("bookingType", type)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                prefs.bookingType === type
                  ? "bg-brand/10 border-brand text-brand"
                  : "bg-surface/50 border-border text-muted hover:bg-surface"
              }`}
            >
              {type === "permanent" ? "Permanent" : "Casual"}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground/80 mb-1">Preferred Start Date</label>
        <input
          type="date"
          value={prefs.startDate}
          onChange={(e) => updatePrefs("startDate", e.target.value)}
          className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground/80 mb-1">
          Specific Requirements
        </label>
        <textarea
          value={prefs.requirements}
          onChange={(e) => updatePrefs("requirements", e.target.value)}
          rows={3}
          placeholder="Any special requirements or requests..."
          className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
        />
      </div>
    </div>
  );
}
