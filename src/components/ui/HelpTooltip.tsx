"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface HelpTooltipProps {
  /** The help text to display */
  content: string;
  /** Unique ID for localStorage dismissal tracking */
  id?: string;
  className?: string;
}

function isDismissed(id: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(`help-tooltip-dismissed:${id}`) === "1";
  } catch {
    return false;
  }
}

function dismiss(id: string) {
  try {
    localStorage.setItem(`help-tooltip-dismissed:${id}`, "1");
  } catch {
    // localStorage unavailable
  }
}

export function HelpTooltip({ content, id, className }: HelpTooltipProps) {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Check localStorage on mount
  useEffect(() => {
    if (id && isDismissed(id)) {
      setDismissed(true);
    }
  }, [id]);

  // Auto-flip if tooltip would overflow top of viewport
  useEffect(() => {
    if (visible && tooltipRef.current) {
      const rect = tooltipRef.current.getBoundingClientRect();
      if (rect.top < 8) {
        setFlipped(true);
      } else {
        setFlipped(false);
      }
    }
  }, [visible]);

  // Click outside to dismiss (mobile)
  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setVisible(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (visible) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [visible, handleClickOutside]);

  const handleGotIt = () => {
    if (id) {
      dismiss(id);
      setDismissed(true);
    }
    setVisible(false);
  };

  return (
    <span className={cn("relative inline-flex items-center", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setVisible((v) => !v)}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        className={cn(
          "inline-flex items-center justify-center w-4 h-4 text-muted-foreground hover:text-brand transition-colors focus:outline-none",
          !dismissed && "animate-pulse",
        )}
        aria-label="Help"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>

      {visible && (
        <div
          ref={tooltipRef}
          role="tooltip"
          className={cn(
            "absolute left-1/2 -translate-x-1/2 z-50 bg-foreground text-background rounded-lg p-3 text-sm max-w-xs shadow-lg whitespace-normal",
            flipped ? "top-full mt-2" : "bottom-full mb-2",
          )}
        >
          <p className="leading-relaxed">{content}</p>
          {id && !dismissed && (
            <button
              onClick={handleGotIt}
              className="mt-2 text-xs font-medium text-background/70 hover:text-background underline underline-offset-2 transition-colors"
            >
              Got it
            </button>
          )}
          {/* Arrow */}
          <div
            className={cn(
              "absolute left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-l-transparent border-r-transparent",
              flipped
                ? "bottom-full border-b-4 border-b-foreground"
                : "top-full border-t-4 border-t-foreground",
            )}
          />
        </div>
      )}
    </span>
  );
}
