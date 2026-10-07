/**
 * Window events the Help menu (src/components/layout/HelpMenu.tsx) uses to
 * open things that live elsewhere in the layout — the welcome tour, the AI
 * assistant, the feedback form and the shortcuts overlay — without lifting
 * their state into a shared provider. Each owner listens with useHelpEvent.
 */
"use client";

import { useEffect } from "react";

export type HelpEvent = "tour" | "assistant" | "feedback" | "shortcuts";

const eventName = (e: HelpEvent) => `amana:open-${e}`;

export function openHelp(e: HelpEvent): void {
  window.dispatchEvent(new CustomEvent(eventName(e)));
}

export function useHelpEvent(e: HelpEvent, handler: () => void): void {
  useEffect(() => {
    const name = eventName(e);
    window.addEventListener(name, handler);
    return () => window.removeEventListener(name, handler);
  }, [e, handler]);
}
