"use client";

import { useState } from "react";
import {
  FieldGroup,
  FormActions,
  TextArea,
  TextField,
  stripEmpty,
  useSectionShortcuts,
} from "./FormPrimitives";
import type { ParentAvatar } from "@/lib/centre-avatar/sections";

export function ParentAvatarForm({
  initial,
  onSave,
  onCancel,
  isSaving,
}: {
  initial: ParentAvatar | null;
  onSave: (next: Record<string, unknown>) => void | Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [draft, setDraft] = useState<ParentAvatar>(initial ?? {});

  const set = <K extends keyof ParentAvatar>(k: K, v: ParentAvatar[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const setNested = <K extends keyof ParentAvatar, P extends string>(
    k: K,
    p: P,
    v: unknown,
  ) =>
    setDraft((d) => ({
      ...d,
      [k]: {
        ...((d[k] ?? {}) as Record<string, unknown>),
        [p]: v,
      },
    }));

  const save = () => {
    const cleaned = stripEmpty(draft);
    void onSave(cleaned as Record<string, unknown>);
  };

  const onKeyDown = useSectionShortcuts({ save, cancel: onCancel });

  return (
    <div className="space-y-4" onKeyDown={onKeyDown}>
      <FieldGroup title="Demographics">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextField
            label="Age range"
            value={draft.demographics?.ageRange ?? ""}
            onChange={(v) => setNested("demographics", "ageRange", v)}
            placeholder="30–45"
            maxLength={100}
          />
          <TextField
            label="Income"
            value={draft.demographics?.income ?? ""}
            onChange={(v) => setNested("demographics", "income", v)}
            placeholder="$80–150k household"
            maxLength={200}
          />
          <TextField
            label="Family structure"
            value={draft.demographics?.familyStructure ?? ""}
            onChange={(v) => setNested("demographics", "familyStructure", v)}
            placeholder="Two-parent, both working; multi-generational"
            maxLength={500}
            className="sm:col-span-2"
          />
          <TextField
            label="Education"
            value={draft.demographics?.education ?? ""}
            onChange={(v) => setNested("demographics", "education", v)}
            maxLength={200}
          />
          <TextField
            label="Languages"
            value={draft.demographics?.languages ?? ""}
            onChange={(v) => setNested("demographics", "languages", v)}
            placeholder="English, Arabic, Mandarin"
            maxLength={300}
          />
          <TextField
            label="Occupations"
            value={draft.demographics?.occupations ?? ""}
            onChange={(v) => setNested("demographics", "occupations", v)}
            placeholder="Teachers, healthcare, trades"
            maxLength={500}
            className="sm:col-span-2"
          />
        </div>
      </FieldGroup>

      <FieldGroup title="Psychographics">
        <TextArea
          label="Primary concern"
          value={draft.psychographics?.primaryConcern ?? ""}
          onChange={(v) => setNested("psychographics", "primaryConcern", v)}
          rows={3}
          maxLength={2000}
          hint="What keeps them up at night about after-school care?"
        />
        <TextArea
          label="Primary want"
          value={draft.psychographics?.primaryWant ?? ""}
          onChange={(v) => setNested("psychographics", "primaryWant", v)}
          rows={3}
          maxLength={2000}
          hint="The outcome they're really shopping for."
        />
        <TextArea
          label="Top objections"
          value={draft.psychographics?.topObjections ?? ""}
          onChange={(v) => setNested("psychographics", "topObjections", v)}
          rows={3}
          maxLength={2000}
          hint="Why they hesitate before signing up."
        />
        <TextArea
          label="Enrol trigger"
          value={draft.psychographics?.enrolTrigger ?? ""}
          onChange={(v) => setNested("psychographics", "enrolTrigger", v)}
          rows={2}
          maxLength={2000}
          hint="The moment they finally commit."
        />
        <TextArea
          label="Deal breaker"
          value={draft.psychographics?.dealBreaker ?? ""}
          onChange={(v) => setNested("psychographics", "dealBreaker", v)}
          rows={2}
          maxLength={2000}
          hint="What instantly disqualifies a centre for them."
        />
      </FieldGroup>

      <FieldGroup title="Decision making">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <TextField
            label="Who decides"
            value={draft.decisionMaking?.whoDecides ?? ""}
            onChange={(v) => setNested("decisionMaking", "whoDecides", v)}
            placeholder="Mum primarily, dad signs off"
            maxLength={500}
          />
          <TextField
            label="Influencers"
            value={draft.decisionMaking?.influencers ?? ""}
            onChange={(v) => setNested("decisionMaking", "influencers", v)}
            placeholder="Other parents, school P&C, principal"
            maxLength={500}
          />
          <TextField
            label="Timeline"
            value={draft.decisionMaking?.timeline ?? ""}
            onChange={(v) => setNested("decisionMaking", "timeline", v)}
            placeholder="Term 4 the year before"
            maxLength={500}
          />
        </div>
      </FieldGroup>

      <FieldGroup title="Communication preferences">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <TextField
            label="Channel"
            value={draft.commPreferences?.channel ?? ""}
            onChange={(v) => setNested("commPreferences", "channel", v)}
            placeholder="WhatsApp, school newsletter"
            maxLength={200}
          />
          <TextField
            label="Frequency"
            value={draft.commPreferences?.frequency ?? ""}
            onChange={(v) => setNested("commPreferences", "frequency", v)}
            placeholder="Weekly digest"
            maxLength={200}
          />
          <TextField
            label="Tone"
            value={draft.commPreferences?.tone ?? ""}
            onChange={(v) => setNested("commPreferences", "tone", v)}
            placeholder="Warm, plain-spoken"
            maxLength={200}
          />
          <TextField
            label="Language"
            value={draft.commPreferences?.language ?? ""}
            onChange={(v) => setNested("commPreferences", "language", v)}
            placeholder="English; Arabic for some"
            maxLength={200}
          />
        </div>
      </FieldGroup>

      <TextArea
        label="Cultural sensitivities"
        value={draft.culturalSensitivities ?? ""}
        onChange={(v) => set("culturalSensitivities", v)}
        rows={3}
        maxLength={5000}
        hint="Religious observances, dietary, dress, communication norms."
      />
      <TextArea
        label="Competition"
        value={draft.competition ?? ""}
        onChange={(v) => set("competition", v)}
        rows={3}
        maxLength={5000}
        hint="Who else are these parents considering, and why."
      />
      <TextArea
        label="Community dynamics"
        value={draft.communityDynamics ?? ""}
        onChange={(v) => set("communityDynamics", v)}
        rows={3}
        maxLength={5000}
        hint="What's happening in this neighbourhood that affects parent decisions."
      />

      <FormActions onSave={save} onCancel={onCancel} isSaving={isSaving} />
    </div>
  );
}
