"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Lightbox } from "./Lightbox";

export interface MessageAttachmentGridProps {
  urls: string[];
  /** Tone of the surrounding bubble — adjusts border colour. */
  tone?: "sent" | "received";
  className?: string;
}

/**
 * Render 1..N image attachments as a compact grid under a message bubble.
 * Tapping any image opens the shared Lightbox.
 *
 * Layout:
 *   1  → single image, capped height
 *   2  → 2 columns
 *   3  → first image full-width, two below
 *   4+ → 2x2 with +N overlay on the last tile if count > 4
 */
export function MessageAttachmentGrid({
  urls,
  tone = "received",
  className,
}: MessageAttachmentGridProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (urls.length === 0) return null;

  const borderClass =
    tone === "sent" ? "border-white/25" : "border-black/10";
  const tileBase = cn(
    "relative overflow-hidden rounded-md border bg-black/5",
    borderClass,
  );

  const tiles: { url: string; displayIndex: number; showOverlay?: number }[] = [];
  const visible = urls.slice(0, 4);
  visible.forEach((url, i) => {
    tiles.push({ url, displayIndex: i });
  });
  if (urls.length > 4) {
    // tag the last visible tile with overlay count
    tiles[tiles.length - 1]!.showOverlay = urls.length - 4;
  }

  // Grid layout via classes — 1/2/3+ cases
  let gridClass = "grid gap-1";
  if (urls.length === 1) {
    gridClass = "grid grid-cols-1 gap-1";
  } else if (urls.length === 2) {
    gridClass = "grid grid-cols-2 gap-1";
  } else if (urls.length === 3) {
    gridClass = "grid grid-cols-2 grid-rows-2 gap-1";
  } else {
    gridClass = "grid grid-cols-2 grid-rows-2 gap-1";
  }

  return (
    <>
      <div
        className={cn(gridClass, "mt-1.5 max-w-[280px]", className)}
        role="group"
        aria-label={`${urls.length} attachment${urls.length === 1 ? "" : "s"}`}
      >
        {tiles.map((tile, i) => {
          const isHeroIn3 = urls.length === 3 && i === 0;
          return (
            <button
              key={`${tile.url}-${i}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpenIndex(tile.displayIndex);
              }}
              aria-label={`Open attachment ${i + 1}`}
              className={cn(
                tileBase,
                "transition-transform active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#004E64]",
                urls.length === 1 && "aspect-[4/3]",
                urls.length === 2 && "aspect-square",
                isHeroIn3 && "col-span-2 aspect-[2/1]",
                urls.length === 3 && i > 0 && "aspect-square",
                urls.length >= 4 && "aspect-square",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={tile.url}
                alt=""
                loading="lazy"
                draggable={false}
                className="w-full h-full object-cover"
              />
              {tile.showOverlay ? (
                <span className="absolute inset-0 bg-black/55 text-white flex items-center justify-center text-base font-semibold">
                  +{tile.showOverlay}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <Lightbox urls={urls} index={openIndex} onChange={setOpenIndex} />
    </>
  );
}
