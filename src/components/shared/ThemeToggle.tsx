"use client";

import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  const cycle = () => {
    const order: Array<"light" | "dark" | "system"> = ["light", "dark", "system"];
    const idx = order.indexOf(theme);
    setTheme(order[(idx + 1) % order.length]);
  };

  const Icon = theme === "dark" ? Moon : theme === "system" ? Monitor : Sun;
  const label = theme === "dark" ? "Dark" : theme === "system" ? "System" : "Light";

  return (
    <button
      onClick={cycle}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
        "text-muted hover:text-foreground hover:bg-surface dark:text-muted dark:hover:text-muted/50 dark:hover:bg-gray-800",
        className
      )}
      title={`Theme: ${label}`}
    >
      <Icon className="w-4 h-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
