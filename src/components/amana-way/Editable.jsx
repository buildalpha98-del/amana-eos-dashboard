"use client";

/**
 * Back-compat shim — re-exports the generic Editable primitives that now
 * power both `/tools/the-amana-way` and `/tools/handbook`. Existing
 * `import { Editable } from "@/components/amana-way/Editable"` call sites
 * (notably AmanaWayPanel.jsx) keep working without changes.
 *
 * `EditableImage` is also re-exported here so the Amana Way panel can
 * adopt image editing (e.g. on the hero logo) without changing import
 * paths.
 *
 * Original location pre-refactor: /components/amana-way/Editable.jsx
 *
 * 2026-05-16: shimmed over /components/content-editing/Editable.jsx.
 */

export {
  EditableText as Editable,
  EditableList,
  EditableImage,
} from "@/components/content-editing/Editable";
