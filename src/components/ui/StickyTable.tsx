"use client";

import { useRef, useState, useEffect, useCallback, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StickyTableProps {
  children: ReactNode;
  maxHeight?: string; // default "calc(100vh - 280px)"
}

/**
 * Wraps a `<table>` element to provide:
 * - Sticky `<thead>` that stays at the top while scrolling vertically
 * - Vertical scroll with configurable max-height
 * - Horizontal scroll on overflow
 * - Header shadow that appears when scrolled
 * - Mobile "scroll for more" hint that fades after 2 seconds
 */
export function StickyTable({
  children,
  maxHeight = "calc(100vh - 280px)",
}: StickyTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [showScrollHint, setShowScrollHint] = useState(false);

  // Detect vertical scroll to apply header shadow
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setIsScrolled(el.scrollTop > 0);
  }, []);

  // Apply sticky styles to thead and shadow when scrolled
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const thead = el.querySelector("thead");
    if (!thead) return;

    // Make thead sticky
    thead.style.position = "sticky";
    thead.style.top = "0";
    thead.style.zIndex = "10";

    // Ensure th cells have opaque background
    const ths = thead.querySelectorAll("th");
    ths.forEach((th) => {
      const computed = getComputedStyle(th);
      // Only set bg if it's transparent
      if (
        computed.backgroundColor === "rgba(0, 0, 0, 0)" ||
        computed.backgroundColor === "transparent"
      ) {
        th.style.backgroundColor = "var(--color-card, #ffffff)";
      }
    });

    // Ensure the header row has a background
    const headerRows = thead.querySelectorAll("tr");
    headerRows.forEach((tr) => {
      const computed = getComputedStyle(tr);
      if (
        computed.backgroundColor === "rgba(0, 0, 0, 0)" ||
        computed.backgroundColor === "transparent"
      ) {
        tr.style.backgroundColor = "var(--color-card, #ffffff)";
      }
    });
  }, [children]);

  // Apply / remove shadow on thead when scrolled
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const thead = el.querySelector("thead");
    if (!thead) return;

    if (isScrolled) {
      thead.style.boxShadow = "var(--shadow-warm-sm)";
    } else {
      thead.style.boxShadow = "none";
    }
  }, [isScrolled]);

  // Check if horizontal overflow exists and show mobile hint
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const timeout = setTimeout(() => {
      if (el.scrollWidth > el.clientWidth) {
        setShowScrollHint(true);
        setTimeout(() => setShowScrollHint(false), 2000);
      }
    }, 100);

    return () => clearTimeout(timeout);
  }, []);

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{ maxHeight }}
        className="overflow-auto overscroll-contain sticky-table-scroll"
      >
        {children}
      </div>

      {/* Mobile scroll hint */}
      <div
        className={cn(
          "absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none sm:hidden",
          "flex items-center gap-1 px-2 py-1 rounded-full bg-[color:var(--color-brand)]/80 text-white text-xs font-medium",
          "transition-opacity duration-500",
          showScrollHint ? "opacity-100" : "opacity-0"
        )}
      >
        Scroll
        <span aria-hidden="true">&rarr;</span>
      </div>
    </div>
  );
}
