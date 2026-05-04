"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  manualFieldsSchema,
  type ManualField,
} from "@/lib/contract-templates/manual-fields-schema";

export function ManualFieldsPanel({
  value,
  onChange,
}: {
  value: ManualField[];
  onChange: (fields: ManualField[]) => void;
}) {
  const [errors, setErrors] = useState<string[]>([]);

  const update = (next: ManualField[]) => {
    const parsed = manualFieldsSchema.safeParse(next);
    setErrors(parsed.success ? [] : parsed.error.issues.map((i) => i.message));
    onChange(next);
  };

  const addRow = () => {
    update([
      ...value,
      { key: "", label: "", type: "text", required: false },
    ]);
  };

  const removeRow = (idx: number) => {
    update(value.filter((_, i) => i !== idx));
  };

  const editRow = (idx: number, patch: Partial<ManualField>) => {
    update(value.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  };

  return (
    <section className="border-t border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Manual fields</h3>
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-1 text-xs text-brand hover:underline"
        >
          <Plus className="w-3 h-3" />
          Add field
        </button>
      </div>

      {value.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No manual fields. Add fields the issuer must fill in at issue time
          (e.g. probation period, custom clauses).
        </p>
      )}

      <div className="space-y-2">
        {value.map((f, idx) => (
          <div key={idx} className="flex flex-wrap gap-2 items-center">
            <input
              type="text"
              placeholder="key (identifier)"
              value={f.key}
              onChange={(e) => editRow(idx, { key: e.target.value })}
              className="px-2 py-1 text-xs border border-border rounded font-mono w-40 bg-background"
            />
            <input
              type="text"
              placeholder="Label"
              value={f.label}
              onChange={(e) => editRow(idx, { label: e.target.value })}
              className="px-2 py-1 text-xs border border-border rounded flex-1 min-w-[160px] bg-background"
            />
            <select
              value={f.type}
              onChange={(e) =>
                editRow(idx, { type: e.target.value as ManualField["type"] })
              }
              className="px-2 py-1 text-xs border border-border rounded bg-background"
            >
              <option value="text">Text</option>
              <option value="longtext">Long text</option>
              <option value="date">Date</option>
              <option value="number">Number</option>
            </select>
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={f.required}
                onChange={(e) => editRow(idx, { required: e.target.checked })}
                className="rounded"
              />
              Required
            </label>
            <input
              type="text"
              placeholder="Default (optional)"
              value={f.default ?? ""}
              onChange={(e) =>
                editRow(idx, { default: e.target.value || undefined })
              }
              className="px-2 py-1 text-xs border border-border rounded w-32 bg-background"
            />
            <button
              type="button"
              onClick={() => removeRow(idx)}
              className="p-1 text-red-500 hover:bg-red-50 rounded"
              aria-label="Remove field"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      {errors.length > 0 && (
        <ul className="mt-2 space-y-1">
          {errors.map((e, i) => (
            <li key={i} className="text-xs text-red-600">
              ⚠ {e}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
