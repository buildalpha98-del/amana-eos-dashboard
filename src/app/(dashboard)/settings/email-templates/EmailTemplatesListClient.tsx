"use client";

import Link from "next/link";
import { Pencil, RotateCcw, Layers } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import type { EmailTemplateManifestEntry } from "@/lib/email-template-manifest";

type Row = EmailTemplateManifestEntry & {
  override: { subject: string; body: string } | null;
};

export function EmailTemplatesListClient({ rows }: { rows: Row[] }) {
  // Group by category
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    if (!groups.has(r.category)) groups.set(r.category, []);
    groups.get(r.category)!.push(r);
  }

  const overrideCount = rows.filter((r) => r.override).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Email templates"
        description={`Editable subject + body for the dashboard's transactional emails. Variables substitute via {{name}} placeholders. ${overrideCount === 0 ? "All templates currently use the code defaults." : `${overrideCount} template${overrideCount === 1 ? " has" : "s have"} an admin override active.`}`}
      />

      {[...groups.entries()].map(([category, items]) => (
        <div
          key={category}
          className="rounded-lg border border-border bg-card p-5 space-y-3"
        >
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-foreground">{category}</h2>
            {items.length >= 3 && (
              <Link
                href={`/settings/email-templates/bulk/${encodeURIComponent(category)}`}
                className="inline-flex items-center gap-1 text-xs text-brand hover:text-brand-hover font-medium"
              >
                <Layers className="h-3 w-3" />
                Bulk edit {items.length}
              </Link>
            )}
          </div>
          <div className="divide-y divide-border">
            {items.map((item) => (
              <Link
                key={item.key}
                href={`/settings/email-templates/${encodeURIComponent(item.key)}`}
                className="flex items-start gap-4 py-3 hover:bg-surface/40 -mx-2 px-2 rounded-md transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {item.label}
                    </span>
                    {item.override && (
                      <span className="text-[10px] uppercase tracking-wider font-semibold bg-brand/15 text-brand px-1.5 py-0.5 rounded">
                        Overridden
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    {item.description}
                  </div>
                  <code className="text-[10px] font-mono text-muted/70 mt-1 block">
                    {item.key}
                  </code>
                </div>
                <div className="flex items-center gap-1 text-muted text-xs">
                  {item.override ? (
                    <>
                      <Pencil className="h-3 w-3" />
                      Edit
                    </>
                  ) : (
                    <>
                      <RotateCcw className="h-3 w-3" />
                      Default
                    </>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}

      {rows.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <p className="text-sm text-muted">
            No editable templates registered yet. Add entries to{" "}
            <code className="font-mono">src/lib/email-template-manifest.ts</code>{" "}
            to expose more.
          </p>
        </div>
      )}
    </div>
  );
}
