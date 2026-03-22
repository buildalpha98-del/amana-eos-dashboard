"use client";

import { ChildDetails } from "./types";

interface ChildTabsProps {
  children: ChildDetails[];
  activeIndex: number;
  onChange: (index: number) => void;
}

export function ChildTabs({ children, activeIndex, onChange }: ChildTabsProps) {
  if (children.length <= 1) return null;

  return (
    <div className="flex gap-2 mb-6 flex-wrap">
      {children.map((child, i) => (
        <button
          key={i}
          onClick={() => onChange(i)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            i === activeIndex
              ? "bg-brand text-white"
              : "bg-surface text-muted hover:bg-border"
          }`}
        >
          {child.firstName || `Child ${i + 1}`}
        </button>
      ))}
    </div>
  );
}
