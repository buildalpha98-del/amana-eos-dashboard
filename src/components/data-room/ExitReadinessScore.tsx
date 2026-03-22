"use client";

import type { DataRoomSection } from "@/hooks/useDataRoom";
import { DATA_ROOM_SECTIONS } from "@/lib/data-room-config";

interface Props {
  overallScore: number;
  sections: DataRoomSection[];
  loading: boolean;
}

function scoreColor(pct: number): string {
  if (pct >= 80) return "#10B981";
  if (pct >= 50) return "#F59E0B";
  return "#EF4444";
}

function scoreLabel(pct: number): string {
  if (pct >= 90) return "Excellent";
  if (pct >= 75) return "Strong";
  if (pct >= 50) return "Moderate";
  if (pct >= 25) return "Needs Work";
  return "Early Stage";
}

export function ExitReadinessScore({ overallScore, sections, loading }: Props) {
  const color = scoreColor(overallScore);

  // SVG ring config
  const size = 120;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (overallScore / 100) * circumference;

  if (loading) {
    return (
      <div className="bg-card rounded-xl border border-border p-6 animate-pulse">
        <div className="flex items-center gap-8">
          <div className="w-[120px] h-[120px] rounded-full bg-surface" />
          <div className="flex-1 space-y-3">
            <div className="h-5 w-48 bg-surface rounded" />
            <div className="h-3 w-32 bg-surface rounded" />
            <div className="flex gap-3 flex-wrap mt-4">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="h-8 w-28 bg-surface rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex flex-col sm:flex-row items-center gap-6">
        {/* SVG Ring */}
        <div className="flex-shrink-0 relative">
          <svg width={size} height={size} className="-rotate-90">
            {/* Track */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#F3F4F6"
              strokeWidth={strokeWidth}
            />
            {/* Progress */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className="transition-all duration-700 ease-out"
            />
          </svg>
          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold tabular-nums" style={{ color }}>
              {overallScore}%
            </span>
            <span className="text-[10px] text-muted font-medium uppercase tracking-wider">
              Ready
            </span>
          </div>
        </div>

        {/* Score details */}
        <div className="flex-1 text-center sm:text-left">
          <h3 className="text-lg font-bold text-foreground">Exit Readiness Score</h3>
          <p className="text-sm text-muted mt-0.5">
            <span className="font-semibold" style={{ color }}>
              {scoreLabel(overallScore)}
            </span>
            {" — "}weighted across {sections.length} due diligence categories
          </p>

          {/* Section mini-badges */}
          <div className="flex flex-wrap gap-2 mt-4 justify-center sm:justify-start">
            {sections.map((section, idx) => {
              const sColor = scoreColor(section.completeness);
              const cfg = DATA_ROOM_SECTIONS[idx];
              const SectionIcon = cfg?.icon;
              return (
                <div
                  key={section.key}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border/50 bg-surface/50/60"
                >
                  {SectionIcon && (
                    <SectionIcon className="w-3.5 h-3.5" style={{ color: cfg.iconColor }} />
                  )}
                  <span className="text-xs text-muted font-medium">{section.label.split(" ")[0]}</span>
                  <span className="text-xs font-bold tabular-nums" style={{ color: sColor }}>
                    {section.completeness}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
