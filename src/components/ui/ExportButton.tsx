"use client";

import { Download } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExportButtonProps {
  onClick: () => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function ExportButton({ onClick, label = "Export CSV", disabled = false, className }: ExportButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors",
        "border-gray-300 text-gray-700 bg-white hover:bg-gray-50",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
    >
      <Download className="w-4 h-4" />
      {label}
    </button>
  );
}
