"use client";

import { useRef, useCallback, useState, useEffect, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface Props {
  icon: LucideIcon;
  iconColor: string;
  title: string;
  children: ReactNode;
  narrative: string | null;
  onNarrativeChange: (value: string) => void;
}

export function ReportSection({
  icon: Icon,
  iconColor,
  title,
  children,
  narrative,
  onNarrativeChange,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [localValue, setLocalValue] = useState(narrative ?? "");

  // Sync from parent when narrative changes (e.g. switching reports)
  useEffect(() => {
    setLocalValue(narrative ?? "");
  }, [narrative]);

  // Auto-resize textarea to fit content
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [localValue]);

  const handleBlur = useCallback(() => {
    if (localValue !== (narrative ?? "")) {
      onNarrativeChange(localValue);
    }
  }, [localValue, narrative, onNarrativeChange]);

  return (
    <div className="report-section bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${iconColor}15`, color: iconColor }}
        >
          <Icon className="w-4.5 h-4.5" />
        </div>
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      </div>

      {/* Data content */}
      <div className="px-5 py-4">{children}</div>

      {/* Editable narrative */}
      <div className="px-5 pb-4">
        <label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">
          Narrative
        </label>
        <textarea
          ref={textareaRef}
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={handleBlur}
          rows={2}
          className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 leading-relaxed
                     focus:outline-none focus:ring-2 focus:ring-[#004E64]/20 focus:border-[#004E64]/40
                     placeholder:text-gray-400"
          placeholder="Add commentary..."
        />
      </div>
    </div>
  );
}
