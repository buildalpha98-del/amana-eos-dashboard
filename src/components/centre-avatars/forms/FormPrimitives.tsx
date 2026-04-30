"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  useState,
  type ReactElement,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import { X } from "lucide-react";

/**
 * Shared form-shell primitives for the 4 Centre Avatar section editors.
 *
 * Designed to be lightweight wrappers over native inputs — no third-party form
 * library. Akram should be able to skim a form and know what to type without
 * thinking about JSON shape.
 */

// ---------------------------------------------------------------------------
// <Field>: label + helper + child input
// ---------------------------------------------------------------------------

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  // Inject `id={id}` into the first labelable child so the <label htmlFor=...>
  // properly associates with the input. Falls back to a wrapping <label> if
  // the child isn't a single element.
  let labelled: ReactNode = children;
  const arr = Children.toArray(children);
  if (arr.length === 1 && isValidElement(arr[0])) {
    const child = arr[0] as ReactElement<{ id?: string }>;
    if (!child.props.id) {
      labelled = cloneElement(child, { id });
    }
  }
  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="mb-1 block text-xs font-medium text-foreground/80"
      >
        {label}
      </label>
      {labelled}
      {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// <FieldGroup>: titled group of fields
// ---------------------------------------------------------------------------

export function FieldGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="rounded-lg border border-border bg-surface/30 p-3">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-foreground/70">
        {title}
      </legend>
      <div className="mt-2 space-y-3">{children}</div>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// <TextField>: label + input
// ---------------------------------------------------------------------------

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  type = "text",
  maxLength,
  className,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  hint?: string;
  type?: "text" | "email" | "tel" | "url";
  maxLength?: number;
  className?: string;
}) {
  return (
    <Field label={label} hint={hint} className={className}>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
      />
    </Field>
  );
}

// ---------------------------------------------------------------------------
// <NumberField>: label + numeric input
// ---------------------------------------------------------------------------

export function NumberField({
  label,
  value,
  onChange,
  hint,
  min,
  max,
  step,
  className,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (next: number | null) => void;
  hint?: string;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}) {
  return (
    <Field label={label} hint={hint} className={className}>
      <input
        type="number"
        value={value ?? ""}
        onChange={(e) => {
          const v = e.target.value.trim();
          if (v === "") return onChange(null);
          const n = Number(v);
          if (Number.isFinite(n)) onChange(n);
        }}
        min={min}
        max={max}
        step={step}
        className="w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
      />
    </Field>
  );
}

// ---------------------------------------------------------------------------
// <TextArea>: label + multi-line input
// ---------------------------------------------------------------------------

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  hint,
  rows = 3,
  maxLength,
  className,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  hint?: string;
  rows?: number;
  maxLength?: number;
  className?: string;
}) {
  return (
    <Field label={label} hint={hint} className={className}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
      />
    </Field>
  );
}

// ---------------------------------------------------------------------------
// <CheckboxField>: label + checkbox
// ---------------------------------------------------------------------------

export function CheckboxField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-xs">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
      />
      <span>
        {label}
        {hint && <span className="ml-1 text-muted">({hint})</span>}
      </span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// <TagListInput>: chips for string[] fields (e.g. snapshot.parentDrivers)
// ---------------------------------------------------------------------------

export function TagListInput({
  label,
  values,
  onChange,
  placeholder = "Type and press Enter",
  hint,
  maxLength,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  hint?: string;
  maxLength?: number;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (values.includes(trimmed)) {
      setDraft("");
      return;
    }
    onChange([...values, trimmed]);
    setDraft("");
  };

  const remove = (idx: number) => {
    onChange(values.filter((_, i) => i !== idx));
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && draft === "" && values.length > 0) {
      remove(values.length - 1);
    }
  };

  return (
    <Field label={label} hint={hint}>
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5 text-sm focus-within:border-brand focus-within:ring-1 focus-within:ring-brand">
        {values.map((v, i) => (
          <span
            key={`${v}-${i}`}
            className="inline-flex items-center gap-1 rounded-md bg-brand/10 px-2 py-0.5 text-xs text-brand"
          >
            {v}
            <button
              type="button"
              onClick={() => remove(i)}
              className="rounded hover:bg-brand/20"
              aria-label={`Remove ${v}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={add}
          placeholder={values.length === 0 ? placeholder : ""}
          maxLength={maxLength}
          className="flex-1 min-w-[120px] bg-transparent px-1 py-0.5 text-sm outline-none"
        />
      </div>
    </Field>
  );
}

// ---------------------------------------------------------------------------
// Form action bar — used at the bottom of every section form
// ---------------------------------------------------------------------------

export function FormActions({
  onSave,
  onCancel,
  isSaving,
  saveLabel = "Save",
  cancelLabel = "Cancel",
}: {
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
  saveLabel?: string;
  cancelLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
      <p className="text-[11px] text-muted">
        <kbd className="rounded bg-surface px-1 py-0.5 font-mono">⌘</kbd>
        <kbd className="ml-0.5 rounded bg-surface px-1 py-0.5 font-mono">↵</kbd> save ·{" "}
        <kbd className="rounded bg-surface px-1 py-0.5 font-mono">Esc</kbd> cancel
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-surface"
        >
          {cancelLabel}
        </button>
        <button
          type="submit"
          onClick={onSave}
          disabled={isSaving}
          className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-50"
        >
          {isSaving ? "Saving..." : saveLabel}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers — form data <-> section content
// ---------------------------------------------------------------------------

/**
 * Trim a payload before saving. Critically: a field the user CLEARED must
 * become `null` in the payload (NOT a missing key), otherwise the server's
 * deep-merge will preserve the old value and the user's deletion is silently
 * undone. So:
 *   - empty strings → `null` (preserves the key as a clear-signal)
 *   - empty arrays  → kept as `[]` (so deep-merge replaces the array)
 *   - missing keys are still missing (deep-merge preserves siblings)
 */
export function stripEmpty<T>(input: T): T {
  if (input === null || input === undefined) return input;
  if (typeof input === "string") {
    const trimmed = input.trim();
    return (trimmed === "" ? null : trimmed) as T;
  }
  if (Array.isArray(input)) {
    const cleaned = input
      .map((v) => stripEmpty(v))
      .filter((v) => v !== null && v !== undefined && !(typeof v === "string" && v === ""));
    return cleaned as T;
  }
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      const cleaned = stripEmpty(v);
      // Keep nulls — they're explicit clear-signals for the server-side merge.
      // Drop only undefined (uninitialized) values.
      if (cleaned === undefined) continue;
      out[k] = cleaned;
    }
    return out as T;
  }
  return input;
}

/**
 * Hook section-level keyboard shortcuts (Cmd/Ctrl+Enter, Esc).
 * Wire this on the form's outer container.
 */
export function useSectionShortcuts(handlers: { save: () => void; cancel: () => void }) {
  return (e: KeyboardEvent<HTMLElement>) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === "Enter" || e.key === "s")) {
      e.preventDefault();
      handlers.save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handlers.cancel();
    }
  };
}
