"use client";

import Link from "next/link";
import { ArrowRight, Building2, ClipboardCheck, LogIn, ShieldAlert } from "lucide-react";

/** Centre work stays one tap away without adding management or payroll access. */
export function EducatorShiftActions({ service }: { service: { id: string; name: string } }) {
  const base = `/services/${service.id}`;
  const actions = [
    { label: "Centre today", detail: "Room coverage and handover", href: base, icon: Building2 },
    { label: "Children’s attendance", detail: "Sign in, sign out and roll call", href: `${base}?tab=daily&sub=roll-call`, icon: LogIn },
    { label: "Checklists", detail: "Opening, session and closing tasks", href: `${base}?tab=daily&sub=checklists`, icon: ClipboardCheck },
    { label: "Record an incident", detail: "Open the incident register", href: `${base}?tab=compliance&sub=incidents`, icon: ShieldAlert },
  ];

  return (
    <section aria-labelledby="educator-shift-actions" className="space-y-3">
      <h2 id="educator-shift-actions" className="font-heading text-base font-semibold text-foreground">At {service.name}</h2>
      <nav aria-label="Your shift actions" className="grid gap-3 sm:grid-cols-2">
        {actions.map(({ label, detail, href, icon: Icon }) => (
          <Link key={href} href={href} className="flex min-h-11 items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-surface">
            <Icon className="h-5 w-5 shrink-0 text-brand" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">{label}</span>
              <span className="block text-xs text-muted">{detail}</span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          </Link>
        ))}
      </nav>
    </section>
  );
}
