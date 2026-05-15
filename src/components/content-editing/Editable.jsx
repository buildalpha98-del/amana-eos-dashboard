"use client";

/* eslint-disable react/no-unknown-property */
/**
 * Generic inline-edit primitives wired to ContentEditingContext.
 *
 * EditableText  — single string, contenteditable in edit mode
 * EditableList  — array of strings (rendered however the caller wants);
 *                 edit mode collapses to a textarea, one line per item
 * EditableImage — img with a hover overlay that uploads on click
 *
 * Behaviour mirrors the original AmanaWay-specific primitives so they can
 * be drop-in migrated; the AmanaWay-named exports still resolve through
 * the back-compat shim in src/components/amana-way/Editable.jsx.
 *
 * 2026-05-16.
 */

import { useEffect, useRef, useState } from "react";
import { useContentEditing } from "@/contexts/ContentEditingContext";

const EDIT_TEXT_STYLE = {
  outline: "1px dashed rgba(245,166,35,0.7)",
  outlineOffset: 2,
  borderRadius: 4,
  cursor: "text",
  background: "rgba(254,243,220,0.4)",
};

const EDIT_IMG_OUTLINE = "1px dashed rgba(245,166,35,0.7)";

export function EditableText({
  id,
  defaultValue,
  as = "span",
  multiline = false,
  style,
  className,
}) {
  const { read, editing, setDraft, canEdit } = useContentEditing();
  const value = read(id, defaultValue);

  if (!editing || !canEdit) {
    const Tag = as;
    return (
      <Tag style={style} className={className}>
        {value}
      </Tag>
    );
  }

  const Tag = as;
  return (
    <Tag
      contentEditable
      suppressContentEditableWarning
      onBlur={(e) => {
        const next = multiline
          ? e.currentTarget.innerText
          : e.currentTarget.textContent ?? "";
        setDraft(id, next);
      }}
      onKeyDown={(e) => {
        if (!multiline && e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      data-editable-id={id}
      style={{ ...style, ...EDIT_TEXT_STYLE }}
      className={className}
    >
      {value}
    </Tag>
  );
}

export function EditableList({ id, defaultItems, render }) {
  const { read, editing, setDraft, canEdit } = useContentEditing();
  const joinedDefault = defaultItems.join("\n");
  const value = read(id, joinedDefault);
  const items = value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!editing || !canEdit) {
    return render(items);
  }

  return (
    <textarea
      defaultValue={value}
      onBlur={(e) => setDraft(id, e.currentTarget.value)}
      data-editable-id={id}
      rows={Math.max(3, items.length + 1)}
      style={{
        width: "100%",
        fontSize: 13,
        lineHeight: 1.7,
        fontFamily: "Georgia, serif",
        padding: "8px 10px",
        border: "1px dashed rgba(245,166,35,0.7)",
        borderRadius: 6,
        background: "rgba(254,243,220,0.4)",
        color: "#1A1A1A",
        resize: "vertical",
      }}
    />
  );
}

/**
 * EditableImage — image with a "Replace" overlay in edit mode. Uploads to
 * /api/content-uploads via the context's `uploadImage` helper, then writes
 * the resulting URL into the draft.
 */
export function EditableImage({
  id,
  defaultSrc,
  alt = "",
  style,
  className,
  wrapperStyle,
}) {
  const { read, editing, setDraft, canEdit, uploadImage } = useContentEditing();
  const src = read(id, defaultSrc);
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [hover, setHover] = useState(false);

  // Reset upload state if the upstream src changes (cancel / external save).
  useEffect(() => {
    setUploading(false);
  }, [src]);

  if (!editing || !canEdit) {
    return <img src={src} alt={alt} style={style} className={className} />;
  }

  const handleFile = async (file) => {
    setUploading(true);
    try {
      const url = await uploadImage(file);
      setDraft(id, url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      if (typeof window !== "undefined") window.alert(message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <span
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => fileRef.current?.click()}
      data-editable-id={id}
      style={{
        position: "relative",
        display: "inline-block",
        outline: EDIT_IMG_OUTLINE,
        outlineOffset: 2,
        borderRadius: 4,
        cursor: "pointer",
        ...wrapperStyle,
      }}
    >
      <img src={src} alt={alt} style={style} className={className} />
      {(hover || uploading) && (
        <span
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(26,79,92,0.65)",
            color: "#FFFFFF",
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            fontFamily: "system-ui, sans-serif",
            borderRadius: 4,
            pointerEvents: "none",
          }}
        >
          {uploading ? "Uploading…" : "Replace"}
        </span>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
    </span>
  );
}
