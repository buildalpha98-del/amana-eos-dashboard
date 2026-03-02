"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  CheckSquare,
  AlertCircle,
  Mountain,
  Presentation,
} from "lucide-react";

const quickItems = [
  { label: "New To-Do", icon: CheckSquare, href: "/todos?create=true" },
  { label: "New Issue", icon: AlertCircle, href: "/issues?create=true" },
  { label: "New Rock", icon: Mountain, href: "/rocks?create=true" },
  { label: "New Meeting", icon: Presentation, href: "/meetings?create=true" },
];

export function QuickAddMenu({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, onClose]);

  if (!open) return null;

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
            onClick={() => {
              router.push(item.href);
              onClose();
            }}
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
