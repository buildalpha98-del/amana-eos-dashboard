"use client";

/**
 * ServiceTabBarV2 — pill-chip tab bar for the staff dashboard v2 services shell.
 *
 * Replaces the v1 border-underline tab bar with grouped warm-pill chips.
 * Same API as v1 — group list + active group key + sub-tab list + active
 * sub-tab key + change handlers. Badge counts render inside the pill.
 *
 * Designed to be consumed behind `useStaffV2Flag()`; v1 tab bar stays in place
 * for flag-off builds.
 */

import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

export interface TabBarSubTab {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface TabBarGroup {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  subTabs: TabBarSubTab[];
}

export interface ServiceTabBarV2Props {
  groups: readonly TabBarGroup[];
  activeGroup: string;
  onGroupChange: (key: string) => void;

  activeSub?: string;
  onSubChange?: (key: string) => void;

  /** Returns a badge count for a group, or 0 for none. */
  badgeFor?: (groupKey: string) => number;
}

export function ServiceTabBarV2({
  groups,
  activeGroup,
  onGroupChange,
  activeSub,
  onSubChange,
  badgeFor,
}: ServiceTabBarV2Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const current = groups.find((g) => g.key === activeGroup) ?? groups[0];
  if (!current) return null;

  const CurrentIcon = current.icon;
  const currentBadge = badgeFor?.(current.key) ?? 0;

  return (
    <div className="space-y-3">
      {/* ── Mobile group dropdown (< sm) ─────────────────────── */}
      <div className="sm:hidden relative">
        <button
          type="button"
          onClick={() => setMobileOpen((o) => !o)}
          className={cn(
            "w-full flex items-center justify-between px-3 py-2.5",
            "rounded-[var(--radius-md)] bg-[color:var(--color-cream-soft)]",
            "border border-[color:var(--color-border)] text-sm font-medium",
            "text-[color:var(--color-foreground)]",
          )}
        >
          <div className="flex items-center gap-2">
            <CurrentIcon className="w-4 h-4 text-[color:var(--color-brand)]" />
            <span>{current.label}</span>
            <Badge count={currentBadge} />
          </div>
          <ChevronDown
            className={cn(
              "w-4 h-4 text-[color:var(--color-muted)] transition-transform",
              mobileOpen && "rotate-180",
            )}
          />
        </button>
        {mobileOpen && (
          <div
            className={cn(
              "absolute top-full left-0 right-0 mt-1 py-1 z-20",
              "rounded-[var(--radius-md)] bg-[color:var(--color-cream-soft)]",
              "border border-[color:var(--color-border)]",
              "shadow-[var(--shadow-warm-md)]",
            )}
          >
            {groups.map((g) => {
              const Icon = g.icon;
              const badge = badgeFor?.(g.key) ?? 0;
              const isActive = activeGroup === g.key;
              return (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => {
                    onGroupChange(g.key);
                    setMobileOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-sm font-medium",
                    "transition-colors",
                    isActive
                      ? "text-[color:var(--color-brand)] bg-[color:var(--color-brand-soft)]"
                      : "text-[color:var(--color-muted)] hover:bg-[color:var(--color-cream-deep)]",
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span className="flex-1 text-left">{g.label}</span>
                  <Badge count={badge} />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Desktop pill row (≥ sm) ──────────────────────────── */}
      <div className="hidden sm:flex flex-wrap gap-1.5">
        {groups.map((g) => {
          const Icon = g.icon;
          const badge = badgeFor?.(g.key) ?? 0;
          const isActive = activeGroup === g.key;
          return (
            <button
              key={g.key}
              type="button"
              onClick={() => onGroupChange(g.key)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-md)]",
                "text-[13px] font-medium whitespace-nowrap transition-colors",
                isActive
                  ? "bg-[color:var(--color-brand)] text-white"
                  : cn(
                      "bg-[color:var(--color-cream-soft)] border border-[color:var(--color-border)]",
                      "text-[color:var(--color-foreground)]/80 hover:bg-[color:var(--color-cream-deep)]",
                    ),
              )}
              aria-pressed={isActive}
            >
              <Icon className="w-3.5 h-3.5" />
              {g.label}
              <Badge count={badge} inverted={isActive} />
            </button>
          );
        })}
      </div>

      {/* ── Sub-pill row ─────────────────────────────────────── */}
      {current.subTabs.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {current.subTabs.map((sub) => {
            const SubIcon = sub.icon;
            const isActive = activeSub === sub.key;
            return (
              <button
                key={sub.key}
                type="button"
                onClick={() => onSubChange?.(sub.key)}
                className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-[var(--radius-sm)]",
                  "text-[12px] font-medium transition-colors",
                  isActive
                    ? "bg-[color:var(--color-brand-soft)] text-[color:var(--color-brand)] border border-[color:var(--color-brand)]/20"
                    : cn(
                        "border border-transparent text-[color:var(--color-muted)]",
                        "hover:bg-[color:var(--color-cream-deep)] hover:text-[color:var(--color-foreground)]",
                      ),
                )}
                aria-pressed={isActive}
              >
                <SubIcon className="w-3 h-3" />
                {sub.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Badge({ count, inverted = false }: { count: number; inverted?: boolean }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center min-w-[16px] h-[16px] px-1",
        "rounded-full text-[10px] font-bold",
        inverted
          ? "bg-white/20 text-white"
          : "bg-[color:var(--color-brand)]/10 text-[color:var(--color-brand)]",
      )}
    >
      {count}
    </span>
  );
}
