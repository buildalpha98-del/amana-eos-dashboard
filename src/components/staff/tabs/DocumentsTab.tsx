import type { Document } from "@prisma/client";
import { Download, FileText } from "lucide-react";

interface DocumentsTabProps {
  documents: Document[];
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function DocumentsTab({ documents }: DocumentsTabProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Documents</h3>
        {documents.length === 0 ? (
          <p className="text-sm text-muted">No documents uploaded for this staff member.</p>
        ) : (
          <ul className="divide-y divide-border">
            {documents.map((d) => (
              <li key={d.id} className="py-3 flex flex-wrap items-center gap-3">
                <FileText className="w-4 h-4 text-muted shrink-0" />
                <div className="flex-1 min-w-[200px]">
                  <div className="text-sm font-medium text-foreground">{d.title}</div>
                  <div className="text-xs text-muted">
                    {humanize(d.category)} · {formatDate(d.createdAt)}
                  </div>
                </div>
                <a
                  href={d.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-brand hover:underline"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
