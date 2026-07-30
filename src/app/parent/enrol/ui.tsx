"use client";

/**
 * Shared form primitives for the parent enrolment wizard.
 *
 * Extracted when steps 2-5 were built: the same input class string and
 * yes/no pair had already been copied once, and five copies of a focus
 * ring is exactly how a form ends up subtly inconsistent.
 */

import { useRef, useState, type ReactNode } from "react";
import { Upload, FileCheck2, X, Loader2 } from "lucide-react";
import type { DraftUpload } from "@/lib/enrol-draft";

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

/**
 * A yes/no screening question with its guidance shown only once answered
 * "yes" — the guidance is long, and rendering all of it up front turns the
 * medical section into a wall of text nobody reads.
 */
export function ScreeningQuestion({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: boolean | null | undefined;
  onChange: (v: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <p className="text-sm font-medium text-foreground sm:pr-6 min-w-0">
          {label}
          <Req />
        </p>
        <div className="shrink-0">
          <YesNo label={label} value={value} onChange={onChange} />
        </div>
      </div>
      {value === true && children && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-900 dark:text-amber-100 leading-relaxed space-y-1.5">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Single-file upload posting to /api/parent/upload.
 *
 * Uploads immediately rather than at submit: the file lands in blob
 * storage and only its URL goes into the autosaved draft, so a parent who
 * closes the tab doesn't have to re-attach their child's birth
 * certificate.
 */
export function FileUploadField({
  label,
  type,
  required,
  hint,
  value,
  onChange,
}: {
  label: string;
  type: string;
  required?: boolean;
  hint?: string;
  value: DraftUpload | undefined;
  onChange: (u: DraftUpload | undefined) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", type);
      const res = await fetch("/api/parent/upload", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Upload failed.");
      onChange({ type, filename: json.filename, url: json.url });
    } catch (e) {
      // Shown inline, next to the field. A toast would scroll away from
      // the thing that failed.
      setError(e instanceof Error ? e.message : "We couldn't upload that file.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <span className="block text-sm font-medium text-foreground mb-1">
        {label}
        {required && <Req />}
      </span>

      {value ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5">
          <FileCheck2 className="w-4 h-4 text-green-600 shrink-0" />
          <span className="text-sm text-foreground truncate min-w-0 flex-1">
            {value.filename}
          </span>
          <button
            type="button"
            onClick={() => onChange(undefined)}
            aria-label={`Remove ${label}`}
            className="text-muted hover:text-red-600 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-border text-sm text-muted hover:border-brand hover:text-brand disabled:opacity-50"
        >
          {busy ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
          ) : (
            <><Upload className="w-4 h-4" /> Choose a file or take a photo</>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/heic,image/heif,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void pick(f);
        }}
      />

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
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
