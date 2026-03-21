import { useEffect } from "react";

/**
 * Closes a modal/panel/overlay when the Escape key is pressed.
 * Only attaches the listener when `isOpen` is true.
 */
export function useEscapeKey(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);
}
