"use client";

import Link from "next/link";

interface SectionLabelProps {
  label: string;
  action?: { href: string; text: string };
}

export function SectionLabel({ label, action }: SectionLabelProps) {
  return (
    <div className="flex items-baseline justify-between mb-3">
      <h2 className="text-[11px] font-heading font-semibold text-[color:var(--color-muted)] uppercase tracking-[0.08em]">
        {label}
      </h2>
      {action && (
        <Link
          href={action.href}
          className="text-xs font-medium text-[color:var(--color-brand)] hover:text-[color:var(--color-brand-light)] min-h-[44px] flex items-center"
        >
          {action.text}
        </Link>
      )}
    </div>
  );
}
