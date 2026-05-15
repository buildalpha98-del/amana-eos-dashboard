"use client";

/**
 * AmanaContentProvider — content-override layer for the Amana Way + Educators
 * Handbook tools.
 *
 * Wraps a panel component and provides a context that:
 *   - fetches GET /api/amana-content/[key] on mount to load overrides
 *   - exposes `getValue(key, default)` so wrappers render override OR default
 *   - tracks edit-mode state + a draft buffer
 *   - saves via PATCH /api/amana-content/[key]
 *   - exposes `canEdit` (owner/admin only) so the panel can render Edit UI
 *
 * Non-admin users get a no-op provider — the panel still renders, all
 * wrappers fall through to their defaults. Visual output is byte-identical
 * to the original hardcoded JSX.
 *
 * 2026-05-15: Amana Way editable content + Educators Handbook embed.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "next-auth/react";
import type { Role } from "@prisma/client";
import { toast } from "@/hooks/useToast";

const EDIT_ROLES: ReadonlySet<Role> = new Set(["owner", "admin"]);

type Overrides = Record<string, string>;

interface AmanaContentContextValue {
  contentKey: string;
  /** Has the GET roundtrip resolved (success or failure)? */
  loaded: boolean;
  /** Is the current user allowed to enter edit mode? */
  canEdit: boolean;
  /** Currently active mode. */
  mode: "view" | "edit";
  /** Persisted overrides from the server. */
  overrides: Overrides;
  /** In-flight draft (edit mode only). */
  draft: Overrides;
  /** Is the draft different from `overrides`? */
  dirty: boolean;
  /** Is a save request in flight? */
  saving: boolean;
  enterEdit: () => void;
  cancelEdit: () => void;
  save: () => Promise<void>;
  /** Read the current value for a key (override → draft if editing → default). */
  getValue: (key: string, defaultValue: string) => string;
  /** Update the draft for a key (only meaningful in edit mode). */
  setDraft: (key: string, value: string) => void;
  /** Upload an image; resolves to the resulting URL. */
  uploadImage: (file: File) => Promise<string>;
}

const AmanaContentContext = createContext<AmanaContentContextValue | null>(null);

/**
 * Provides the editable-content layer to descendant `<E>`, `<EImg>`,
 * `<EArrText>` and `<EditBar />` components.
 */
export function AmanaContentProvider({
  contentKey,
  children,
}: {
  contentKey: string;
  children: ReactNode;
}) {
  const { data: session } = useSession();
  const role = session?.user?.role as Role | undefined;
  const canEdit = !!role && EDIT_ROLES.has(role);

  const [loaded, setLoaded] = useState(false);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [draft, setDraft] = useState<Overrides>({});
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/amana-content/${contentKey}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { data: {} }))
      .then((body: { data?: Overrides }) => {
        if (cancelled) return;
        setOverrides(body.data ?? {});
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [contentKey]);

  const dirty = useMemo(() => {
    const keys = new Set([...Object.keys(overrides), ...Object.keys(draft)]);
    for (const k of keys) {
      if ((overrides[k] ?? "") !== (draft[k] ?? "")) return true;
    }
    return false;
  }, [overrides, draft]);

  const enterEdit = useCallback(() => {
    setDraft({ ...overrides });
    setMode("edit");
  }, [overrides]);

  const cancelEdit = useCallback(() => {
    if (
      dirty &&
      typeof window !== "undefined" &&
      !window.confirm("Discard your unsaved changes?")
    ) {
      return;
    }
    setDraft({});
    setMode("view");
  }, [dirty]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      // Strip empty overrides so they fall back to default and we don't
      // bloat the row.
      const cleaned: Overrides = {};
      for (const [k, v] of Object.entries(draft)) {
        if (typeof v === "string" && v.length > 0) cleaned[k] = v;
      }
      const res = await fetch(`/api/amana-content/${contentKey}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data: cleaned }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Save failed (${res.status})`);
      }
      const body = (await res.json()) as { data?: Overrides };
      setOverrides(body.data ?? cleaned);
      setDraft({});
      setMode("view");
      toast({ description: "Changes saved" });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not save changes";
      toast({ variant: "destructive", description: message });
    } finally {
      setSaving(false);
    }
  }, [contentKey, draft]);

  const getValue = useCallback(
    (key: string, defaultValue: string) => {
      if (mode === "edit") {
        if (Object.prototype.hasOwnProperty.call(draft, key)) {
          return draft[key];
        }
      }
      if (Object.prototype.hasOwnProperty.call(overrides, key)) {
        return overrides[key];
      }
      return defaultValue;
    },
    [mode, draft, overrides],
  );

  const setDraftValue = useCallback((key: string, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const uploadImage = useCallback(
    async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/amana-content/${contentKey}/upload`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Upload failed (${res.status})`);
      }
      const body = (await res.json()) as { url: string };
      return body.url;
    },
    [contentKey],
  );

  const value = useMemo<AmanaContentContextValue>(
    () => ({
      contentKey,
      loaded,
      canEdit,
      mode,
      overrides,
      draft,
      dirty,
      saving,
      enterEdit,
      cancelEdit,
      save,
      getValue,
      setDraft: setDraftValue,
      uploadImage,
    }),
    [
      contentKey,
      loaded,
      canEdit,
      mode,
      overrides,
      draft,
      dirty,
      saving,
      enterEdit,
      cancelEdit,
      save,
      getValue,
      setDraftValue,
      uploadImage,
    ],
  );

  return (
    <AmanaContentContext.Provider value={value}>
      {children}
    </AmanaContentContext.Provider>
  );
}

/**
 * Hook returning the current `AmanaContent` context, or `null` if no
 * provider is mounted. Wrappers degrade to "default value" rendering when
 * null, so they can be reused outside an editable container.
 */
export function useAmanaContent(): AmanaContentContextValue | null {
  return useContext(AmanaContentContext);
}
