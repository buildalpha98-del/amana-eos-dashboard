"use client";

import { useState } from "react";
import {
  Field,
  FieldGroup,
  FormActions,
  NumberField,
  TagListInput,
  TextArea,
  TextField,
  stripEmpty,
  useSectionShortcuts,
} from "./FormPrimitives";
import type { Snapshot } from "@/lib/centre-avatar/sections";
import { useAutosave, useUnsavedChangesWarning } from "@/hooks/useAutosave";
import { AutosaveStatus } from "../AutosaveStatus";

const STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"] as const;
const SCHOOL_TYPES = ["primary", "secondary", "P-12", "K-12", "infants"] as const;

type ContactKey =
  | "principal"
  | "marketingCoord"
  | "adminLead"
  | "newsletterEditor"
  | "communityLiaison";

const CONTACT_LABELS: Record<ContactKey, string> = {
  principal: "Principal",
  marketingCoord: "Marketing coordinator",
  adminLead: "Admin lead",
  newsletterEditor: "Newsletter editor",
  communityLiaison: "Community liaison",
};

export function SnapshotForm({
  initial,
  onSave,
  onCancel,
  isSaving,
}: {
  initial: Snapshot | null;
  onSave: (next: Record<string, unknown>) => void | Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [draft, setDraft] = useState<Snapshot>(initial ?? {});

  const set = <K extends keyof Snapshot>(k: K, v: Snapshot[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const setNested = <K extends keyof Snapshot, P extends string>(
    k: K,
    p: P,
    v: unknown,
  ) => {
    setDraft((d) => ({
      ...d,
      [k]: {
        ...((d[k] ?? {}) as Record<string, unknown>),
        [p]: v,
      },
    }));
  };

  const setContactBlock = (key: ContactKey, p: string, v: string) => {
    setDraft((d) => ({
      ...d,
      schoolContacts: {
        ...(d.schoolContacts ?? {}),
        [key]: {
          ...((d.schoolContacts?.[key] ?? {}) as Record<string, unknown>),
          [p]: v,
        },
      },
    }));
  };

  const save = async () => {
    const cleaned = stripEmpty(draft);
    await onSave(cleaned as Record<string, unknown>);
  };

  const autosave = useAutosave(draft, save);
  useUnsavedChangesWarning(autosave.status === "dirty" || autosave.status === "saving");

  const onKeyDown = useSectionShortcuts({ save: () => void save(), cancel: onCancel });

  return (
    <div className="space-y-4" onKeyDown={onKeyDown}>
      {/* Centre details */}
      <FieldGroup title="Centre details">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextField
            label="Official name"
            value={draft.centreDetails?.officialName ?? ""}
            onChange={(v) => setNested("centreDetails", "officialName", v)}
            placeholder="Amana Greystanes Public School OSHC"
            maxLength={300}
          />
          <TextField
            label="Short name"
            value={draft.centreDetails?.shortName ?? ""}
            onChange={(v) => setNested("centreDetails", "shortName", v)}
            placeholder="Greystanes"
            maxLength={300}
          />
          <Field label="State">
            <select
              value={draft.centreDetails?.state ?? ""}
              onChange={(e) => setNested("centreDetails", "state", e.target.value || null)}
              className="w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option value="">—</option>
              {STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <TextField
            label="School name"
            value={draft.centreDetails?.schoolName ?? ""}
            onChange={(v) => setNested("centreDetails", "schoolName", v)}
            maxLength={300}
          />
          <Field label="School type">
            <select
              value={draft.centreDetails?.schoolType ?? ""}
              onChange={(e) => setNested("centreDetails", "schoolType", e.target.value || null)}
              className="w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option value="">—</option>
              {SCHOOL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <TextField
            label="Address"
            value={draft.centreDetails?.address ?? ""}
            onChange={(v) => setNested("centreDetails", "address", v)}
            maxLength={500}
            className="sm:col-span-2"
          />
        </div>
      </FieldGroup>

      {/* Coordinator */}
      <FieldGroup title="Coordinator">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextField
            label="Name"
            value={draft.coordinator?.name ?? ""}
            onChange={(v) => setNested("coordinator", "name", v)}
            maxLength={200}
          />
          <TextField
            label="Email"
            type="email"
            value={draft.coordinator?.email ?? ""}
            onChange={(v) => setNested("coordinator", "email", v)}
            maxLength={200}
          />
          <TextField
            label="Phone"
            type="tel"
            value={draft.coordinator?.phone ?? ""}
            onChange={(v) => setNested("coordinator", "phone", v)}
            maxLength={100}
          />
          <TextField
            label="Started at"
            value={draft.coordinator?.startedAt ?? ""}
            onChange={(v) => setNested("coordinator", "startedAt", v)}
            placeholder="2024 or 2024-03-15"
            maxLength={50}
          />
          <TextField
            label="Languages"
            value={draft.coordinator?.languages ?? ""}
            onChange={(v) => setNested("coordinator", "languages", v)}
            placeholder="English, Arabic"
            maxLength={300}
            className="sm:col-span-2"
          />
          <TextArea
            label="Certifications"
            value={draft.coordinator?.certifications ?? ""}
            onChange={(v) => setNested("coordinator", "certifications", v)}
            rows={2}
            maxLength={500}
            className="sm:col-span-2"
          />
          <TextArea
            label="Strengths"
            value={draft.coordinator?.strengths ?? ""}
            onChange={(v) => setNested("coordinator", "strengths", v)}
            rows={3}
            maxLength={2000}
            hint="What this coordinator is great at — front them in marketing copy."
            className="sm:col-span-2"
          />
          <TextArea
            label="Support needs"
            value={draft.coordinator?.supportNeeds ?? ""}
            onChange={(v) => setNested("coordinator", "supportNeeds", v)}
            rows={3}
            maxLength={2000}
            hint="Where they need backup — head office support, training, etc."
            className="sm:col-span-2"
          />
        </div>
      </FieldGroup>

      {/* School contacts */}
      <FieldGroup title="School contacts">
        <div className="space-y-3">
          {(Object.keys(CONTACT_LABELS) as ContactKey[]).map((key) => {
            const block = (draft.schoolContacts?.[key] ?? {}) as {
              name?: string | null;
              email?: string | null;
              phone?: string | null;
              method?: string | null;
            };
            return (
              <div key={key} className="rounded-md border border-border bg-card p-3">
                <p className="mb-2 text-xs font-semibold text-foreground">
                  {CONTACT_LABELS[key]}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <TextField
                    label="Name"
                    value={block.name ?? ""}
                    onChange={(v) => setContactBlock(key, "name", v)}
                    maxLength={200}
                  />
                  <TextField
                    label="Email"
                    type="email"
                    value={block.email ?? ""}
                    onChange={(v) => setContactBlock(key, "email", v)}
                    maxLength={200}
                  />
                  <TextField
                    label="Phone"
                    type="tel"
                    value={block.phone ?? ""}
                    onChange={(v) => setContactBlock(key, "phone", v)}
                    maxLength={100}
                  />
                  <TextField
                    label="Preferred method / notes"
                    value={block.method ?? ""}
                    onChange={(v) => setContactBlock(key, "method", v)}
                    maxLength={200}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </FieldGroup>

      {/* School culture notes */}
      <TextArea
        label="School culture notes"
        value={draft.schoolCultureNotes ?? ""}
        onChange={(v) => set("schoolCultureNotes", v)}
        rows={4}
        maxLength={5000}
        hint="What's the vibe? What's the principal proud of? What do parents care about?"
      />

      {/* Numbers */}
      <FieldGroup title="Numbers">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <NumberField
            label="Total school students"
            value={draft.numbers?.totalSchoolStudents ?? null}
            onChange={(v) => setNested("numbers", "totalSchoolStudents", v)}
            min={0}
          />
          <NumberField
            label="ASC enrolments"
            value={draft.numbers?.ascEnrolments ?? null}
            onChange={(v) => setNested("numbers", "ascEnrolments", v)}
            min={0}
          />
          <NumberField
            label="Penetration rate"
            value={draft.numbers?.penetrationRate ?? null}
            onChange={(v) => setNested("numbers", "penetrationRate", v)}
            min={0}
            max={1}
            step={0.01}
            hint="0–1 (e.g. 0.3 = 30%)"
          />
          <NumberField
            label="Waitlist"
            value={draft.numbers?.waitlist ?? null}
            onChange={(v) => setNested("numbers", "waitlist", v)}
            min={0}
          />
          <NumberField
            label="Average attendance"
            value={draft.numbers?.averageAttendance ?? null}
            onChange={(v) => setNested("numbers", "averageAttendance", v)}
            min={0}
          />
        </div>
      </FieldGroup>

      {/* Parent drivers + programme focus */}
      <TagListInput
        label="Parent drivers"
        values={draft.parentDrivers ?? []}
        onChange={(v) => set("parentDrivers", v)}
        placeholder="e.g. working parents, cultural fit"
        hint="Top 3-5 reasons parents pick this centre. Press Enter or comma to add."
        maxLength={100}
      />
      <TextField
        label="Programme focus"
        value={draft.programmeFocus ?? ""}
        onChange={(v) => set("programmeFocus", v)}
        placeholder="What this centre is best known for"
        maxLength={200}
      />

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
        <AutosaveStatus status={autosave.status} lastSavedAt={autosave.lastSavedAt} errorMessage={autosave.errorMessage} />
        <FormActions onSave={() => void save()} onCancel={onCancel} isSaving={isSaving || autosave.status === "saving"} />
      </div>
    </div>
  );
}
