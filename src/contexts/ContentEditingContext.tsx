"use client";

/**
 * ContentEditingContext — generic wiring for inline content overrides on
 * any panel that posts a `{ data: Record<string,string> }` map to a single
 * PATCH endpoint.
 *
 * Used by both /tools/the-amana-way (via AmanaWayContentProvider, which is
 * a thin alias kept for the original consumers) and /tools/handbook. The
 * panel reads text via `useContentText(id, defaultValue)` and images via
 * the EditableImage component.
 *
 * Shape mirrors the existing AmanaWayContentContext so callers can be
 * mechanically migrated.
 *
 * 2026-05-16.
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

export interface ContentEditingValue {
  /** Whether the current session is allowed to enter edit mode. */
  canEdit: boolean;
  /** Currently editing? */
  editing: boolean;
  /** PATCH in flight? */
  saving: boolean;
  /** Persisted overrides. */
  overrides: Record<string, string>;
  /** In-flight unsaved edits. */
  drafts: Record<string, string>;
  /** Enter edit mode (no-op if !canEdit). */
  enterEdit: () => void;
  /** Discard drafts + exit edit mode. */
  cancel: () => void;
  /** PATCH the merged map to the endpoint; toasts on result. */
  save: () => Promise<void>;
  /** Push a single id → value into drafts. */
  setDraft: (id: string, value: string) => void;
  /** draft → override → defaultValue. */
  read: (id: string, defaultValue: string) => string;
  /** Are there any drafts pending save? */
  dirty: boolean;
  /**
   * Upload an image to the shared /api/content-uploads endpoint and
   * resolve to the URL string. Image-bearing wrappers call this from
   * their replace overlays and then `setDraft(id, url)`.
   */
  uploadImage: (file: File) => Promise<string>;
}

const Ctx = createContext<ContentEditingValue | null>(null);

const UPLOAD_ENDPOINT = "/api/content-uploads";

interface ProviderProps {
  /**
   * The panel's PATCH endpoint (e.g. "/api/amana-way/content"). GET is the
   * caller's responsibility — initial overrides are passed in already
   * loaded so the page can render synchronously without a flash.
   */
  endpoint: string;
  initialOverrides: Record<string, string>;
  canEdit: boolean;
  children: ReactNode;
}

export function ContentEditingProvider({
  endpoint,
  initialOverrides,
  canEdit,
  children,
}: ProviderProps) {
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

  const setDraft = useCallback((id: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [id]: value }));
  }, []);

  const save = useCallback(async () => {
    if (!canEdit) return;
    setSaving(true);
    const next: Record<string, string> = { ...overrides, ...drafts };
    try {
      await mutateApi(endpoint, {
        method: "PATCH",
        body: { data: next },
      });
      setOverrides(next);
      setDrafts({});
      setEditing(false);
      toast({ description: "Content saved." });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save content";
      toast({ variant: "destructive", description: message });
    } finally {
      setSaving(false);
    }
  }, [canEdit, drafts, overrides, endpoint]);

  const read = useCallback(
    (id: string, defaultValue: string) => {
      if (editing && Object.prototype.hasOwnProperty.call(drafts, id)) {
        return drafts[id];
      }
      if (Object.prototype.hasOwnProperty.call(overrides, id)) {
        return overrides[id];
      }
      return defaultValue;
    },
    [editing, drafts, overrides],
  );

  const uploadImage = useCallback(async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(UPLOAD_ENDPOINT, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error || `Upload failed (${res.status})`);
    }
    const body = (await res.json()) as { url: string };
    return body.url;
  }, []);

  const value = useMemo<ContentEditingValue>(
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
      uploadImage,
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
      uploadImage,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * No-op fallback when no provider is mounted (storybook/test contexts).
 */
const NULL_VALUE: ContentEditingValue = {
  canEdit: false,
  editing: false,
  saving: false,
  overrides: {},
  drafts: {},
  enterEdit: () => {},
  cancel: () => {},
  save: async () => {},
  setDraft: () => {},
  read: (_id: string, def: string) => def,
  dirty: false,
  uploadImage: async () => {
    throw new Error("No ContentEditingProvider mounted");
  },
};

export function useContentEditing(): ContentEditingValue {
  return useContext(Ctx) ?? NULL_VALUE;
}

/** Convenience hook for components that only need to read a value. */
export function useContentText(id: string, defaultValue: string): string {
  return useContentEditing().read(id, defaultValue);
}
