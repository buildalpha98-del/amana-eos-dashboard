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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === "Tab") {
        // Tab: let the browser move focus naturally after we save
        if (e.key === "Enter") {
          e.preventDefault();
        }
        handleSave();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      }
    },
    [handleSave, handleCancel]
  );

  const formatValue = (val: number) => {
    if (unit === "$") return `$${val.toLocaleString()}`;
    if (unit === "%") return `${val}%`;
    return val.toLocaleString();
  };

  const isOnTrack = entry?.onTrack ?? false;

  if (editing) {
    return (
      <td className="px-1 py-1">
        <input
          ref={inputRef}
          type="number"
          step="any"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="w-full px-1.5 py-1 text-xs text-center border border-brand rounded bg-white focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </td>
    );
  }

  if (entry) {
    return (
      <td
        onClick={() => {
          cancelledRef.current = false;
          setValue(String(entry.value));
          setEditing(true);
        }}
        className={cn(
          "px-1 py-1 text-center cursor-pointer transition-colors duration-300 hover:bg-gray-100",
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
      onClick={() => {
        cancelledRef.current = false;
        setValue("");
        setEditing(true);
      }}
      className={cn(
        "px-1 py-1 text-center cursor-pointer hover:bg-gray-100 transition-colors duration-300",
        justSaved && "bg-emerald-200"
      )}
    >
      <span className="text-xs text-gray-300">{"\u2014"}</span>
    </td>
  );
}
