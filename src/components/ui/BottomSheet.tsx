"use client";

import { useEffect, useRef, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Check, type LucideIcon } from "lucide-react";

// ─── BottomSheet ─────────────────────────────────────────

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const currentY = useRef(0);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Swipe-to-dismiss
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const delta = e.touches[0].clientY - startY.current;
    currentY.current = delta;
    if (delta > 0 && sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${delta}px)`;
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    if (sheetRef.current) {
      sheetRef.current.style.transform = "";
    }
    if (currentY.current > 100) {
      onClose();
    }
    currentY.current = 0;
  }, [onClose]);

  if (typeof window === "undefined") return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-50 bg-black/40 transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title || "Actions"}
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 bg-card rounded-t-2xl shadow-lg transition-transform duration-300 ease-out",
          "max-h-[70vh] overflow-y-auto",
          open ? "translate-y-0" : "translate-y-full"
        )}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Title */}
        {title && (
          <div className="px-5 pb-2">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          </div>
        )}

        {/* Content */}
        <div className="px-2 pb-4">{children}</div>
      </div>
    </>,
    document.body
  );
}

// ─── BottomSheetItem ─────────────────────────────────────

interface BottomSheetItemProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
  destructive?: boolean;
  disabled?: boolean;
}

export function BottomSheetItem({
  icon: Icon,
  label,
  onClick,
  active = false,
  destructive = false,
  disabled = false,
}: BottomSheetItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium transition-colors min-h-[48px]",
        destructive
          ? "text-danger hover:bg-danger/5"
          : "text-foreground hover:bg-surface",
        disabled && "opacity-40 cursor-not-allowed"
      )}
    >
      <Icon className="w-5 h-5 shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      {active && <Check className="w-4 h-4 text-brand shrink-0" />}
    </button>
  );
}
