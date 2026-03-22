"use client";

import { useState, type ReactNode } from "react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { HelpTooltip } from "@/components/ui/HelpTooltip";
import { BottomSheet, BottomSheetItem } from "@/components/ui/BottomSheet";

// ─── Types ───────────────────────────────────────────────

export interface PageHeaderAction {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  variant?: "primary" | "secondary" | "destructive";
  loading?: boolean;
  hidden?: boolean;
  /** When true, shows a checkmark in mobile bottom sheet */
  active?: boolean;
}

export interface PageHeaderToggle {
  options: Array<{ icon: LucideIcon; label: string; value: string }>;
  value: string;
  onChange: (value: string) => void;
}

export interface PageHeaderProps {
  title: string;
  description?: string;
  badge?: string;
  helpTooltipId?: string;
  helpTooltipContent?: string;
  primaryAction?: PageHeaderAction;
  /** Actions shown inline on desktop, in bottom sheet on mobile */
  secondaryActions?: PageHeaderAction[];
  toggles?: PageHeaderToggle[];
  /** Slot for custom inline content (e.g. search, filters) rendered after toggles */
  children?: ReactNode;
}

// ─── Component ───────────────────────────────────────────

export function PageHeader({
  title,
  description,
  badge,
  helpTooltipId,
  helpTooltipContent,
  primaryAction,
  secondaryActions,
  toggles,
  children,
}: PageHeaderProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const visibleSecondary = secondaryActions?.filter((a) => !a.hidden) ?? [];
  const hasOverflow = visibleSecondary.length > 0;

  return (
    <div className="mb-6 animate-fade-in">
      {/* ── Row 1: Title + actions ─────────────────────── */}
      <div className="flex items-start sm:items-center justify-between gap-4">
        {/* Left: Title block */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-heading font-semibold text-foreground tracking-tight">
              {title}
            </h2>
            {badge && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-accent/20 text-brand border border-accent/30 shrink-0">
                {badge}
              </span>
            )}
            {helpTooltipId && helpTooltipContent && (
              <HelpTooltip id={helpTooltipId} content={helpTooltipContent} />
            )}
          </div>
          {description && (
            <p className="text-sm text-muted mt-0.5">{description}</p>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Toggles — always visible */}
          {toggles?.map((toggle, ti) => (
            <SegmentedToggle key={ti} toggle={toggle} />
          ))}

          {/* Desktop secondary actions — hidden on mobile */}
          {visibleSecondary.map((action) => (
            <Button
              key={action.label}
              variant={action.variant ?? "secondary"}
              size="sm"
              onClick={action.onClick}
              loading={action.loading}
              iconLeft={<action.icon className="w-4 h-4" />}
              className="hidden md:inline-flex"
            >
              {action.label}
            </Button>
          ))}

          {/* Primary action — always visible */}
          {primaryAction && !primaryAction.hidden && (
            <Button
              variant="primary"
              size="sm"
              onClick={primaryAction.onClick}
              loading={primaryAction.loading}
              iconLeft={<primaryAction.icon className="w-4 h-4" />}
            >
              <span className="hidden sm:inline">{primaryAction.label}</span>
            </Button>
          )}

          {/* Mobile overflow trigger */}
          {hasOverflow && (
            <button
              onClick={() => setSheetOpen(true)}
              className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-surface transition-colors md:hidden"
              aria-label="More actions"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Row 2: Optional children slot (search, filters, etc) ── */}
      {children && <div className="mt-3">{children}</div>}

      {/* ── Mobile Bottom Sheet ─────────────────────────── */}
      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Actions"
      >
        {visibleSecondary.map((action) => (
          <BottomSheetItem
            key={action.label}
            icon={action.icon}
            label={action.label}
            active={action.active}
            destructive={action.variant === "destructive"}
            disabled={action.loading}
            onClick={() => {
              action.onClick();
              // Keep sheet open for toggleable actions, close for one-shots
              if (!action.active && action.active !== false) {
                setSheetOpen(false);
              }
            }}
          />
        ))}
      </BottomSheet>
    </div>
  );
}

// ─── Segmented Toggle ────────────────────────────────────

function SegmentedToggle({ toggle }: { toggle: PageHeaderToggle }) {
  return (
    <div className="flex items-center bg-surface rounded-lg p-0.5">
      {toggle.options.map((opt) => {
        const Icon = opt.icon;
        const isActive = toggle.value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => toggle.onChange(opt.value)}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              isActive
                ? "bg-card text-brand shadow-[var(--shadow-warm-sm)]"
                : "text-muted hover:text-foreground"
            )}
            title={opt.label}
            aria-label={opt.label}
            aria-pressed={isActive}
          >
            <Icon className="w-4 h-4" />
          </button>
        );
      })}
    </div>
  );
}
