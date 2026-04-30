"use client";

import { StatusBadge, type StatusVariant } from "./StatusBadge";
import { cn } from "@/lib/utils";

interface SessionCardProps {
  date: Date;
  label: string;
  sublabel?: string;
  status: StatusVariant;
  variant?: "list" | "tile";
  className?: string;
}

export function SessionCard({
  date,
  label,
  sublabel,
  status,
  variant = "list",
  className,
}: SessionCardProps) {
  const dayName = date.toLocaleDateString("en-AU", { weekday: "short" }).toUpperCase();
  const dayNum = date.getDate();

  if (variant === "tile") {
    return (
      <div className={cn("warm-card min-w-[128px] flex flex-col gap-2", className)}>
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] font-bold tracking-wider text-[color:var(--color-brand)]">
            {dayName}
          </span>
          <span className="text-xl font-bold text-[color:var(--color-brand)] leading-none">
            {dayNum}
          </span>
        </div>
        <div className="text-xs font-semibold text-[color:var(--color-foreground)] truncate">
          {label}
        </div>
        {sublabel && (
          <div className="text-[10px] text-[color:var(--color-muted)] truncate">{sublabel}</div>
        )}
        <StatusBadge variant={status} />
      </div>
    );
  }

  return (
    <div className={cn("warm-card flex items-center gap-3", className)}>
      <div className="w-11 h-11 rounded-[var(--radius-sm)] bg-[color:var(--color-brand-soft)] flex flex-col items-center justify-center shrink-0">
        <span className="text-[9px] font-bold tracking-wider text-[color:var(--color-brand)]">
          {dayName}
        </span>
        <span className="text-sm font-bold text-[color:var(--color-brand)] leading-none">
          {dayNum}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-[color:var(--color-foreground)] truncate">
          {label}
        </div>
        {sublabel && (
          <div className="text-xs text-[color:var(--color-muted)] truncate mt-0.5">{sublabel}</div>
        )}
      </div>
      <StatusBadge variant={status} />
    </div>
  );
}
