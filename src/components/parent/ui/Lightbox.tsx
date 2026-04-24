"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

interface LightboxProps {
  urls: string[];
  /** Index to open on; pass `null` to keep it closed. */
  openIndex: number | null;
  onClose: () => void;
}

/**
 * Fullscreen photo viewer for parent timeline posts.
 * Keyboard: Escape closes, Arrow keys step with clamp (no wraparound).
 * Touch: horizontal swipe > 50 px advances; vertical swipe-down > 80 px closes.
 * Backdrop clicks close. Clicks on the image itself do not — parents can long-
 * press to use the native Save Image action.
 */
export function Lightbox({ urls, openIndex, onClose }: LightboxProps) {
  const [index, setIndex] = useState(openIndex ?? 0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (openIndex !== null) setIndex(openIndex);
  }, [openIndex]);

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  const goNext = useCallback(() => {
    setIndex((i) => Math.min(urls.length - 1, i + 1));
  }, [urls.length]);

  useEffect(() => {
    if (openIndex === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openIndex, onClose, goPrev, goNext]);

  if (openIndex === null) return null;
  const currentUrl = urls[index];
  if (!currentUrl) return null;

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    touchStart.current = null;
    // Prefer the dominant axis so a diagonal drag resolves to one gesture.
    if (Math.abs(dy) > 80 && dy > 0 && Math.abs(dy) > Math.abs(dx)) {
      onClose();
      return;
    }
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) goNext();
      else goPrev();
    }
  }

  const atFirst = index <= 0;
  const atLast = index >= urls.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      data-testid="lightbox-backdrop"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-4 right-4 inline-flex items-center justify-center w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white"
      >
        <X className="w-5 h-5" />
      </button>

      {!atFirst && (
        <button
          type="button"
          aria-label="Previous"
          onClick={(e) => {
            e.stopPropagation();
            goPrev();
          }}
          className="absolute left-3 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={currentUrl}
        alt={`Photo ${index + 1} of ${urls.length}`}
        onClick={(e) => e.stopPropagation()}
        draggable={false}
        className="max-h-[90vh] max-w-[92vw] object-contain select-none motion-safe:transition-opacity motion-safe:duration-150"
      />

      {!atLast && (
        <button
          type="button"
          aria-label="Next"
          onClick={(e) => {
            e.stopPropagation();
            goNext();
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      <div className="absolute bottom-6 left-0 right-0 flex justify-center text-white/90 text-sm">
        {index + 1} of {urls.length}
      </div>
    </div>
  );
}
