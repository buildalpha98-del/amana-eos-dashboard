"use client";

/**
 * Admin "Needs review" panel on /documents (2026-10-07). Loose documents —
 * no centre, not org-wide, not assigned — are visible only to admins and
 * their uploader now (src/lib/document-visibility.ts). This puts each one in
 * front of an admin with a one-click decision, so nothing meant for staff
 * silently disappears and nothing personal stays loose.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, ChevronUp, FileText, UserCheck } from "lucide-react";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { useTeam } from "@/hooks/useTeam";
import { useServices } from "@/hooks/useServices";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface ReviewDoc {
  id: string;
  title: string;
  fileName: string;
  category: string;
  createdAt: string;
  uploadedBy: { id: string; name: string } | null;
  folder: { id: string; name: string } | null;
  looksPersonal: boolean;
  suggestedAssignee: { id: string; name: string } | null;
}

type Fix =
  | { assignedToId: string }
  | { allServices: true }
  | { centreId: string };

const selectClass =
  "rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-brand/20";

export function DocumentReviewPanel() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data } = useQuery<{ documents: ReviewDoc[]; total: number }>({
    queryKey: ["documents-review"],
    queryFn: () => fetchApi("/api/documents/review"),
    staleTime: 60_000,
    retry: 2,
  });

  const fix = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Fix }) =>
      mutateApi(`/api/documents/${id}`, { method: "PATCH", body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents-review"] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast({ description: "Document updated" });
    },
    onError: (err: Error) => toast({ variant: "destructive", description: err.message }),
  });

  const docs = data?.documents ?? [];
  if (docs.length === 0) return null;
  const personal = docs.filter((d) => d.looksPersonal).length;

  return (
    <section
      className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40"
      data-testid="document-review-panel"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-3 p-4 text-left"
        aria-expanded={open}
      >
        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-foreground">
            {docs.length} document{docs.length === 1 ? " isn't" : "s aren't"} shared with anyone yet
          </span>
          <span className="block text-xs text-muted mt-0.5">
            Only admins and the uploader can see {docs.length === 1 ? "it" : "them"}.
            {personal > 0 &&
              ` ${personal} look${personal === 1 ? "s" : ""} personal (contracts, certificates…) — assign ${personal === 1 ? "it" : "them"} to the right person.`}
          </span>
        </span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted shrink-0 mt-0.5" aria-hidden />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted shrink-0 mt-0.5" aria-hidden />
        )}
      </button>

      {open && (
        <ul className="divide-y divide-amber-200/70 dark:divide-amber-800/60 border-t border-amber-200 dark:border-amber-800">
          {docs.map((doc) => (
            <ReviewRow
              key={doc.id}
              doc={doc}
              busy={fix.isPending && fix.variables?.id === doc.id}
              onFix={(body) => fix.mutate({ id: doc.id, body })}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ReviewRow({
  doc,
  busy,
  onFix,
}: {
  doc: ReviewDoc;
  busy: boolean;
  onFix: (body: Fix) => void;
}) {
  const { data: team } = useTeam();
  const { data: services } = useServices();

  return (
    <li className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex items-start gap-2.5 min-w-0 flex-1">
        <FileText className="w-4 h-4 text-muted shrink-0 mt-0.5" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {doc.title}
            {doc.looksPersonal && (
              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-semibold bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 align-middle">
                Looks personal
              </span>
            )}
          </p>
          <p className="text-xs text-muted truncate">
            {doc.fileName}
            {doc.uploadedBy ? ` · uploaded by ${doc.uploadedBy.name}` : ""}
            {doc.folder ? ` · ${doc.folder.name}` : ""}
          </p>
        </div>
      </div>

      <div className={cn("flex flex-wrap items-center gap-2", busy && "opacity-60 pointer-events-none")}>
        {doc.suggestedAssignee && (
          <Button
            size="xs"
            variant="primary"
            onClick={() => onFix({ assignedToId: doc.suggestedAssignee!.id })}
          >
            <UserCheck className="w-3.5 h-3.5" aria-hidden />
            Assign to {doc.suggestedAssignee.name}
          </Button>
        )}
        <select
          aria-label={`Assign ${doc.title} to a staff member`}
          className={selectClass}
          value=""
          onChange={(e) => e.target.value && onFix({ assignedToId: e.target.value })}
        >
          <option value="">Assign to…</option>
          {(team ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <select
          aria-label={`Limit ${doc.title} to a centre`}
          className={selectClass}
          value=""
          onChange={(e) => e.target.value && onFix({ centreId: e.target.value })}
        >
          <option value="">Limit to centre…</option>
          {(services ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {!doc.looksPersonal && (
          <Button size="xs" variant="secondary" onClick={() => onFix({ allServices: true })}>
            Share with everyone
          </Button>
        )}
      </div>
    </li>
  );
}
