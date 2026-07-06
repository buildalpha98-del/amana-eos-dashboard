"use client";

/**
 * CentreDot / CentreChip — the visible half of the centre colour
 * identity (2026-07-06 design system). Use the dot next to a centre
 * name in lists/tables; use the chip where the centre IS the label.
 */

import { centreColor } from "@/lib/centre-colors";
import { cn } from "@/lib/utils";

export function CentreDot({
  code,
  className,
}: {
  /** Service code (preferred — stable) or name. */
  code: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block h-2 w-2 flex-shrink-0 rounded-full", className)}
      style={{ backgroundColor: centreColor(code).hex }}
    />
  );
}

export function CentreChip({
  code,
  name,
  className,
}: {
  code: string;
  /** Display text; defaults to the code. */
  name?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        centreColor(code).chip,
        className,
      )}
    >
      <CentreDot code={code} />
      {name ?? code}
    </span>
  );
}
