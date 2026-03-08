"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Save } from "lucide-react";
import {
  INPUT_CONFIG,
  PRESET_SCENARIOS,
  type ScenarioInputs,
  type InputMeta,
} from "@/lib/scenario-engine";

interface Props {
  inputs: ScenarioInputs;
  onChange: (key: keyof ScenarioInputs, value: number) => void;
  onLoadPreset: (inputs: ScenarioInputs) => void;
  onSave: () => void;
}

const GROUP_LABELS: Record<string, string> = {
  network: "Network",
  pricing: "Pricing",
  staffing: "Staffing & Attendance",
  overheads: "Overheads",
};

function formatDisplay(value: number, meta: InputMeta): string {
  if (meta.format === "currency") return `$${value.toFixed(meta.step < 1 ? 2 : 0)}`;
  if (meta.format === "percent") return `${value}%`;
  return String(value);
}

function SliderInput({
  meta,
  value,
  onChange,
}: {
  meta: InputMeta;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-600">{meta.label}</label>
        <span className="text-xs font-semibold text-gray-900 tabular-nums">
          {formatDisplay(value, meta)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={meta.min}
          max={meta.max}
          step={meta.step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="flex-1 h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer accent-[#004E64]"
        />
        <input
          type="number"
          min={meta.min}
          max={meta.max}
          step={meta.step}
          value={value}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onChange(Math.min(meta.max, Math.max(meta.min, v)));
          }}
          className="w-20 rounded-md border border-gray-300 px-2 py-1 text-xs text-right tabular-nums focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
        />
      </div>
    </div>
  );
}

function InputGroup({
  groupKey,
  inputs,
  onChange,
}: {
  groupKey: string;
  inputs: ScenarioInputs;
  onChange: (key: keyof ScenarioInputs, value: number) => void;
}) {
  const [open, setOpen] = useState(true);
  const items = INPUT_CONFIG.filter((m) => m.group === groupKey);

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50 rounded-xl transition-colors"
      >
        {GROUP_LABELS[groupKey]}
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          {items.map((meta) => (
            <SliderInput
              key={meta.key}
              meta={meta}
              value={inputs[meta.key]}
              onChange={(v) => onChange(meta.key, v)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ScenarioInputPanel({ inputs, onChange, onLoadPreset, onSave }: Props) {
  return (
    <div className="space-y-3">
      {/* Preset Selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <label className="block text-xs font-medium text-gray-600 mb-1.5">Load Preset</label>
        <select
          onChange={(e) => {
            const preset = PRESET_SCENARIOS.find((p) => p.key === e.target.value);
            if (preset) onLoadPreset(preset.inputs);
          }}
          defaultValue=""
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
        >
          <option value="" disabled>Select a preset scenario...</option>
          {PRESET_SCENARIOS.map((p) => (
            <option key={p.key} value={p.key}>{p.name} — {p.description}</option>
          ))}
        </select>
      </div>

      {/* Input Groups */}
      {["network", "pricing", "staffing", "overheads"].map((g) => (
        <InputGroup key={g} groupKey={g} inputs={inputs} onChange={onChange} />
      ))}

      {/* Save Button */}
      <button
        onClick={onSave}
        className="flex items-center justify-center gap-2 w-full rounded-xl bg-[#004E64] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#003D52] transition-colors"
      >
        <Save className="w-4 h-4" />
        Save Scenario
      </button>
    </div>
  );
}
