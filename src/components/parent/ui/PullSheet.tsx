"use client";

import { Drawer } from "vaul";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const SNAP_POINTS = [0.2, 0.6, 0.95] as const;

interface PullSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapPoints?: readonly (number | string)[];
  activeSnapPoint?: number | string | null;
  onActiveSnapPointChange?: (snap: number | string | null) => void;
  children: ReactNode;
  className?: string;
}

export function PullSheet({
  open,
  onOpenChange,
  snapPoints = SNAP_POINTS,
  activeSnapPoint,
  onActiveSnapPointChange,
  children,
  className,
}: PullSheetProps) {
  return (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      snapPoints={[...snapPoints]}
      activeSnapPoint={activeSnapPoint ?? snapPoints[1]}
      setActiveSnapPoint={onActiveSnapPointChange ?? (() => {})}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/30 z-40" />
        <Drawer.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex flex-col bg-[color:var(--color-cream-soft)] rounded-t-[var(--radius-xl)] border-t border-[color:var(--color-border)] shadow-[var(--shadow-warm-lg)]",
            "focus:outline-none",
            className,
          )}
          style={{ maxHeight: "95dvh" }}
        >
          <div
            className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-[color:var(--color-border)] shrink-0"
            aria-hidden="true"
          />
          <Drawer.Title className="sr-only">Bottom sheet</Drawer.Title>
          <Drawer.Description className="sr-only">
            Swipe down to dismiss or drag to resize.
          </Drawer.Description>
          <div className="overflow-y-auto flex-1 px-4 pb-6 pt-4">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
