"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const glossary: Record<string, { title: string; description: string }> = {
  rocks: {
    title: "Rocks",
    description:
      "90-day quarterly priorities — the 3-7 most important things to accomplish this quarter.",
  },
  todos: {
    title: "To-Dos",
    description:
      "7-day action items that come out of your weekly Level 10 meeting.",
  },
  ids: {
    title: "IDS",
    description:
      "Identify, Discuss, Solve — the EOS method for working through issues.",
  },
  scorecard: {
    title: "Scorecard",
    description:
      "A weekly set of measurables (KPIs) that tell you if you're on track.",
  },
  vto: {
    title: "V/TO",
    description:
      "Vision/Traction Organiser — defines your 10-year target, 3-year picture, and 1-year plan.",
  },
  l10: {
    title: "Level 10 Meeting",
    description:
      "A structured weekly 90-minute team meeting following the EOS agenda.",
  },
  eos: {
    title: "EOS",
    description:
      "Entrepreneurial Operating System — a framework for running and growing your organisation.",
  },
  measurables: {
    title: "Measurables",
    description:
      "Activity-based numbers tracked weekly on the Scorecard to monitor business health.",
  },
  issues: {
    title: "Issues List",
    description:
      "A running list of obstacles, ideas, and opportunities to be solved using IDS.",
  },
  accountability_chart: {
    title: "Accountability Chart",
    description:
      "The EOS org chart — shows who owns what function and seat in the organisation.",
  },
  core_values: {
    title: "Core Values",
    description:
      "3-7 defining traits that guide your team's culture and hiring decisions.",
  },
  quarterly_pulse: {
    title: "Quarterly Pulse",
    description:
      "A check-in at the end of each quarter to review Rock completion and set new Rocks.",
  },
};

interface HelpTooltipProps {
  term: string;
  className?: string;
}

export function HelpTooltip({ term, className }: HelpTooltipProps) {
  const [visible, setVisible] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const entry = glossary[term];

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (
      tooltipRef.current &&
      !tooltipRef.current.contains(e.target as Node) &&
      triggerRef.current &&
      !triggerRef.current.contains(e.target as Node)
    ) {
      setVisible(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [visible, handleClickOutside]);

  if (!entry) return null;

  return (
    <span className={cn("relative inline-flex items-center", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setVisible((v) => !v)}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        className="inline-flex items-center justify-center w-4 h-4 text-gray-400 hover:text-brand transition-colors focus:outline-none"
        aria-label={`What is ${entry.title}?`}
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>

      {visible && (
        <div
          ref={tooltipRef}
          role="tooltip"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 max-w-xs shadow-lg whitespace-normal pointer-events-none"
        >
          <p className="font-semibold mb-0.5">{entry.title}</p>
          <p className="text-gray-300 leading-relaxed">{entry.description}</p>
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-900" />
        </div>
      )}
    </span>
  );
}
