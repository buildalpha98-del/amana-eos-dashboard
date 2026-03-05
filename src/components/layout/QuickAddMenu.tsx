"use client";

import {
  CheckSquare,
  AlertCircle,
  Mountain,
} from "lucide-react";
import { useQuickAdd } from "@/components/quick-add/QuickAddProvider";

export interface QuickAddMenuPosition {
  top: number;
  right: number;
}

export function QuickAddMenu({
  open,
  onClose,
  position,
}: {
  open: boolean;
  onClose: () => void;
  position: QuickAddMenuPosition;
}) {
  const { openTodoModal, openIssueModal, openRockModal } = useQuickAdd();

  if (!open) return null;

  const quickItems = [
    { label: "New To-Do", icon: CheckSquare, action: () => { openTodoModal(); onClose(); } },
    { label: "New Issue", icon: AlertCircle, action: () => { openIssueModal(); onClose(); } },
    { label: "New Rock", icon: Mountain, action: () => { openRockModal(); onClose(); } },
  ];

  return (
    <>
      {/* Invisible fullscreen backdrop for outside clicks */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Menu dropdown — fixed positioned, outside any stacking context */}
      <div
        className="fixed w-48 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-150"
        style={{ top: position.top, right: position.right }}
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
    </>
  );
}
