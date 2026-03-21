"use client";

import { Download } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExportButtonProps {
  onClick: () => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function ExportButton({ onClick, label = "Export", disabled = false, className }: ExportButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
      title="Export to CSV"
    >
      <Download className="h-4 w-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
