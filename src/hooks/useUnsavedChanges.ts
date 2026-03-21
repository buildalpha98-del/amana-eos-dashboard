"use client";

import { useEffect, useState, useCallback } from "react";

/**
 * Hook that warns users about unsaved changes when they try to:
 * 1. Close/refresh the browser tab (beforeunload)
 * 2. Navigate away via Next.js router (popstate for back button)
 *
 * Usage:
 *   const { isDirty, setDirty, clearDirty } = useUnsavedChanges(hasChanges);
 */
export function useUnsavedChanges(dirty?: boolean) {
  const [internalDirty, setInternalDirty] = useState(false);

  // Allow external control or internal control
  const isDirty = dirty ?? internalDirty;

  const setDirty = useCallback(() => setInternalDirty(true), []);
  const clearDirty = useCallback(() => setInternalDirty(false), []);

  // Browser close / refresh warning
  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers ignore custom messages but still show the dialog
      e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
      return e.returnValue;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // Back/forward navigation warning (popstate)
  useEffect(() => {
    if (!isDirty) return;

    const handlePopState = () => {
      const confirmLeave = window.confirm(
        "You have unsaved changes. Are you sure you want to leave this page?"
      );
      if (!confirmLeave) {
        // Push back to the current page to prevent navigation
        window.history.pushState(null, "", window.location.href);
      }
    };

    // Push a state so we can intercept back
    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [isDirty]);

  return { isDirty, setDirty, clearDirty };
}
