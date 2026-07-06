"use client";

/**
 * useEscapeClose — close a modal/drawer on Escape (2026-07-06 a11y
 * sweep). The 2026-07-05 audit found ~117 bespoke overlay modals with
 * no keyboard dismissal; this is the shared primitive they adopt.
 * Mount it inside the modal component itself so the listener only
 * exists while the modal is open.
 */

import { useEffect } from "react";

export function useEscapeClose(onClose: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, enabled]);
}
