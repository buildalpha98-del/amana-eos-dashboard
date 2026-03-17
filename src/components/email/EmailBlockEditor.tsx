"use client";

import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import type { EmailBlock } from "@/lib/email-marketing-layout";

interface Props {
  blocks: EmailBlock[];
  onChange: (blocks: EmailBlock[]) => void;
}

const BLOCK_TYPES: { type: EmailBlock["type"]; label: string }[] = [
  { type: "heading", label: "Heading" },
  { type: "text", label: "Text" },
  { type: "image", label: "Image" },
  { type: "button", label: "Button" },
  { type: "divider", label: "Divider" },
  { type: "spacer", label: "Spacer" },
];

const TYPE_LABELS: Record<EmailBlock["type"], string> = {
  heading: "Heading",
  text: "Text",
  image: "Image",
  button: "Button",
  divider: "Divider",
  spacer: "Spacer",
};

export default function EmailBlockEditor({ blocks, onChange }: Props) {
  function update(index: number, patch: Partial<EmailBlock>) {
    const next = blocks.map((b, i) => (i === index ? { ...b, ...patch } : b));
    onChange(next);
  }

  function remove(index: number) {
    onChange(blocks.filter((_, i) => i !== index));
  }

  function moveUp(index: number) {
    if (index === 0) return;
    const next = [...blocks];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  }

  function moveDown(index: number) {
    if (index === blocks.length - 1) return;
    const next = [...blocks];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    onChange(next);
  }

  function addBlock(type: EmailBlock["type"]) {
    const defaults: Record<EmailBlock["type"], EmailBlock> = {
      heading: { type: "heading", level: "h2", text: "" },
      text: { type: "text", content: "" },
      image: { type: "image", url: "", alt: "" },
      button: { type: "button", label: "Click Here", url: "" },
      divider: { type: "divider" },
      spacer: { type: "spacer", height: 24 },
    };
    onChange([...blocks, defaults[type]]);
  }

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => (
        <div
          key={i}
          className="rounded-lg border border-border bg-surface p-3 space-y-2"
        >
          {/* Header row */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
              {TYPE_LABELS[block.type]}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => moveUp(i)}
                disabled={i === 0}
                className="rounded p-1 text-muted hover:bg-hover disabled:opacity-30"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => moveDown(i)}
                disabled={i === blocks.length - 1}
                className="rounded p-1 text-muted hover:bg-hover disabled:opacity-30"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => remove(i)}
                className="rounded p-1 text-red-500 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Block-specific fields */}
          {block.type === "heading" && (
            <div className="flex gap-2">
              <select
                value={block.level || "h2"}
                onChange={(e) =>
                  update(i, {
                    level: e.target.value as "h1" | "h2" | "h3",
                  })
                }
                className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
              >
                <option value="h1">H1</option>
                <option value="h2">H2</option>
                <option value="h3">H3</option>
              </select>
              <input
                type="text"
                value={block.text || ""}
                onChange={(e) => update(i, { text: e.target.value })}
                placeholder="Heading text..."
                className="flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
              />
            </div>
          )}

          {block.type === "text" && (
            <textarea
              rows={3}
              value={block.content || ""}
              onChange={(e) => update(i, { content: e.target.value })}
              placeholder="Paragraph text..."
              className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
            />
          )}

          {block.type === "image" && (
            <div className="space-y-2">
              <input
                type="url"
                value={block.url || ""}
                onChange={(e) => update(i, { url: e.target.value })}
                placeholder="Image URL"
                className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
              />
              <input
                type="text"
                value={block.alt || ""}
                onChange={(e) => update(i, { alt: e.target.value })}
                placeholder="Alt text"
                className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
              />
              <input
                type="url"
                value={block.linkUrl || ""}
                onChange={(e) => update(i, { linkUrl: e.target.value })}
                placeholder="Link URL (optional)"
                className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
              />
            </div>
          )}

          {block.type === "button" && (
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={block.label || ""}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="Button label"
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
              />
              <input
                type="url"
                value={block.url || ""}
                onChange={(e) => update(i, { url: e.target.value })}
                placeholder="Button URL"
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
              />
            </div>
          )}

          {block.type === "divider" && (
            <p className="text-xs text-muted">Horizontal divider line</p>
          )}

          {block.type === "spacer" && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted">Height (px)</label>
              <input
                type="number"
                min={4}
                max={120}
                value={block.height || 24}
                onChange={(e) =>
                  update(i, { height: Number(e.target.value) })
                }
                className="w-20 rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
              />
            </div>
          )}
        </div>
      ))}

      {/* Add block buttons */}
      <div className="flex flex-wrap gap-2 pt-1">
        {BLOCK_TYPES.map(({ type, label }) => (
          <button
            key={type}
            type="button"
            onClick={() => addBlock(type)}
            className="flex items-center gap-1 rounded-md border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted hover:border-brand hover:text-brand"
          >
            <Plus className="h-3 w-3" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
