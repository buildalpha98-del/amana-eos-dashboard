"use client";

/**
 * AmanaWayContentContext — wires the Amana Way page's view/edit
 * state, override map and persistence to the children of the page.
 *
 * The panel reads text via `useAmanaWayText(key, defaultValue)`,
 * which returns either:
 *   - the in-flight draft (if editing AND a draft exists for `key`)
 *   - the persisted override (if one exists for `key`)
 *   - the caller's `defaultValue` (no override, no draft)
 *
 * Editing controls live on the parent page wrapper. The reader
 * hook is stable across renders so we don't need to memo it for
 * every Editable usage site.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

interface AmanaWayContentValue {
  canEdit: boolean;
  editing: boolean;
  saving: boolean;
  overrides: Record<string, string>;
  drafts: Record<string, string>;
  enterEdit: () => void;
  cancel: () => void;
  save: () => Promise<void>;
  setDraft: (key: string, value: string) => void;
  /** Read the current value for `key` (draft → override → default). */
  read: (key: string, defaultValue: string) => string;
  dirty: boolean;
}

const Ctx = createContext<AmanaWayContentValue | null>(null);

export function AmanaWayContentProvider({
  initialOverrides,
  canEdit,
  children,
}: {
  initialOverrides: Record<string, string>;
  canEdit: boolean;
  children: ReactNode;
}) {
  const [overrides, setOverrides] = useState<Record<string, string>>(
    initialOverrides,
  );
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const enterEdit = useCallback(() => {
    if (!canEdit) return;
    setDrafts({});
    setEditing(true);
  }, [canEdit]);

  const cancel = useCallback(() => {
    setDrafts({});
    setEditing(false);
  }, []);

  const setDraft = useCallback((key: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [key]: value }));
  }, []);

  const save = useCallback(async () => {
    if (!canEdit) return;
    setSaving(true);
    // Merge drafts over the existing overrides — empty strings are
    // kept as explicit overrides (lets admins null-out a default).
    const next: Record<string, string> = { ...overrides, ...drafts };
    try {
      await mutateApi(`/api/amana-way/content`, {
        method: "PATCH",
        body: { data: next },
      });
      setOverrides(next);
      setDrafts({});
      setEditing(false);
      toast({ description: "Amana Way content saved." });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save content";
      toast({ variant: "destructive", description: message });
    } finally {
      setSaving(false);
    }
  }, [canEdit, drafts, overrides]);

  const read = useCallback(
    (key: string, defaultValue: string) => {
      if (editing && Object.prototype.hasOwnProperty.call(drafts, key)) {
        return drafts[key];
      }
      if (Object.prototype.hasOwnProperty.call(overrides, key)) {
        return overrides[key];
      }
      return defaultValue;
    },
    [editing, drafts, overrides],
  );

  const value = useMemo<AmanaWayContentValue>(
    () => ({
      canEdit,
      editing,
      saving,
      overrides,
      drafts,
      enterEdit,
      cancel,
      save,
      setDraft,
      read,
      dirty: Object.keys(drafts).length > 0,
    }),
    [
      canEdit,
      editing,
      saving,
      overrides,
      drafts,
      enterEdit,
      cancel,
      save,
      setDraft,
      read,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAmanaWayContent(): AmanaWayContentValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Outside a provider — return a no-op fallback so the panel
    // can still render in storybook/test contexts.
    return {
      canEdit: false,
      editing: false,
      saving: false,
      overrides: {},
      drafts: {},
      enterEdit: () => {},
      cancel: () => {},
      save: async () => {},
      setDraft: () => {},
      read: (_k: string, def: string) => def,
      dirty: false,
    };
  }
  return ctx;
}

/** Convenience shorthand for `useAmanaWayContent().read(key, def)`. */
export function useAmanaWayText(key: string, defaultValue: string): string {
  return useAmanaWayContent().read(key, defaultValue);
}
