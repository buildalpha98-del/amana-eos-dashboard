"use client";

/**
 * The "?" in the top bar (2026-10-07). The welcome tour promised help
 * behind a "?" — but that was a KEYBOARD shortcut, so on a phone there was
 * nothing to find. This is a real button, on phone and desktop, gathering
 * every way to get help in one place.
 */
import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { BookOpen, Bot, HelpCircle, Keyboard, MessageSquarePlus, PlayCircle } from "lucide-react";
import { useEscapeClose } from "@/hooks/useEscapeClose";
import { openHelp, type HelpEvent } from "@/lib/help-events";
import { cn } from "@/lib/utils";

export function HelpMenu({
  compact = false,
  onDark = false,
}: {
  compact?: boolean;
  /** Sitting on the dark top-bar nav rather than a light header. */
  onDark?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { data: session } = useSession();
  useEscapeClose(() => setOpen(false), open);
  const isStaff = session?.user?.role === "staff";

  const fire = (e: HelpEvent) => () => {
    setOpen(false);
    openHelp(e);
  };

  const itemClass =
    "w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground/80 hover:bg-surface transition-colors text-left";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Help"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Help"
        className={cn(
          "inline-flex items-center justify-center rounded-lg transition-colors",
          onDark
            ? "text-white/80 hover:bg-white/10 hover:text-white"
            : "text-muted hover:bg-surface hover:text-foreground",
          compact ? "h-8 w-8" : "h-9 w-9",
        )}
      >
        <HelpCircle className={compact ? "w-4 h-4" : "w-5 h-5"} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="menu"
            aria-label="Help"
            className="absolute right-0 top-full mt-2 w-64 bg-card border border-border rounded-xl shadow-lg py-1 z-50"
          >
            <Link
              role="menuitem"
              href={isStaff ? "/tools/handbook" : "/handbook?tab=help"}
              onClick={() => setOpen(false)}
              className={itemClass}
            >
              <BookOpen className="w-4 h-4 text-brand" aria-hidden />
              {isStaff ? "Staff Handbook" : "Help & how-to guides"}
            </Link>
            <button role="menuitem" type="button" onClick={fire("assistant")} className={itemClass}>
              <Bot className="w-4 h-4 text-brand" aria-hidden />
              Ask Amana AI
            </button>
            <button role="menuitem" type="button" onClick={fire("tour")} className={itemClass}>
              <PlayCircle className="w-4 h-4 text-brand" aria-hidden />
              Replay the welcome tour
            </button>
            <button role="menuitem" type="button" onClick={fire("feedback")} className={itemClass}>
              <MessageSquarePlus className="w-4 h-4 text-brand" aria-hidden />
              Send feedback or report a problem
            </button>
            {!isStaff && (
              <button
                role="menuitem"
                type="button"
                onClick={fire("shortcuts")}
                className={cn(itemClass, "hidden md:flex")}
              >
                <Keyboard className="w-4 h-4 text-brand" aria-hidden />
                Keyboard shortcuts
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
