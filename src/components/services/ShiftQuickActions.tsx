"use client";

/**
 * The jobs of a shift as big buttons (2026-10-08). On a phone at the gate,
 * "Sign in / out" should be one tap from the centre's front page, not a
 * hunt through Daily Ops. Links set ?tab=&sub= — the centre page follows
 * the URL.
 */
import Link from "next/link";
import { ClipboardCheck, ClipboardList, LogIn, Pill, Users } from "lucide-react";

const ACTIONS = [
  { label: "Sign in / out", tab: "daily", sub: "sign-in-out", icon: LogIn },
  { label: "Roll call", tab: "daily", sub: "roll-call", icon: ClipboardList },
  { label: "Headcount", tab: "compliance", sub: "headcounts", icon: Users },
  { label: "Checklists", tab: "daily", sub: "checklists", icon: ClipboardCheck },
  { label: "Medication", tab: "daily", sub: "medication", icon: Pill },
] as const;

export function ShiftQuickActions({ serviceId }: { serviceId: string }) {
  return (
    <nav aria-label="Shift actions" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {ACTIONS.map(({ label, tab, sub, icon: Icon }) => (
        <Link
          key={sub}
          href={`/services/${serviceId}?tab=${tab}&sub=${sub}`}
          className="flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-2 py-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-surface active:bg-surface last:col-span-2 sm:last:col-span-1"
        >
          <Icon className="h-6 w-6 text-brand" aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );
}
