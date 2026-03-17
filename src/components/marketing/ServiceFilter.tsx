"use client";

import { useState } from "react";
import { useServices } from "@/hooks/useServices";

const STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"] as const;

interface ServiceFilterProps {
  value: string;
  onChange: (serviceId: string) => void;
}

export function ServiceFilter({ value, onChange }: ServiceFilterProps) {
  const { data: services } = useServices("active");
  const [stateFilter, setStateFilter] = useState("");

  const filtered = [...(services ?? [])]
    .filter((s) => (stateFilter ? s.state === stateFilter : true))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Only show state pills if services span multiple states
  const presentStates = [
    ...new Set((services ?? []).map((s) => s.state).filter(Boolean)),
  ].sort() as string[];
  const showStatePills = presentStates.length > 1;

  function handleStateClick(st: string) {
    const next = stateFilter === st ? "" : st;
    setStateFilter(next);
    // Reset centre selection when state changes since selected centre may not be in new state
    if (next && value) {
      const stillVisible = (services ?? []).find(
        (s) => s.id === value && s.state === next
      );
      if (!stillVisible) onChange("");
    }
  }

  return (
    <div className="flex items-center gap-2">
      {/* State pills */}
      {showStatePills && (
        <div className="flex items-center gap-1">
          {presentStates.map((st) => (
            <button
              key={st}
              onClick={() => handleStateClick(st)}
              className={`px-2 py-1 text-xs font-medium rounded-full border transition-colors ${
                stateFilter === st
                  ? "bg-brand text-white border-brand"
                  : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {st}
            </button>
          ))}
          {stateFilter && (
            <button
              onClick={() => { setStateFilter(""); }}
              className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Centre dropdown */}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-gray-300 bg-white text-sm px-3 py-2 focus:ring-brand focus:border-transparent focus:outline-none focus:ring-1"
      >
        <option value="">
          {stateFilter ? `All ${stateFilter} Centres` : "All Centres"}
        </option>
        {filtered.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({s.code})
          </option>
        ))}
      </select>
    </div>
  );
}
