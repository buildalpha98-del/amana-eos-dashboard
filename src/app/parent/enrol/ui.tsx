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
import { ENROLMENTS_EMAIL, type DraftUpload } from "@/lib/enrol-draft";

/**
 * 4MB, sitting under the ~4.5MB request-body ceiling Vercel enforces on
 * serverless functions.
 *
 * This matters more than it looks: an oversized body is rejected by the
 * platform BEFORE our route runs, so a bigger limit in our own code is a
 * promise we can't keep — the parent just gets an opaque plain-text
 * rejection. Keep this and the server's MAX_SIZE in step.
 */
const MAX_UPLOAD_MB = 4;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

/** Longest edge for an uploaded photo. Plenty to read a certificate. */
const MAX_IMAGE_EDGE = 2000;

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);

/**
 * Downscale a photo in the browser before uploading.
 *
 * A modern phone camera produces 3-8MB images — well past what the
 * platform accepts — and a parent photographing a birth certificate has no
 * idea their camera is the problem. Re-encoding to a 2000px JPEG typically
 * lands under 1MB with the text still perfectly legible, and it uploads
 * far faster on mobile data.
 *
 * Anything we can't decode (PDFs, and HEIC on browsers that don't support
 * it) is returned untouched rather than failed — the size check downstream
 * still protects us.
 */
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  // Already small enough that re-encoding risks looking worse for no gain.
  if (file.size <= 1024 * 1024) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(
      1,
      MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    // HEIC on a browser without a decoder, a corrupt image, an OOM on a
    // huge panorama — fall back to the original and let size checks speak.
    return file;
  }
}

/**
 * `text-base` (16px) on purpose, NOT `text-sm`.
 *
 * iOS Safari auto-zooms into any input whose font is under 16px, and once
 * it zooms the page is left scrolled sideways with the parent hunting for
 * the rest of the form. On a form this long that happens on every single
 * field. Desktop steps back down to 14px via `sm:text-sm`.
 */
export const field =
  "w-full px-3 py-2.5 border border-border rounded-lg text-base sm:text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand";

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
            // min-h-11 ≈ 44px, the smallest comfortable tap target.
            "px-4 py-2 min-h-11 min-w-16 rounded-lg border text-sm font-medium transition-colors " +
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
    <div className="space-y-2 pb-4 border-b border-border last:border-b-0 sm:border-b-0 sm:pb-0">
      {/* gap-2 inside, divider outside: the Yes/No pair must read as
          belonging to the question ABOVE it. With even spacing it reads as
          belonging to the one below, which is how a parent grants
          ambulance consent to the wrong question. */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
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
      // Phone photos are routinely 3-8MB and the platform rejects anything
      // over ~4.5MB before our route ever runs. Shrink first.
      const prepared = await compressImage(file);

      if (prepared.size > MAX_UPLOAD_BYTES) {
        throw new Error(
          prepared.type === "application/pdf"
            ? `That PDF is ${mb(prepared.size)}MB and our limit is ${MAX_UPLOAD_MB}MB. Please upload a photo of the document instead, or email it to ${ENROLMENTS_EMAIL}.`
            : `That file is ${mb(prepared.size)}MB and our limit is ${MAX_UPLOAD_MB}MB. Please try a smaller copy.`,
        );
      }

      const fd = new FormData();
      fd.append("file", prepared);
      fd.append("type", type);
      const res = await fetch("/api/parent/upload", {
        method: "POST",
        body: fd,
      });

      // NEVER res.json() blindly. When the platform rejects an oversized
      // body it replies with plain text ("Request Entity Too Large"), and
      // parsing that as JSON is what produced the unreadable
      // "Unexpected token 'R'" error a parent saw.
      const raw = await res.text();
      let json: { error?: string; filename?: string; url?: string } = {};
      try {
        json = raw ? JSON.parse(raw) : {};
      } catch {
        if (!res.ok) {
          throw new Error(
            res.status === 413
              ? `That file is too large. Please keep uploads under ${MAX_UPLOAD_MB}MB.`
              : "We couldn't upload that file. Please try again.",
          );
        }
        throw new Error("We couldn't read the response. Please try again.");
      }

      if (!res.ok) throw new Error(json.error ?? "Upload failed.");
      onChange({ type, filename: json.filename!, url: json.url! });
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
            className="shrink-0 -mr-2 min-w-11 min-h-11 inline-flex items-center justify-center text-muted hover:text-red-600"
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
    <div className="rounded-lg border border-border p-3 sm:p-4 space-y-4">
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
