"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useCreateEntry, type MeasurableEntry } from "@/hooks/useScorecard";
import { cn } from "@/lib/utils";

export function DataEntryCell({
  measurableId,
  weekOf,
  entry,
  unit,
  goalValue,
  goalDirection,
}: {
  measurableId: string;
  weekOf: string;
  entry: MeasurableEntry | undefined;
  unit: string | null;
  goalValue: number;
  goalDirection: "above" | "below" | "exact";
}) {
  const createEntry = useCreateEntry();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [justSaved, setJustSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Track whether Escape was pressed so blur doesn't also save
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // Brief green flash after successful save
  useEffect(() => {
    if (justSaved) {
      const timer = setTimeout(() => setJustSaved(false), 800);
      return () => clearTimeout(timer);
    }
  }, [justSaved]);

  const handleSave = useCallback(() => {
    const numVal = parseFloat(value);
    if (isNaN(numVal)) {
      setEditing(false);
      return;
    }

    // Skip save if value hasn't changed
    if (entry && entry.value === numVal) {
      setEditing(false);
      return;
    }

    createEntry.mutate(
      { measurableId, weekOf, value: numVal },
      {
        onSuccess: () => {
          setJustSaved(true);
        },
        onSettled: () => setEditing(false),
      }
    );
  }, [value, entry, measurableId, weekOf, createEntry]);

  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    setEditing(false);
  }, []);

  const handleBlur = useCallback(() => {
    // If Escape was pressed, cancelledRef is true — don't save
    if (cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }
    handleSave();
  }, [handleSave]);

  /**
   * Arrow-key navigation across the scorecard grid.
   *
   * Saves the current cell, then locates the adjacent data-entry cell
   * (marker `data-scorecard-cell`) and clicks it to enter edit mode.
   * Skips header columns / action columns since they don't carry the
   * marker. Wraps within a row but does NOT wrap row→row to avoid
   * accidental jumps to a measurable on the wrong line.
   */
  const moveFocus = useCallback(
    (direction: "left" | "right" | "up" | "down") => {
      const td = inputRef.current?.closest("td");
      if (!td) return;
      const row = td.parentElement;
      if (!row) return;

      const cellsInRow = Array.from(
        row.querySelectorAll<HTMLTableCellElement>("td[data-scorecard-cell]"),
      );
      const colIdx = cellsInRow.indexOf(td as HTMLTableCellElement);

      let target: HTMLTableCellElement | null = null;

      if (direction === "left") {
        target = cellsInRow[colIdx - 1] ?? null;
      } else if (direction === "right") {
        target = cellsInRow[colIdx + 1] ?? null;
      } else {
        // up / down — jump to the same column in the next sibling row that
        // still has data-entry cells. Walk until we find one or run out.
        const step = direction === "up" ? "previousElementSibling" : "nextElementSibling";
        let candidateRow = row[step] as HTMLElement | null;
        while (candidateRow) {
          const cells = Array.from(
            candidateRow.querySelectorAll<HTMLTableCellElement>("td[data-scorecard-cell]"),
          );
          if (cells.length > 0) {
            target = cells[colIdx] ?? cells[cells.length - 1];
            break;
          }
          candidateRow = candidateRow[step] as HTMLElement | null;
        }
      }

      if (target) {
        // Defer click until React has flushed our save's state update so we
        // don't enter edit mode on the new cell while the old one is still
        // mid-save.
        setTimeout(() => target?.click(), 0);
      }
    },
    [],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === "Tab") {
        // Tab: let the browser move focus naturally after we save
        if (e.key === "Enter") {
          e.preventDefault();
        }
        handleSave();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
        return;
      }
      if (
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown"
      ) {
        const input = e.currentTarget;
        // `<input type="number">` does NOT support selectionStart/end in most
        // browsers — both return null. We treat number inputs as "always at
        // boundary" so arrow keys always navigate. For text-like inputs
        // (defensive — currently only number), require the cursor to actually
        // be at the start (for ArrowLeft/Up) or end (for ArrowRight/Down) so
        // multi-digit values can still be edited mid-value with arrow keys.
        const supportsSelection =
          input.selectionStart !== null && input.selectionEnd !== null;
        const atStart =
          !supportsSelection ||
          (input.selectionStart === 0 && input.selectionEnd === 0);
        const atEnd =
          !supportsSelection ||
          (input.selectionStart === input.value.length &&
            input.selectionEnd === input.value.length);
        if (
          ((e.key === "ArrowLeft" || e.key === "ArrowUp") && atStart) ||
          ((e.key === "ArrowRight" || e.key === "ArrowDown") && atEnd)
        ) {
          e.preventDefault();
          handleSave();
          const dir =
            e.key === "ArrowLeft"
              ? "left"
              : e.key === "ArrowRight"
                ? "right"
                : e.key === "ArrowUp"
                  ? "up"
                  : "down";
          moveFocus(dir);
        }
      }
    },
    [handleSave, handleCancel, moveFocus]
  );

  const formatValue = (val: number) => {
    if (unit === "$") return `$${val.toLocaleString()}`;
    if (unit === "%") return `${val}%`;
    return val.toLocaleString();
  };

  const isOnTrack = entry?.onTrack ?? false;

  if (editing) {
    return (
      <td className="px-1 py-1" data-scorecard-cell="">
        <input
          ref={inputRef}
          type="number"
          step="any"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="w-full px-1.5 py-1 text-xs text-center border border-brand rounded bg-card focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </td>
    );
  }

  if (entry) {
    return (
      <td
        data-scorecard-cell=""
        onClick={() => {
          cancelledRef.current = false;
          setValue(String(entry.value));
          setEditing(true);
        }}
        className={cn(
          "px-1 py-1 text-center cursor-pointer transition-colors duration-300 hover:bg-surface",
          justSaved
            ? "bg-emerald-200"
            : isOnTrack
            ? "text-emerald-700 bg-emerald-50"
            : "text-red-700 bg-red-50"
        )}
        title={`Goal: ${goalDirection === "above" ? "\u2265" : goalDirection === "below" ? "\u2264" : "="} ${formatValue(goalValue)}${entry.notes ? `\nNote: ${entry.notes}` : ""}`}
      >
        <span className="text-xs font-medium">{formatValue(entry.value)}</span>
      </td>
    );
  }

  // Empty cell
  return (
    <td
      data-scorecard-cell=""
      onClick={() => {
        cancelledRef.current = false;
        setValue("");
        setEditing(true);
      }}
      className={cn(
        "px-1 py-1 text-center cursor-pointer hover:bg-surface transition-colors duration-300",
        justSaved && "bg-emerald-200"
      )}
    >
      <span className="text-xs text-muted/50">{"\u2014"}</span>
    </td>
  );
}
