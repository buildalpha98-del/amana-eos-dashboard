"use client";

/**
 * A textarea that grows to fit what's in it.
 *
 * WHY: during an L10 the notes on an issue or a to-do get read aloud off
 * a shared screen. A fixed four-line box means whoever's driving scrolls
 * inside it while everyone else watches two lines at a time — and a
 * resize handle only helps the person holding the mouse, once they know
 * it's there.
 *
 * Growing beats dragging: the notes are simply all visible.
 *
 * Still manually resizable (`resize-y`), so anyone who wants a specific
 * size can set one — the auto-grow only ever raises the height to fit
 * content, it never fights a height the user chose.
 */

import { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

interface Props
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "rows"> {
  /** Smallest height, in CSS pixels. Generous by default — see above. */
  minHeight?: number;
  /**
   * Stop growing here and scroll instead. Without a cap a pasted essay
   * pushes the buttons under it off the screen.
   */
  maxHeight?: number;
}

export function AutoGrowTextarea({
  minHeight = 140,
  maxHeight = 600,
  className,
  onChange,
  value,
  ...rest
}: Props) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const fit = useCallback(
    (el: HTMLTextAreaElement | null) => {
      if (!el) return;
      // Collapse first: scrollHeight only shrinks if the element isn't
      // already holding the taller height open.
      el.style.height = "auto";
      const next = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight);
      el.style.height = `${next}px`;
      el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
    },
    [minHeight, maxHeight],
  );

  return (
    <textarea
      {...rest}
      value={value}
      // Ref callback rather than an effect: this runs when the node
      // mounts AND whenever it's replaced, with no render pass in
      // between, so the box is never briefly the wrong size.
      ref={(el) => {
        ref.current = el;
        fit(el);
      }}
      onChange={(e) => {
        fit(e.currentTarget);
        onChange?.(e);
      }}
      style={{ minHeight }}
      className={cn("resize-y", className)}
    />
  );
}
