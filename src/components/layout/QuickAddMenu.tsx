"use client";

import { useRef, useEffect, useCallback } from "react";
import {
  CheckSquare,
  AlertCircle,
  Mountain,
} from "lucide-react";
import { useQuickAdd } from "@/components/quick-add/QuickAddProvider";

export function QuickAddMenu({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { openTodoModal, openIssueModal, openRockModal } = useQuickAdd();
  const menuRef = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        // Also check if the click is on the toggle button (parent relative container)
        const toggle = menuRef.current.parentElement?.querySelector(
          'button[title="Quick Add"]'
        );
        if (toggle && toggle.contains(e.target as Node)) return;
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (open) {
      // Use a rAF to avoid the same event that opened the menu from closing it
      const id = requestAnimationFrame(() => {
        document.addEventListener("mousedown", handleClickOutside);
      });
      return () => {
        cancelAnimationFrame(id);
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [open, handleClickOutside]);

  if (!open) return null;

  const quickItems = [
    { label: "New To-Do", icon: CheckSquare, action: () => { openTodoModal(); onClose(); } },
    { label: "New Issue", icon: AlertCircle, action: () => { openIssueModal(); onClose(); } },
    { label: "New Rock", icon: Mountain, action: () => { openRockModal(); onClose(); } },
  ];

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-full mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-50"
    >
      {quickItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.label}
            onClick={item.action}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Icon className="w-4 h-4 text-gray-400" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
