"use client";

/**
 * QuickActions — the phone-in-hand shortcuts on /my-day: photo post,
 * headcount, incident. (Roll call has its own dedicated callout right
 * above this grid, so it isn't repeated here.)
 *
 * Carried over from MyDayNowCard's action grid when Phase 2 replaced
 * that card's stat tiles with the SessionSnapshot strip.
 */

import Link from "next/link";
import { Camera, ShieldAlert, Users } from "lucide-react";

export function QuickActions({ serviceId }: { serviceId: string }) {
  const svc = `/services/${serviceId}`;
  const actions = [
    {
      href: `${svc}?tab=daily&sub=posts`,
      label: "Post a photo",
      icon: Camera,
    },
    {
      href: `${svc}?tab=compliance&sub=headcounts`,
      label: "Headcount",
      icon: Users,
    },
    {
      href: `${svc}?tab=compliance&sub=incidents`,
      label: "Incident",
      icon: ShieldAlert,
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {actions.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className="flex min-h-[64px] flex-col justify-center gap-1 rounded-xl border border-border bg-card p-3 transition-colors active:bg-surface"
        >
          <a.icon className="h-5 w-5 text-brand" aria-hidden />
          <span className="text-sm font-medium text-foreground">
            {a.label}
          </span>
        </Link>
      ))}
    </div>
  );
}
