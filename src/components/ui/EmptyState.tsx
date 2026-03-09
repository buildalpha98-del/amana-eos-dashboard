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
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Icon className="w-16 h-16 text-gray-300 mb-4" />
        <p className="text-gray-500 text-lg">{title}</p>
        {description && (
          <p className="text-gray-400 text-sm mt-1">{description}</p>
        )}
        {action && (
          <button
            onClick={action.onClick}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover transition-colors"
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
    <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-xl border border-gray-200">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
        style={{ backgroundColor: iconColor + "08" }}
      >
        <Icon
          className="w-8 h-8"
          style={{ color: iconColor, opacity: 0.3 }}
        />
      </div>
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      {description && (
        <p className="text-gray-500 mt-2 max-w-md">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-6 inline-flex items-center gap-1.5 px-5 py-2.5 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover transition-colors shadow-sm"
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
