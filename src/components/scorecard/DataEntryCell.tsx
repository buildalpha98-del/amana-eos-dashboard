"use client";

import { useState, useRef, useEffect } from "react";
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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = () => {
    const numVal = parseFloat(value);
    if (isNaN(numVal)) {
      setEditing(false);
      return;
    }

    createEntry.mutate(
      { measurableId, weekOf, value: numVal },
      { onSettled: () => setEditing(false) }
    );
  };

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
          onBlur={handleSave}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-full px-1.5 py-1 text-xs text-center border border-[#1B4D3E] rounded bg-white focus:outline-none focus:ring-1 focus:ring-[#1B4D3E]"
        />
      </td>
    );
  }

  if (entry) {
    return (
      <td
        onClick={() => {
          setValue(String(entry.value));
          setEditing(true);
        }}
        className={cn(
          "px-1 py-1 text-center cursor-pointer transition-colors hover:bg-gray-100",
          isOnTrack ? "text-emerald-700 bg-emerald-50" : "text-red-700 bg-red-50"
        )}
        title={`Goal: ${goalDirection === "above" ? "≥" : goalDirection === "below" ? "≤" : "="} ${formatValue(goalValue)}${entry.notes ? `\nNote: ${entry.notes}` : ""}`}
      >
        <span className="text-xs font-medium">{formatValue(entry.value)}</span>
      </td>
    );
  }

  // Empty cell
  return (
    <td
      onClick={() => {
        setValue("");
        setEditing(true);
      }}
      className="px-1 py-1 text-center cursor-pointer hover:bg-gray-100 transition-colors"
    >
      <span className="text-xs text-gray-300">—</span>
    </td>
  );
}
