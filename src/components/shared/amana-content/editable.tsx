"use client";

/**
 * Inline-editable wrappers used inside The Amana Way + Educators Handbook
 * panels. They consume `AmanaContentContext` (see ./AmanaContentContext.tsx)
 * to decide whether to render the override value, the default, or an
 * editable input.
 *
 * In view mode (or when no provider is mounted) the wrappers render a
 * plain string / image and add zero visual chrome — output is identical
 * to the original hardcoded JSX.
 *
 * 2026-05-15: Amana Way editable content + Educators Handbook embed.
 */

import React, {
  createElement,
  type CSSProperties,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useAmanaContent } from "./AmanaContentContext";

// ── shared chrome colours (mirror the panels' palette) ────────────
const EDIT_OUTLINE = "1px dashed rgba(245,166,35,0.7)";
const EDIT_OUTLINE_HOVER = "1px solid rgba(245,166,35,1)";

// ─────────────────────────────────────────────────────────────────────────────
// <E k="..."> — inline editable text
// ─────────────────────────────────────────────────────────────────────────────

interface ETextProps {
  /** Unique key used to persist the override. */
  k: string;
  /** Default text shown when no override exists. The plain-text content
   *  of `children` is also used as the default. */
  children: ReactNode;
  /** Optional explicit default override (takes precedence over children). */
  default?: string;
  /** Render as a block-level element rather than inline span. */
  block?: boolean;
  /** Pass-through style for the rendered element. */
  style?: CSSProperties;
  /** Pass-through className. */
  className?: string;
}

/**
 * Inline editable string. In view mode renders a span with the current
 * value. In edit mode it becomes `contentEditable` — the user types
 * directly and the value is written to the draft on blur.
 */
export function E({
  k,
  children,
  default: explicitDefault,
  block,
  style,
  className,
}: ETextProps) {
  const ctx = useAmanaContent();
  // Derive the default text from children if the caller didn't pass one.
  const defaultText = explicitDefault ?? extractText(children);
  const value = ctx ? ctx.getValue(k, defaultText) : defaultText;
  const tag = block ? "div" : "span";
  const editing = ctx?.mode === "edit";
  const editableRef = useRef<HTMLElement | null>(null);
  const [hover, setHover] = useState(false);

  // Seed initial DOM content on entry to edit mode AND reset if the
  // upstream value changes (cancel, server reload). Uses useLayoutEffect to
  // avoid a flash of empty contentEditable before commit. Skip if the user
  // is currently focused — that means the change came from their own typing
  // (onInput → setDraft → re-render) and rewriting innerText would collapse
  // the caret to the start.
  useLayoutEffect(() => {
    if (!editing) return;
    const el = editableRef.current;
    if (!el) return;
    if (document.activeElement === el) return;
    if (el.innerText !== value) el.innerText = value;
  }, [editing, value]);

  if (!editing) {
    return createElement(tag, { style, className }, value);
  }

  // Uncontrolled: never pass `value` as children in edit mode. The useEffect
  // above seeds initial content + handles upstream resets (cancel, server
  // reload). onInput keeps the draft in sync with what the user typed
  // without React re-rendering the contentEditable child (which would
  // collapse the caret to the start).
  const commit = (el: HTMLElement | null) => {
    if (!el) return;
    const next = el.innerText;
    if (next !== ctx?.getValue(k, defaultText)) ctx?.setDraft(k, next);
  };

  return createElement(tag, {
    ref: editableRef,
    contentEditable: true,
    suppressContentEditableWarning: true,
    onInput: (e: React.FormEvent<HTMLElement>) => commit(e.currentTarget),
    onBlur: (e: React.FocusEvent<HTMLElement>) => commit(e.currentTarget),
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      ...style,
      outline: hover ? EDIT_OUTLINE_HOVER : EDIT_OUTLINE,
      outlineOffset: 2,
      cursor: "text",
      borderRadius: 3,
      minWidth: 8,
    },
    className,
  });
}

/**
 * Read a single editable string value out of context, e.g. for use as the
 * value of an `alt` attribute or inside a `title` prop where rendering a
 * `<span>` would be invalid. Falls back to the default when no provider
 * is mounted.
 */
export function useEditableString(key: string, defaultValue: string): string {
  const ctx = useAmanaContent();
  return ctx ? ctx.getValue(key, defaultValue) : defaultValue;
}

// ─────────────────────────────────────────────────────────────────────────────
// <EImg k="..."> — editable image
// ─────────────────────────────────────────────────────────────────────────────

interface EImgProps {
  k: string;
  /** Default image src. */
  default: string;
  alt?: string;
  style?: CSSProperties;
  className?: string;
}

/**
 * Editable image. In edit mode shows a small "Replace" overlay on hover;
 * clicking opens a file picker, uploads, and writes the resulting URL to
 * the draft.
 */
export function EImg({ k, default: defaultSrc, alt, style, className }: EImgProps) {
  const ctx = useAmanaContent();
  const src = ctx ? ctx.getValue(k, defaultSrc) : defaultSrc;
  const editing = ctx?.mode === "edit";
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  if (!editing) {
    return (
      <img
        src={src}
        alt={alt ?? ""}
        style={style}
        className={className}
      />
    );
  }

  const handleFile = async (file: File) => {
    if (!ctx) return;
    setUploading(true);
    try {
      const url = await ctx.uploadImage(file);
      ctx.setDraft(k, url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      // Defer importing toast to avoid a circular dependency; surface via alert.
      if (typeof window !== "undefined") window.alert(message);
    } finally {
      setUploading(false);
    }
  };

  // Wrap the image so the overlay sits on top.
  return (
    <span
      style={{
        position: "relative",
        display: "inline-block",
        outline: EDIT_OUTLINE,
        outlineOffset: 2,
        borderRadius: 4,
        ...(style?.width || style?.height
          ? {}
          : { width: "fit-content", height: "fit-content" }),
      }}
      onClick={() => inputRef.current?.click()}
    >
      <img src={src} alt={alt ?? ""} style={style} className={className} />
      <span
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(26,79,92,0.55)",
          color: "#FFFFFF",
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          fontFamily: "system-ui, sans-serif",
          cursor: "pointer",
          opacity: 0,
          transition: "opacity 120ms",
          pointerEvents: "none",
          borderRadius: 4,
        }}
        className="amana-edit-overlay"
      >
        {uploading ? "Uploading…" : "Replace"}
      </span>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      <style>{`
        span:hover > .amana-edit-overlay { opacity: 1 !important; }
      `}</style>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// utilities
// ─────────────────────────────────────────────────────────────────────────────

function extractText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  // ReactElement — try children
  const maybeChildren = (node as { props?: { children?: ReactNode } }).props
    ?.children;
  if (maybeChildren != null) return extractText(maybeChildren);
  return "";
}
