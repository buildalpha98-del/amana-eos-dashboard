"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  CheckboxField,
  Field,
  FormActions,
  NumberField,
  TextArea,
  TextField,
  stripEmpty,
  useSectionShortcuts,
} from "./FormPrimitives";
import type { ProgrammeMix } from "@/lib/centre-avatar/sections";
import { useAutosave, useUnsavedChangesWarning } from "@/hooks/useAutosave";
import { AutosaveStatus } from "../AutosaveStatus";

type ProgrammeRow = NonNullable<ProgrammeMix["programmes"]>[number];

const blankRow = (): ProgrammeRow => ({
  name: "",
  running: false,
  attendance: null,
  capacity: null,
  status: null,
});

export function ProgrammeMixForm({
  initial,
  onAutoSave,
  onExplicitSave,
  onCancel,
  isSaving,
}: {
  initial: ProgrammeMix | null;
  onAutoSave: (next: Record<string, unknown>) => void | Promise<void>;
  onExplicitSave: (next: Record<string, unknown>) => void | Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [draft, setDraft] = useState<ProgrammeMix>(initial ?? {});
  const programmes = (draft.programmes ?? []) as ProgrammeRow[];

  const set = <K extends keyof ProgrammeMix>(k: K, v: ProgrammeMix[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const updateRow = (idx: number, patch: Partial<ProgrammeRow>) => {
    const next = programmes.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    set("programmes", next);
  };

  const addRow = () => {
    if (programmes.length >= 30) return;
    set("programmes", [...programmes, blankRow()]);
  };

  const removeRow = (idx: number) => {
    set("programmes", programmes.filter((_, i) => i !== idx));
  };

  const persist = async (target: (next: Record<string, unknown>) => void | Promise<void>) => {
    // Drop rows that have no name (the only required field) before saving.
    const filteredProgrammes = programmes.filter((p) => (p.name ?? "").trim().length > 0);
    const normalised = { ...draft, programmes: filteredProgrammes };
    const cleaned = stripEmpty(normalised);
    await target(cleaned as Record<string, unknown>);
  };
  const autoSave = () => persist(onAutoSave);
  const explicitSave = () => persist(onExplicitSave);

  const autosave = useAutosave(draft, autoSave);
  useUnsavedChangesWarning(autosave.status === "dirty" || autosave.status === "saving");
  const onKeyDown = useSectionShortcuts({ save: () => void explicitSave(), cancel: onCancel });

  return (
    <div className="space-y-4" onKeyDown={onKeyDown}>
      <TextArea
        label="What's working"
        value={draft.whatsWorking ?? ""}
        onChange={(v) => set("whatsWorking", v)}
        rows={3}
        maxLength={5000}
        hint="Which programmes are pulling enrolments and why."
      />
      <TextArea
        label="What's not working"
        value={draft.whatsNotWorking ?? ""}
        onChange={(v) => set("whatsNotWorking", v)}
        rows={3}
        maxLength={5000}
      />
      <TextArea
        label="Gaps"
        value={draft.gaps ?? ""}
        onChange={(v) => set("gaps", v)}
        rows={3}
        maxLength={5000}
        hint="What this centre needs but doesn't have yet."
      />

      <Field label="Programmes" hint="Add up to 30 programmes. Name is required.">
        <div className="space-y-2">
          {programmes.length === 0 && (
            <p className="rounded-md border border-dashed border-border bg-surface/40 px-3 py-3 text-xs italic text-muted">
              No programmes captured yet. Click &ldquo;Add programme&rdquo; to start.
            </p>
          )}
          {programmes.map((row, idx) => (
            <div
              key={idx}
              className="rounded-md border border-border bg-card p-3"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-6 gap-2">
                  <TextField
                    label="Name"
                    value={row.name ?? ""}
                    onChange={(v) => updateRow(idx, { name: v })}
                    placeholder="STEM Tuesdays"
                    maxLength={200}
                    className="sm:col-span-3"
                  />
                  <NumberField
                    label="Attendance"
                    value={row.attendance ?? null}
                    onChange={(v) => updateRow(idx, { attendance: v })}
                    min={0}
                  />
                  <NumberField
                    label="Capacity"
                    value={row.capacity ?? null}
                    onChange={(v) => updateRow(idx, { capacity: v })}
                    min={0}
                  />
                  <div className="flex items-end pb-1">
                    <CheckboxField
                      label="Running"
                      value={row.running ?? false}
                      onChange={(v) => updateRow(idx, { running: v })}
                    />
                  </div>
                  <TextArea
                    label="Status / notes"
                    value={row.status ?? ""}
                    onChange={(v) => updateRow(idx, { status: v })}
                    rows={2}
                    maxLength={200}
                    className="sm:col-span-6"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeRow(idx)}
                  className="mt-5 rounded-md p-1.5 text-muted hover:bg-surface hover:text-rose-700"
                  aria-label="Remove programme row"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addRow}
            disabled={programmes.length >= 30}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-brand/40 bg-brand/5 px-3 py-1.5 text-xs font-medium text-brand hover:bg-brand/10 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Add programme
            {programmes.length > 0 && ` (${programmes.length}/30)`}
          </button>
        </div>
      </Field>

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
        <AutosaveStatus status={autosave.status} lastSavedAt={autosave.lastSavedAt} errorMessage={autosave.errorMessage} />
        <FormActions onSave={() => void explicitSave()} onCancel={onCancel} isSaving={isSaving || autosave.status === "saving"} />
      </div>
    </div>
  );
}
