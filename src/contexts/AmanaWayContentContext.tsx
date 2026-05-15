"use client";

/**
 * AmanaWayContentContext — back-compat shim around the generic
 * ContentEditingContext. Existing consumers (AmanaWayContentClient,
 * AmanaWayPanel via the Editable shim) keep working unchanged; the
 * actual state + persistence live in ContentEditingContext.
 *
 * 2026-05-15: original implementation shipped in #107.
 * 2026-05-16: extracted into ContentEditingContext + this thin alias
 *             so the Educators Handbook can reuse the same machinery.
 */

import { type ReactNode } from "react";
import {
  ContentEditingProvider,
  useContentEditing,
  type ContentEditingValue,
} from "./ContentEditingContext";

const AMANA_WAY_ENDPOINT = "/api/amana-way/content";

export function AmanaWayContentProvider({
  initialOverrides,
  canEdit,
  children,
}: {
  initialOverrides: Record<string, string>;
  canEdit: boolean;
  children: ReactNode;
}) {
  return (
    <ContentEditingProvider
      endpoint={AMANA_WAY_ENDPOINT}
      initialOverrides={initialOverrides}
      canEdit={canEdit}
    >
      {children}
    </ContentEditingProvider>
  );
}

export function useAmanaWayContent(): ContentEditingValue {
  return useContentEditing();
}

/** Convenience shorthand for `useAmanaWayContent().read(key, def)`. */
export function useAmanaWayText(key: string, defaultValue: string): string {
  return useContentEditing().read(key, defaultValue);
}
