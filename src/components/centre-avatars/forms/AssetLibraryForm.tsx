"use client";

import { useState } from "react";
import {
  FormActions,
  TextArea,
  stripEmpty,
  useSectionShortcuts,
} from "./FormPrimitives";
import type { AssetLibrary } from "@/lib/centre-avatar/sections";
import { useAutosave, useUnsavedChangesWarning } from "@/hooks/useAutosave";
import { AutosaveStatus } from "../AutosaveStatus";

export function AssetLibraryForm({
  initial,
  onSave,
  onCancel,
  isSaving,
}: {
  initial: AssetLibrary | null;
  onSave: (next: Record<string, unknown>) => void | Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [draft, setDraft] = useState<AssetLibrary>(initial ?? {});

  const set = <K extends keyof AssetLibrary>(k: K, v: AssetLibrary[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const save = async () => {
    const cleaned = stripEmpty(draft);
    await onSave(cleaned as Record<string, unknown>);
  };

  const autosave = useAutosave(draft, save);
  useUnsavedChangesWarning(autosave.status === "dirty" || autosave.status === "saving");
  const onKeyDown = useSectionShortcuts({ save: () => void save(), cancel: onCancel });

  return (
    <div className="space-y-3" onKeyDown={onKeyDown}>
      <TextArea
        label="Photo library"
        value={draft.photoLibrary ?? ""}
        onChange={(v) => set("photoLibrary", v)}
        rows={3}
        maxLength={2000}
        hint="Where centre photos live, last shoot date, who has access."
      />
      <TextArea
        label="Video library"
        value={draft.videoLibrary ?? ""}
        onChange={(v) => set("videoLibrary", v)}
        rows={3}
        maxLength={2000}
      />
      <TextArea
        label="Testimonials"
        value={draft.testimonials ?? ""}
        onChange={(v) => set("testimonials", v)}
        rows={3}
        maxLength={2000}
        hint="Recent parent quotes — keep links to source if possible."
      />
      <TextArea
        label="Parent consent list"
        value={draft.parentConsentList ?? ""}
        onChange={(v) => set("parentConsentList", v)}
        rows={3}
        maxLength={2000}
        hint="Who's signed media releases, who hasn't, where the records live."
      />
      <TextArea
        label="Staff photos"
        value={draft.staffPhotos ?? ""}
        onChange={(v) => set("staffPhotos", v)}
        rows={3}
        maxLength={2000}
      />
      <TextArea
        label="Newsletter screenshots"
        value={draft.newsletterScreenshots ?? ""}
        onChange={(v) => set("newsletterScreenshots", v)}
        rows={3}
        maxLength={2000}
      />
      <TextArea
        label="Activation media"
        value={draft.activationMedia ?? ""}
        onChange={(v) => set("activationMedia", v)}
        rows={3}
        maxLength={2000}
        hint="Open day photos, event recap content, partnership co-branded media."
      />
      <TextArea
        label="Asset gaps"
        value={draft.assetGaps ?? ""}
        onChange={(v) => set("assetGaps", v)}
        rows={4}
        maxLength={5000}
        hint="What's missing — e.g. need fresh outdoor playtime photos, no testimonials from migrant families."
      />

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
        <AutosaveStatus status={autosave.status} lastSavedAt={autosave.lastSavedAt} errorMessage={autosave.errorMessage} />
        <FormActions onSave={() => void save()} onCancel={onCancel} isSaving={isSaving || autosave.status === "saving"} />
      </div>
    </div>
  );
}
