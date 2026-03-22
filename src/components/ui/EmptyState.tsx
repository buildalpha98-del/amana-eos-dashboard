import { Plus } from "lucide-react";

interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  title: string;
  description?: string;
  action?: {
    label: string;
    icon?: React.ComponentType<{ className?: string }>;
    onClick: () => void;
  };
  variant?: "card" | "inline";
  iconColor?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = "card",
  iconColor = "#004E64",
}: EmptyStateProps) {
  if (variant === "inline") {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Icon className="w-14 h-14 text-border mb-4" />
        <p className="text-muted text-base font-heading font-medium">{title}</p>
        {description && (
          <p className="text-muted/70 text-sm mt-1">{description}</p>
        )}
        {action && (
          <button
            onClick={action.onClick}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-brand text-white text-sm font-medium rounded-xl shadow-[var(--shadow-warm-sm)] hover:shadow-[var(--shadow-warm)] hover:bg-brand-hover active:scale-[0.98] transition-all duration-200"
          >
            {action.icon ? (
              <action.icon className="w-4 h-4" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            {action.label}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative flex flex-col items-center justify-center py-20 text-center bg-card rounded-2xl border border-border shadow-[var(--shadow-warm)] overflow-hidden animate-widget-in">
      {/* Decorative background pattern */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <svg className="absolute -top-16 -right-16 w-64 h-64 opacity-[0.03]" viewBox="0 0 200 200" fill="none">
          <circle cx="100" cy="100" r="80" stroke={iconColor} strokeWidth="1.5" />
          <circle cx="100" cy="100" r="60" stroke={iconColor} strokeWidth="1" />
          <circle cx="100" cy="100" r="40" stroke={iconColor} strokeWidth="0.5" />
        </svg>
        <svg className="absolute -bottom-12 -left-12 w-48 h-48 opacity-[0.03]" viewBox="0 0 200 200" fill="none">
          <rect x="20" y="20" width="160" height="160" rx="30" stroke={iconColor} strokeWidth="1.5" />
          <rect x="50" y="50" width="100" height="100" rx="20" stroke={iconColor} strokeWidth="1" />
        </svg>
      </div>

      <div
        className="w-20 h-20 rounded-3xl flex items-center justify-center mb-4 ring-1"
        style={{
          backgroundColor: iconColor + "14",
          "--tw-ring-color": iconColor + "1A",
        } as React.CSSProperties}
      >
        <Icon
          className="w-10 h-10"
          style={{ color: iconColor, opacity: 0.5 }}
        />
      </div>
      <h3 className="text-lg font-heading font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="text-muted mt-2 max-w-sm text-sm leading-relaxed">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-6 inline-flex items-center gap-1.5 px-5 py-2.5 bg-brand text-white text-sm font-medium rounded-xl shadow-[var(--shadow-warm-sm)] hover:shadow-[var(--shadow-warm)] hover:bg-brand-hover active:scale-[0.98] transition-all duration-200"
        >
          {action.icon ? (
            <action.icon className="w-4 h-4" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
          {action.label}
        </button>
      )}
      {/* Decorative accent bar */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[2px]"
        style={{
          background: `linear-gradient(to right, ${iconColor}4D, transparent)`,
        }}
      />
    </div>
  );
}
