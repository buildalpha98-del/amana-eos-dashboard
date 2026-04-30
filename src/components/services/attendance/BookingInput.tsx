"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  value: number;
  onCommit: (next: number) => void;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Numeric cell input tuned for the weekly attendance grid.
 *
 * Why a text+inputMode input instead of type="number":
 *   - Avoids browser quirks (scroll wheel changes the value, mini spinners).
 *   - Still gets the mobile numeric keyboard via inputMode="numeric".
 *
 * Why onFocus selects all + string draft state:
 *   - The old type="number" input obstructed typing over an existing "0":
 *     centre managers would see "025" or only register single digits.
 *     Selecting on focus means typing replaces rather than appends.
 *   - A string draft allows the user to clear the field temporarily without
 *     it snapping back to 0 mid-edit.
 *
 * Commit happens on blur (not every keystroke) so typing "150" doesn't fire
 * three mutations.
 */
export function BookingInput({
  value,
  onCommit,
  ariaLabel,
  className,
  disabled,
}: Props) {
  const [draft, setDraft] = useState<string>(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={3}
      disabled={disabled}
      value={draft}
      aria-label={ariaLabel}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const cleaned = e.target.value.replace(/[^0-9]/g, "");
        setDraft(cleaned);
      }}
      onBlur={() => {
        const parsed = draft === "" ? 0 : parseInt(draft, 10);
        const safe = Number.isNaN(parsed) ? 0 : Math.min(Math.max(parsed, 0), 999);
        setDraft(String(safe));
        if (safe !== value) onCommit(safe);
      }}
      className={cn(
        "w-16 text-center text-sm border border-border rounded-md px-1 py-1",
        "focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
    />
  );
}
