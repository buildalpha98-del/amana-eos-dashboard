"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface WarmCTAProps {
  icon: LucideIcon;
  title: string;
  sub?: string;
  href: string;
  tone?: "brand" | "accent";
  className?: string;
}

export function WarmCTA({
  icon: Icon,
  title,
  sub,
  href,
  tone = "brand",
  className,
}: WarmCTAProps) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-[var(--radius-lg)] p-4 border transition-all",
        tone === "brand"
          ? "bg-gradient-to-r from-[color:var(--color-brand-soft)] to-[color:var(--color-accent)]/10 border-[color:var(--color-brand)]/15"
          : "bg-gradient-to-r from-[color:var(--color-accent)]/10 to-[color:var(--color-accent)]/30 border-[color:var(--color-accent)]/30",
        className,
      )}
    >
      <div className="w-10 h-10 rounded-full bg-[color:var(--color-brand-soft)] flex items-center justify-center shrink-0 text-[color:var(--color-brand)]">
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-[color:var(--color-foreground)] truncate">
          {title}
        </div>
        {sub && (
          <div className="text-xs text-[color:var(--color-muted)] truncate mt-0.5">{sub}</div>
        )}
      </div>
      <ChevronRight className="w-5 h-5 text-[color:var(--color-muted)] shrink-0" />
    </Link>
  );
}
