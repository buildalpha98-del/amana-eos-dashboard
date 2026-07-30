"use client";

/**
 * Shared form primitives for the parent enrolment wizard.
 *
 * Extracted when steps 2-5 were built: the same input class string and
 * yes/no pair had already been copied once, and five copies of a focus
 * ring is exactly how a form ends up subtly inconsistent.
 */

import type { ReactNode } from "react";

export const field =
  "w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand";

export function Req() {
  return <span className="text-red-500"> *</span>;
}

export function Field({
  id,
  label,
  required,
  hint,
  children,
  className,
}: {
  id?: string;
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="block text-sm font-medium text-foreground mb-1"
      >
        {label}
        {required && <Req />}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-foreground pt-3 border-t border-border">
      {children}
    </h3>
  );
}

export function YesNo({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null | undefined;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex gap-2" role="group" aria-label={label}>
      {[
        { v: true, t: "Yes" },
        { v: false, t: "No" },
      ].map((opt) => (
        <button
          key={opt.t}
          type="button"
          onClick={() => onChange(opt.v)}
          aria-pressed={value === opt.v}
          className={
            "px-4 py-2 rounded-lg border text-sm font-medium transition-colors " +
            (value === opt.v
              ? "border-brand bg-brand/10 text-brand"
              : "border-border bg-card text-muted hover:border-brand/40")
          }
        >
          {opt.t}
        </button>
      ))}
    </div>
  );
}

/** A removable sub-record (a child, a contact) with a consistent frame. */
export function RepeatCard({
  title,
  onRemove,
  removeLabel,
  children,
}: {
  title: string;
  onRemove?: () => void;
  removeLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-red-600 hover:underline"
          >
            {removeLabel ?? "Remove"}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
