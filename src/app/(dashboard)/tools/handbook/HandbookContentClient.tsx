"use client";

/**
 * Client-side container for `/tools/handbook`. Mirrors the structure of
 * AmanaWayContentClient but points the ContentEditingProvider at the
 * Educators Handbook endpoint.
 *
 * 2026-05-16.
 */

import { useRouter } from "next/navigation";
import { Pencil, Save, X, Loader2 } from "lucide-react";
import AmanaHandbookPanel from "@/components/shared/AmanaHandbookPanel";
import {
  ContentEditingProvider,
  useContentEditing,
} from "@/contexts/ContentEditingContext";

const HANDBOOK_ENDPOINT = "/api/amana-handbook/content";

interface Props {
  initialOverrides: Record<string, string>;
  canEdit: boolean;
}

export function HandbookContentClient({ initialOverrides, canEdit }: Props) {
  return (
    <div className="-mx-4 -mt-4 -mb-20 md:-mx-8 md:-mt-8 md:-mb-8 relative h-[calc(100dvh-8rem)] md:h-[calc(100dvh-4rem)] overflow-hidden">
      <ContentEditingProvider
        endpoint={HANDBOOK_ENDPOINT}
        initialOverrides={initialOverrides}
        canEdit={canEdit}
      >
        <EditToolbar />
        <AmanaHandbookPanel />
      </ContentEditingProvider>
    </div>
  );
}

function EditToolbar() {
  const { canEdit, editing, saving, dirty, enterEdit, cancel, save } =
    useContentEditing();
  const router = useRouter();

  if (!canEdit) return null;

  async function handleSave() {
    await save();
    router.refresh();
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        right: 16,
        zIndex: 30,
        display: "flex",
        gap: 8,
        pointerEvents: "auto",
      }}
    >
      {!editing && (
        <button
          type="button"
          onClick={enterEdit}
          className="inline-flex items-center gap-1.5 rounded-md bg-white/95 px-3 py-1.5 text-sm font-medium text-[#1A4F5C] shadow-sm hover:bg-white"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </button>
      )}
      {editing && (
        <>
          <button
            type="button"
            onClick={cancel}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-white/95 px-3 py-1.5 text-sm font-medium text-foreground shadow-sm hover:bg-white disabled:opacity-60"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#F5A623] px-3 py-1.5 text-sm font-semibold text-[#0F3340] shadow-sm hover:brightness-105 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save changes
          </button>
        </>
      )}
    </div>
  );
}
