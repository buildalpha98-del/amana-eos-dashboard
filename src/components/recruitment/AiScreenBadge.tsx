"use client";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

function color(score: number): string {
  if (score >= 80) return "bg-emerald-100 text-emerald-700";
  if (score >= 50) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

export function AiScreenBadge({
  score,
  summary,
}: {
  score: number;
  summary: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        type="button"
        className={cn(
          "inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full",
          color(score),
        )}
      >
        AI {score}
        {summary &&
          (open ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          ))}
      </button>
      {open && summary && (
        <div className="mt-2 text-sm text-foreground/80 bg-surface rounded p-2">
          {summary}
        </div>
      )}
    </div>
  );
}
