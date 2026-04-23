"use client";

import { useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LightboxProps {
  /** List of image URLs. */
  urls: string[];
  /** Currently shown index, or null to close. */
  index: number | null;
  /** Called with the new index, or null to close. */
  onChange: (next: number | null) => void;
}

/**
 * Minimal fullscreen image viewer used by message attachment grids.
 * Supports keyboard (Esc/Arrow) and swipe-via-buttons navigation.
 */
export function Lightbox({ urls, index, onChange }: LightboxProps) {
  const close = useCallback(() => onChange(null), [onChange]);

  const prev = useCallback(() => {
    if (index === null || urls.length === 0) return;
    const next = (index - 1 + urls.length) % urls.length;
    onChange(next);
  }, [index, urls.length, onChange]);

  const next = useCallback(() => {
    if (index === null || urls.length === 0) return;
    const n = (index + 1) % urls.length;
    onChange(n);
  }, [index, urls.length, onChange]);

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    // Lock body scroll while open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [index, close, prev, next]);

  if (index === null) return null;
  const currentUrl = urls[index];
  if (!currentUrl) return null;
  const showNav = urls.length > 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Attachment viewer"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 touch-none"
      onClick={close}
    >
      {/* Close */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          close();
        }}
        className="absolute top-4 right-4 inline-flex items-center justify-center w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white min-w-[44px] min-h-[44px]"
        aria-label="Close viewer"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Prev / Next */}
      {showNav && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            className="absolute left-3 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white"
            aria-label="Previous image"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white"
            aria-label="Next image"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}

      {/* Counter */}
      {showNav && (
        <span className="absolute top-4 left-4 text-white/80 text-xs font-medium bg-white/10 rounded-full px-3 py-1">
          {index + 1} / {urls.length}
        </span>
      )}

      {/* Image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={currentUrl}
        alt={`Attachment ${index + 1} of ${urls.length}`}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "max-w-[95vw] max-h-[90vh] object-contain select-none",
          "rounded-lg shadow-2xl",
        )}
        draggable={false}
      />
    </div>
  );
}
