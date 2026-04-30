"use client";

import Image from "next/image";

interface Props {
  urls: string[];
  onOpen: (index: number) => void;
}

type Layout = "single" | "double" | "triple" | "quad";

function pickLayout(n: number): Layout | null {
  if (n <= 0) return null;
  if (n === 1) return "single";
  if (n === 2) return "double";
  if (n === 3) return "triple";
  return "quad";
}

const GRID_CLASS: Record<Layout, string> = {
  single: "",
  double: "grid grid-cols-2 gap-0.5",
  triple: "grid grid-cols-2 grid-rows-2 gap-0.5",
  quad: "grid grid-cols-2 grid-rows-2 gap-0.5",
};

export function TimelinePostMedia({ urls, onOpen }: Props) {
  const layout = pickLayout(urls.length);
  if (!layout) return null;

  // The quad layout always shows exactly 4 tiles; 5+ gets a "+N" overlay on
  // the last visible tile. Other layouts show all of their urls.
  const visibleCount = layout === "quad" ? 4 : urls.length;
  const overflow = urls.length - visibleCount;

  function tileClass(i: number): string {
    if (layout === "single") return "aspect-video";
    if (layout === "triple" && i === 0) return "row-span-2 aspect-square";
    return "aspect-square";
  }

  return (
    <div
      data-testid="gallery"
      data-layout={layout}
      className={`mt-3 rounded-xl overflow-hidden ${GRID_CLASS[layout]}`}
    >
      {urls.slice(0, visibleCount).map((url, i) => {
        const overlayOnThis = layout === "quad" && i === 3 && overflow > 0;
        return (
          <button
            key={`${url}-${i}`}
            type="button"
            aria-label={`View photo ${i + 1}`}
            onClick={() => onOpen(i)}
            className={`relative overflow-hidden ${tileClass(i)}`}
          >
            <Image
              src={url}
              alt=""
              fill
              sizes="(max-width: 640px) 100vw, 640px"
              className="object-cover"
            />
            {overlayOnThis && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-lg font-semibold">
                +{overflow}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
