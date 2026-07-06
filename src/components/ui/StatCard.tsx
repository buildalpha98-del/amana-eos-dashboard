import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils";

function Sparkline({ points, color }: { points: number[]; color: string }) {
  const w = 72;
  const h = 20;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const path = points
    .map((v, i) => {
      const x = (i / (points.length - 1)) * (w - 2) + 1;
      const y = h - 2 - ((v - min) / span) * (h - 4);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="mt-1.5">
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
    </svg>
  );
}

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  iconColor?: string;
  trend?: "up" | "down" | "neutral";
  /** Tiny trend line under the value (2026-07-06 design system) —
   *  turns a number into a direction. 3+ points; older → newer. */
  sparkline?: number[];
  valueColor?: string;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor = "#004E64",
  trend,
  sparkline,
  valueColor,
  size = "md",
  loading = false,
}: StatCardProps) {
  const sizeClasses = {
    sm: "p-4",
    md: "p-4 sm:p-6",
    lg: "p-6",
  };

  const valueClasses = {
    sm: "text-lg font-bold font-heading",
    md: "text-2xl sm:text-3xl font-bold font-heading",
    lg: "text-3xl font-bold font-heading",
  };

  const iconSizeClasses = {
    sm: "w-10 h-10",
    md: "w-11 h-11",
    lg: "w-11 h-11",
  };

  // Gradient accent bar for top of card
  const accentStyle = {
    background: `linear-gradient(to right, ${iconColor}99, transparent)`,
  };

  if (size === "sm") {
    // Left-aligned layout for small cards (MetricCard pattern)
    return (
      <div
        className={cn(
          "bg-card rounded-xl border border-border shadow-[var(--shadow-warm)]",
          "hover:shadow-[var(--shadow-warm-md)] hover:-translate-y-0.5 transition-all duration-300",
          "overflow-hidden relative",
          sizeClasses[size],
          "flex items-center gap-3"
        )}
      >
        {/* Top accent line */}
        <div className="absolute top-0 left-0 right-0 h-[2px]" style={accentStyle} />

        {Icon && (
          <div
            className={cn(
              "rounded-xl flex items-center justify-center shrink-0 shadow-inner",
              iconSizeClasses[size]
            )}
            style={{ backgroundColor: iconColor + "15", color: iconColor }}
          >
            <Icon className="w-5 h-5" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-xs text-muted truncate">{title}</p>
          {loading ? (
            <div className="h-7 w-16 bg-surface rounded animate-pulse mt-0.5" />
          ) : (
            <p className={cn(valueClasses[size], valueColor || "text-foreground", "leading-tight")}>{value}</p>
          )}
        </div>
      </div>
    );
  }

  // md / lg layout (icon top-right)
  return (
    <div
      className={cn(
        "bg-card rounded-xl border border-border shadow-[var(--shadow-warm)]",
        "hover:shadow-[var(--shadow-warm-md)] hover:-translate-y-0.5 transition-all duration-300",
        "overflow-hidden relative",
        sizeClasses[size]
      )}
    >
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={accentStyle} />

      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs sm:text-sm font-medium text-muted truncate">{title}</p>
          {loading ? (
            <div className="h-8 w-24 bg-surface rounded animate-pulse mt-1" />
          ) : (
            <p className={cn(valueClasses[size], valueColor || "text-foreground", "mt-1 truncate")}>{value}</p>
          )}
          {subtitle && (
            <div className="flex items-center gap-1 mt-1">
              {trend === "up" && <ArrowUpRight className="w-3 h-3 text-emerald-500" />}
              {trend === "down" && <ArrowDownRight className="w-3 h-3 text-red-500" />}
              <p
                className={cn(
                  "text-sm",
                  trend === "up" ? "text-emerald-600" : trend === "down" ? "text-red-600" : "text-muted"
                )}
              >
                {subtitle}
              </p>
            </div>
          )}
          {sparkline && sparkline.length >= 3 && (
            <Sparkline points={sparkline} color={iconColor} />
          )}
        </div>
        {Icon && (
          <div
            className={cn(
              "rounded-xl flex items-center justify-center shadow-inner",
              iconSizeClasses[size]
            )}
            style={{ backgroundColor: iconColor + "15", color: iconColor }}
          >
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
    </div>
  );
}
