"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { X, Keyboard } from "lucide-react";
import { useQuickAdd } from "@/components/quick-add/QuickAddProvider";

// ---------------------------------------------------------------------------
// Shortcut data
// ---------------------------------------------------------------------------

interface ShortcutEntry {
  keys: string[];
  label: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: ShortcutEntry[];
}

const shortcutGroups: ShortcutGroup[] = [
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["\u2318", "K"], label: "Command Palette" },
      { keys: ["G", "D"], label: "Go to Dashboard" },
      { keys: ["G", "T"], label: "Go to Todos" },
      { keys: ["G", "R"], label: "Go to Rocks" },
      { keys: ["G", "I"], label: "Go to Issues" },
      { keys: ["G", "S"], label: "Go to Services" },
      { keys: ["G", "M"], label: "Go to Meetings" },
    ],
  },
  {
    title: "Actions",
    shortcuts: [
      { keys: ["C"], label: "Quick Create" },
      { keys: ["N"], label: "Check notifications" },
      { keys: ["Esc"], label: "Close modal / panel" },
    ],
  },
  {
    title: "Help",
    shortcuts: [{ keys: ["?"], label: "Toggle this shortcut overlay" }],
  },
];

// G-key navigation map
const gNavMap: Record<string, string> = {
  d: "/dashboard",
  t: "/todos",
  r: "/rocks",
  i: "/issues",
  s: "/services",
  m: "/meetings",
};

// ---------------------------------------------------------------------------
// Helper: is the user focused on an editable element?
// ---------------------------------------------------------------------------

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (target.isContentEditable) return true;
  // Also skip if inside a [role="dialog"] with an input focused
  return false;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function KeyboardShortcuts() {
  const router = useRouter();
  const { openTodoModal } = useQuickAdd();
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [gPending, setGPending] = useState(false);
  const gTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const clearGPending = useCallback(() => {
    setGPending(false);
    if (gTimeoutRef.current) {
      clearTimeout(gTimeoutRef.current);
      gTimeoutRef.current = undefined;
    }
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Skip if typing in an editable element
      if (isEditableTarget(e.target)) return;
      // Skip if any modifier is held (except shift for ?)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // --- ? key (Shift + /) ---
      if (e.key === "?") {
        e.preventDefault();
        setOverlayOpen((prev) => !prev);
        clearGPending();
        return;
      }

      // --- Escape ---
      if (e.key === "Escape") {
        if (overlayOpen) {
          setOverlayOpen(false);
        }
        clearGPending();
        return;
      }

      // If the overlay is open, don't process other shortcuts
      if (overlayOpen) return;

      // --- G chord (second key) ---
      if (gPending) {
        const dest = gNavMap[e.key.toLowerCase()];
        if (dest) {
          e.preventDefault();
          router.push(dest);
        }
        clearGPending();
        return;
      }

      // --- G key (start chord) ---
      if (e.key === "g" || e.key === "G") {
        e.preventDefault();
        setGPending(true);
        gTimeoutRef.current = setTimeout(() => {
          setGPending(false);
        }, 1000);
        return;
      }

      // --- C key → Quick Create ---
      if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        openTodoModal();
        return;
      }

      // --- N key → focus notifications (click the notification bell) ---
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        const bell = document.querySelector<HTMLButtonElement>(
          '[data-testid="notification-bell"], [aria-label="Notifications"]'
        );
        if (bell) bell.click();
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [overlayOpen, gPending, clearGPending, router, openTodoModal]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (gTimeoutRef.current) clearTimeout(gTimeoutRef.current);
    };
  }, []);

  return (
    <>
      {/* G-pending indicator */}
      {gPending && (
        <div className="fixed bottom-4 right-4 z-50 hidden md:flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg shadow-lg text-sm text-muted-foreground animate-in fade-in duration-150">
          <kbd className="px-1.5 py-0.5 bg-surface border border-border rounded text-xs font-mono font-medium">
            g
          </kbd>
          <span className="text-muted-foreground/70">...</span>
        </div>
      )}

      {/* Shortcut overlay */}
      {overlayOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOverlayOpen(false);
          }}
        >
          <div role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" className="bg-card border border-border rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-3">
              <div className="flex items-center gap-2.5">
                <Keyboard className="w-5 h-5 text-muted-foreground" />
                <h2 className="text-base font-semibold text-foreground">
                  Keyboard Shortcuts
                </h2>
              </div>
              <button
                onClick={() => setOverlayOpen(false)}
                aria-label="Close keyboard shortcuts"
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Shortcut groups */}
            <div className="px-6 pb-4 space-y-5 max-h-[60vh] overflow-y-auto">
              {shortcutGroups.map((group) => (
                <div key={group.title}>
                  <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
                    {group.title}
                  </h3>
                  <div className="space-y-1.5">
                    {group.shortcuts.map((shortcut) => (
                      <div
                        key={shortcut.label}
                        className="flex items-center justify-between py-1.5"
                      >
                        <span className="text-sm text-foreground">
                          {shortcut.label}
                        </span>
                        <div className="flex items-center gap-1">
                          {shortcut.keys.map((key, i) => (
                            <span key={i} className="flex items-center gap-1">
                              {i > 0 && (
                                <span className="text-xs text-muted-foreground/50 mx-0.5">
                                  then
                                </span>
                              )}
                              <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 bg-surface border border-border rounded-md text-xs font-mono font-medium text-muted-foreground">
                                {key}
                              </kbd>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="border-t border-border px-6 py-3 flex items-center justify-center">
              <p className="text-xs text-muted-foreground">
                Press{" "}
                <kbd className="px-1.5 py-0.5 bg-surface border border-border rounded text-[10px] font-mono font-medium">
                  ?
                </kbd>{" "}
                to toggle this help
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
