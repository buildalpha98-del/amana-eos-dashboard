"use client";

/**
 * The child's enrolment, from a staff point of view.
 *
 * Two things staff kept asking for and couldn't reach from here: the
 * enrolment form itself, and the files the family attached to it — birth
 * certificate, immunisation history, a photo of the child, court orders.
 *
 * Those attachments live on the SUBMISSION as JSON rather than as
 * ChildDocument rows, so the Documents tab (which lists ChildDocuments)
 * showed none of them. Someone checking whether a birth certificate had
 * been supplied would conclude it hadn't.
 */

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FileText, Paperclip } from "lucide-react";
import { fetchApi } from "@/lib/fetch-api";
import { Skeleton } from "@/components/ui/Skeleton";

interface EnrolmentDoc {
  id: string;
  label: string;
  fileName: string;
  fileUrl: string;
}

export function ChildEnrolmentDocsCard({
  childId,
  enrolmentId,
}: {
  childId: string;
  enrolmentId: string | null;
}) {
  const { data, isLoading } = useQuery<{ enrolmentDocs?: EnrolmentDoc[] }>({
    queryKey: ["child", childId, "enrolment-docs"],
    // Same reader the family sees, so staff and parents are looking at
    // one list rather than two that can disagree.
    queryFn: () => fetchApi(`/api/children/${childId}/documents`),
    retry: 1,
  });

  if (!enrolmentId) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-muted">
          This child has no enrolment record — they were added directly
          rather than through the enrolment form.
        </p>
      </div>
    );
  }

  const docs = data?.enrolmentDocs ?? [];

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Enrolment form
          </h3>
          <p className="text-xs text-muted mt-0.5">
            What the family submitted, and everything they attached to it.
          </p>
        </div>
        <a
          href={`/api/enrolments/${enrolmentId}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-surface transition-colors min-h-11"
        >
          <FileText className="w-4 h-4" />
          View full form
          <ExternalLink className="w-3.5 h-3.5 text-muted" />
        </a>
      </div>

      {isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : docs.length === 0 ? (
        <p className="text-sm text-muted">
          No documents were attached to this enrolment.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {docs.map((d) => (
            <li key={d.id}>
              <a
                href={d.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 py-2.5 min-h-11 group"
              >
                <Paperclip className="w-4 h-4 shrink-0 text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-foreground truncate group-hover:text-brand">
                    {d.label}
                  </span>
                  {d.fileName && d.fileName !== d.label && (
                    <span className="block text-xs text-muted truncate">
                      {d.fileName}
                    </span>
                  )}
                </span>
                <ExternalLink className="w-3.5 h-3.5 shrink-0 text-muted" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
