"use client";

/**
 * Floating Edit / Save / Cancel control surface for the Amana Way +
 * Educators Handbook tools. Rendered inside the panel container in the
 * top-right; hidden entirely unless the user is owner/admin AND the
 * provider has loaded.
 *
 * 2026-05-15: Amana Way editable content + Educators Handbook embed.
 */

import { Pencil, Check, X, Loader2 } from "lucide-react";
import { useAmanaContent } from "./AmanaContentContext";

export function EditBar() {
  const ctx = useAmanaContent();
  if (!ctx || !ctx.canEdit || !ctx.loaded) return null;

  const baseBtn = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    fontFamily: "system-ui, sans-serif",
    border: "1px solid rgba(26,79,92,0.18)",
    cursor: "pointer",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
    transition: "transform 120ms, background 120ms",
  } as const;

  if (ctx.mode === "view") {
    return (
      <div
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          zIndex: 50,
          display: "flex",
          gap: 8,
        }}
      >
        <button
          type="button"
          onClick={ctx.enterEdit}
          style={{
            ...baseBtn,
            background: "#FFFFFF",
            color: "#1A4F5C",
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <Pencil size={13} />
          Edit content
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        zIndex: 50,
        display: "flex",
        gap: 8,
        alignItems: "center",
      }}
    >
      {ctx.dirty ? (
        <span
          style={{
            fontSize: 11,
            color: "#7A4F00",
            background: "#FEF3DC",
            borderRadius: 999,
            padding: "4px 10px",
            border: "1px solid rgba(245,166,35,0.4)",
            fontFamily: "system-ui, sans-serif",
            fontWeight: 600,
          }}
        >
          Unsaved changes
        </span>
      ) : null}
      <button
        type="button"
        onClick={ctx.cancelEdit}
        disabled={ctx.saving}
        style={{
          ...baseBtn,
          background: "#FFFFFF",
          color: "#4A5568",
        }}
        onMouseDown={(e) => e.preventDefault()}
      >
        <X size={13} />
        Cancel
      </button>
      <button
        type="button"
        onClick={() => void ctx.save()}
        disabled={ctx.saving || !ctx.dirty}
        style={{
          ...baseBtn,
          background: ctx.dirty ? "#1A4F5C" : "#9AB3BA",
          color: "#FFFFFF",
          border: "1px solid transparent",
          cursor: ctx.dirty && !ctx.saving ? "pointer" : "not-allowed",
        }}
        onMouseDown={(e) => e.preventDefault()}
      >
        {ctx.saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
        Save
      </button>
    </div>
  );
}
