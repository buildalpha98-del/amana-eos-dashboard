"use client";

interface Tab {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface MarketingTabsProps {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
}

export function MarketingTabs({ tabs, active, onChange }: MarketingTabsProps) {
  return (
    <div className="border-b border-gray-200">
      <nav className="flex gap-6 -mb-px">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.key === active;
          return (
            <button
              key={tab.key}
              onClick={() => onChange(tab.key)}
              className={`flex items-center gap-2 py-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? "border-[#004E64] text-[#004E64]"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
