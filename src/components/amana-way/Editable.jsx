"use client";

/* eslint-disable react/no-unknown-property */
/**
 * Editable — inline edit-or-display wrapper used by AmanaWayPanel.
 *
 * In view mode: renders `defaultValue` (or the persisted override)
 * inside a passthrough <span>/<div>, preserving existing layout.
 *
 * In edit mode (owner/admin viewing while toolbar is "Edit ON"):
 * renders a contenteditable element that mirrors the same styles
 * as the surrounding text, with a soft outline so admins can see
 * what's editable. Changes are pushed up via `setDraft(id, value)`
 * on every keystroke (debounced via React's batched updates).
 *
 * `as` controls the wrapper element ("span" by default, "div" for
 * block-level text such as paragraphs). `multiline` flips the
 * contenteditable behaviour to allow line breaks.
 */

import { useAmanaWayContent } from "@/contexts/AmanaWayContentContext";

const EDIT_STYLE = {
  outline: "1px dashed rgba(245,166,35,0.7)",
  outlineOffset: 2,
  borderRadius: 4,
  cursor: "text",
  background: "rgba(254,243,220,0.4)",
};

export function Editable({
  id,
  defaultValue,
  as = "span",
  multiline = false,
  style,
  className,
}) {
  const { read, editing, setDraft, canEdit } = useAmanaWayContent();
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
      style={{ ...style, ...EDIT_STYLE }}
      className={className}
    >
      {value}
    </Tag>
  );
}

/**
 * EditableList — array-of-strings editor used for bullet lists
 * (the panel's `Ul` primitive takes `items: string[]`). In view
 * mode renders the items via the `render` callback (so callers
 * keep full control over markup). In edit mode renders a single
 * textarea, one item per line, that splits/joins on save.
 */
export function EditableList({ id, defaultItems, render }) {
  const { read, editing, setDraft, canEdit } = useAmanaWayContent();
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
