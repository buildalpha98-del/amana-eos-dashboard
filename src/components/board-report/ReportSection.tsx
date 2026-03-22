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
  onAiGenerate?: () => void;
  aiGenerating?: boolean;
}

export function ReportSection({
  icon: Icon,
  iconColor,
  title,
  children,
  narrative,
  onNarrativeChange,
  onAiGenerate,
  aiGenerating,
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
    <div className="report-section bg-card rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border/50">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${iconColor}15`, color: iconColor }}
        >
          <Icon className="w-4.5 h-4.5" />
        </div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>

      {/* Data content */}
      <div className="px-5 py-4">{children}</div>

      {/* Editable narrative */}
      <div className="px-5 pb-4">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium text-muted uppercase tracking-wider">
            Narrative
          </label>
          {onAiGenerate && (
            <button
              onClick={onAiGenerate}
              disabled={aiGenerating}
              className="no-print inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md
                         text-brand bg-brand/5 hover:bg-brand/10 disabled:opacity-50 transition-colors"
              title="Generate narrative with AI"
            >
              {aiGenerating ? (
                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeLinecap="round" />
                </svg>
              ) : (
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
                </svg>
              )}
              {aiGenerating ? "Generating..." : "AI Generate"}
            </button>
          )}
        </div>
        <textarea
          ref={textareaRef}
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={handleBlur}
          rows={2}
          className="w-full resize-none rounded-lg border border-border px-3 py-2 text-sm text-foreground/80 leading-relaxed
                     focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand/40
                     placeholder:text-muted"
          placeholder="Add commentary..."
        />
      </div>
    </div>
  );
}
