"use client";

import { ChevronDown } from "lucide-react";
import type { DataRoomSection as SectionData } from "@/hooks/useDataRoom";
import type { DataRoomSectionConfig } from "@/lib/data-room-config";
import { DocumentRow } from "./DocumentRow";

interface Props {
  section: SectionData;
  config: DataRoomSectionConfig;
  expanded: boolean;
  onToggle: () => void;
}

function completenessColor(pct: number): string {
  if (pct >= 80) return "#10B981";
  if (pct >= 50) return "#F59E0B";
  return "#EF4444";
}

export function DataRoomSection({ section, config, expanded, onToggle }: Props) {
  const Icon = config.icon;
  const barColor = completenessColor(section.completeness);

  return (
    <div
      className="bg-card rounded-xl border border-border overflow-hidden transition-shadow hover:shadow-sm"
      style={{ borderLeftWidth: "4px", borderLeftColor: config.iconColor }}
    >
      {/* Header — always visible */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
      >
        {/* Icon badge */}
        <div
          className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${config.iconColor}15`, color: config.iconColor }}
        >
          <Icon className="w-4.5 h-4.5" />
        </div>

        {/* Label + progress */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <h3 className="text-sm font-semibold text-foreground truncate">{section.label}</h3>
            <div className="flex items-center gap-2 flex-shrink-0 ml-3">
              <span className="text-xs text-muted">
                {section.presentCount}/{section.totalRequired}
              </span>
              <span
                className="text-xs font-bold tabular-nums"
                style={{ color: barColor }}
              >
                {section.completeness}%
              </span>
            </div>
          </div>
          {/* Progress bar */}
          <div className="h-1.5 bg-surface rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${section.completeness}%`, backgroundColor: barColor }}
            />
          </div>
        </div>

        {/* Chevron */}
        <ChevronDown
          className={`w-4 h-4 text-muted flex-shrink-0 transition-transform duration-200 ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Expanded content */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          expanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="border-t border-border/50">
          {section.items.map((item) => (
            <DocumentRow key={item.key} item={item} />
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-surface/50 flex items-center justify-between">
          <span className="text-xs text-muted">
            {section.documentCount} total record{section.documentCount !== 1 ? "s" : ""} found
          </span>
          {section.lastUpdated && (
            <span className="text-xs text-muted">
              Last updated{" "}
              {new Date(section.lastUpdated).toLocaleDateString("en-AU", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
