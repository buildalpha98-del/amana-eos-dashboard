"use client";

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface AiDraftBadgeProps {
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
}

export function AiDraftBadge({ onClick, className }: AiDraftBadgeProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
        "bg-amber-50 border border-amber-200 text-amber-600",
        "text-[11px] font-medium leading-none",
        "hover:bg-amber-100 transition-colors",
        "focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-1",
        className,
      )}
    >
      <Sparkles className="w-3 h-3 animate-pulse-subtle" />
      <span>AI Draft</span>
    </button>
  );
}
