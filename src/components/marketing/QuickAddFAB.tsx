"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, X, FileText, CheckSquare, FolderOpen } from "lucide-react";

interface Props {
  onNewPost: () => void;
  onNewTask: () => void;
  onNewCampaign: () => void;
}

const SUB_BUTTONS = [
  {
    key: "campaign",
    label: "New Campaign",
    icon: FolderOpen,
    bg: "bg-purple-500 hover:bg-purple-600",
  },
  {
    key: "task",
    label: "New Task",
    icon: CheckSquare,
    bg: "bg-emerald-500 hover:bg-emerald-600",
  },
  {
    key: "post",
    label: "New Post",
    icon: FileText,
    bg: "bg-blue-500 hover:bg-blue-600",
  },
] as const;

export function QuickAddFAB({ onNewPost, onNewTask, onNewCampaign }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function handleAction(key: string) {
    setOpen(false);
    if (key === "post") onNewPost();
    else if (key === "task") onNewTask();
    else if (key === "campaign") onNewCampaign();
  }

  return (
    <div ref={containerRef} className="fixed bottom-6 right-6 z-30 flex flex-col items-end gap-3">
      {/* Sub-buttons */}
      {SUB_BUTTONS.map((btn, i) => {
        const Icon = btn.icon;
        // Stagger: first item (top) has longest delay, last (bottom) shortest
        const delayMs = (SUB_BUTTONS.length - 1 - i) * 50;
        return (
          <div
            key={btn.key}
            className="flex items-center gap-2 transition-all duration-200"
            style={{
              opacity: open ? 1 : 0,
              transform: open ? "translateY(0)" : "translateY(16px)",
              transitionDelay: open ? `${delayMs}ms` : "0ms",
              pointerEvents: open ? "auto" : "none",
            }}
          >
            {/* Tooltip */}
            <span className="rounded-lg bg-gray-900 px-2.5 py-1 text-xs font-medium text-white shadow-lg whitespace-nowrap">
              {btn.label}
            </span>
            {/* Button */}
            <button
              onClick={() => handleAction(btn.key)}
              className={`flex h-12 w-12 items-center justify-center rounded-full text-white shadow-md transition-colors ${btn.bg}`}
            >
              <Icon className="h-5 w-5" />
            </button>
          </div>
        );
      })}

      {/* Main FAB */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lg transition-transform duration-200 hover:bg-brand-hover"
      >
        <Plus
          className={`h-6 w-6 transition-transform duration-200 ${open ? "rotate-45" : "rotate-0"}`}
        />
      </button>
    </div>
  );
}
