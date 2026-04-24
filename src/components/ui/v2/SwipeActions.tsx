"use client";

import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Action {
  label: string;
  tone?: "neutral" | "danger";
  onPress: () => void;
}

interface SwipeActionsProps {
  children: ReactNode;
  actions: Action[];
  /** Pixels of reveal per action. Default 80. */
  actionWidth?: number;
  className?: string;
}

const SNAP_THRESHOLD = 0.4; // >= 40% of full reveal snaps open, else snaps closed

export function SwipeActions({
  children,
  actions,
  actionWidth = 80,
  className,
}: SwipeActionsProps) {
  const [offset, setOffset] = useState(0);
  const startX = useRef<number | null>(null);
  const activeOffset = useRef(0);
  const fullReveal = actionWidth * actions.length;

  const onPointerDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
    activeOffset.current = offset;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (startX.current === null) return;
    const dx = e.clientX - startX.current;
    const next = Math.min(0, Math.max(-fullReveal, activeOffset.current + dx));
    setOffset(next);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (startX.current === null) return;
    startX.current = null;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    setOffset((curr) => (Math.abs(curr) > fullReveal * SNAP_THRESHOLD ? -fullReveal : 0));
  };

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className="flex transition-transform duration-200 ease-out"
        style={{ transform: `translateX(${offset}px)` }}
      >
        <div className="w-full shrink-0">{children}</div>
      </div>
      <div
        className="absolute right-0 top-0 bottom-0 flex"
        style={{
          width: `${fullReveal}px`,
          transform: `translateX(${fullReveal + offset}px)`,
        }}
        aria-hidden={offset === 0}
      >
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={() => {
              a.onPress();
              setOffset(0);
            }}
            className={cn(
              "flex items-center justify-center text-xs font-semibold text-white px-2",
              a.tone === "danger"
                ? "bg-[color:var(--color-danger)]"
                : "bg-[color:var(--color-muted)]",
            )}
            style={{ width: `${actionWidth}px` }}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
