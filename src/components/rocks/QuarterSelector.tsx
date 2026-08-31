"use client";

/**
 * Rocks quarter selector — 2026-07-08 redesign.
 *
 * Previous behaviour: 6 fixed tabs (Q4 prev year, all quarters of current
 * year, Q1 next year) regardless of what quarter it actually is. This
 * cluttered the header with 2025 quarters that Daniel had already put
 * to bed and pushed the current quarter off to the right.
 *
 * New behaviour: two primary pills (Previous · Current) plus an
 * Archive dropdown listing every earlier quarter that has real rock
 * data. Archive is populated by GET /api/rocks/quarters, so we only
 * show quarters that were actually used — no more scrolling past
 * empty tabs.
 *
 * "Current" is always today's quarter (Q3 2026 in July). "Previous"
 * is exactly one quarter back (Q2 2026), computed via shiftQuarter
 * so it rolls over years correctly.
 *
 * If the caller's `value` is a quarter that's neither Current nor
 * Previous (e.g. they selected one from the archive), we show a
 * third highlighted pill for that quarter so the current selection
 * is always visible.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, History } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn, getCurrentQuarter, shiftQuarter, formatQuarter } from "@/lib/utils";
import { fetchApi } from "@/lib/fetch-api";

interface Props {
  value: string;
  onChange: (quarter: string) => void;
}

export function QuarterSelector({ value, onChange }: Props) {
  const current = getCurrentQuarter();
  const previous = shiftQuarter(current, -1);

  const { data } = useQuery<{ quarters: string[] }>({
    queryKey: ["rocks-quarters"],
    queryFn: () => fetchApi<{ quarters: string[] }>("/api/rocks/quarters"),
    staleTime: 5 * 60_000,
  });

  const allQuarters = data?.quarters ?? [];
  // Archive = quarters with rocks that aren't the two visible pills.
  // Newest first, filtered so Current/Previous never double-appear.
  const archiveQuarters = allQuarters.filter(
    (q) => q !== current && q !== previous,
  );

  // If the caller has selected a quarter that isn't Current or Previous
  // (typically because they picked it from the archive), show it as an
  // extra pill so the active selection is always visible.
  const isOtherSelected = value !== current && value !== previous;

  const [archiveOpen, setArchiveOpen] = useState(false);
  const archiveRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!archiveOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (
        archiveRef.current &&
        !archiveRef.current.contains(e.target as Node)
      ) {
        setArchiveOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setArchiveOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [archiveOpen]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 bg-surface rounded-lg p-1">
        <Pill
          label={`Previous · ${formatQuarter(previous)}`}
          active={value === previous}
          onClick={() => onChange(previous)}
        />
        <Pill
          label={`Current · ${formatQuarter(current)}`}
          active={value === current}
          onClick={() => onChange(current)}
          isCurrent
        />
        {isOtherSelected && (
          <Pill
            label={formatQuarter(value)}
            active
            onClick={() => onChange(value)}
          />
        )}
      </div>

      {archiveQuarters.length > 0 && (
        <div ref={archiveRef} className="relative">
          <button
            type="button"
            onClick={() => setArchiveOpen((o) => !o)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors",
              archiveOpen
                ? "bg-surface border-border text-foreground"
                : "border-border text-muted hover:bg-surface hover:text-foreground",
            )}
          >
            <History className="w-3.5 h-3.5" />
            Archive
            <ChevronDown
              className={cn(
                "w-3.5 h-3.5 transition-transform",
                archiveOpen && "rotate-180",
              )}
            />
          </button>
          {archiveOpen && (
            <div className="absolute left-0 top-full mt-1 min-w-[160px] bg-card border border-border rounded-lg shadow-lg py-1 z-30 max-h-72 overflow-y-auto">
              {archiveQuarters.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => {
                    onChange(q);
                    setArchiveOpen(false);
                  }}
                  className={cn(
                    "block w-full text-left px-3 py-1.5 text-sm hover:bg-surface transition-colors",
                    value === q
                      ? "text-brand font-semibold bg-brand/5"
                      : "text-foreground",
                  )}
                >
                  {formatQuarter(q)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Pill({
  label,
  active,
  onClick,
  isCurrent,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  isCurrent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-150 whitespace-nowrap",
        active
          ? "bg-brand text-white shadow-sm"
          : isCurrent
            ? "text-brand hover:bg-white/60 font-semibold"
            : "text-muted hover:bg-white/60",
      )}
    >
      {label}
    </button>
  );
}
