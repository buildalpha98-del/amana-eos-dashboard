"use client";

/**
 * The staff compliance forms for one person (Daniel, 20 Oct 2026): Staff
 * Record for everyone, plus the Responsible Person form for anyone holding
 * that position. Shown on their own Compliance page (to fill in) and on
 * their staff profile (to view / countersign).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardSignature } from "lucide-react";
import { fetchApi } from "@/lib/fetch-api";
import { Button } from "@/components/ui/Button";
import { StaffFormDialog, type StaffFormStatus, type StaffFormsResponse } from "@/components/compliance/StaffFormDialog";
import { cn } from "@/lib/utils";

const STATUS: Record<StaffFormStatus, { label: string; cls: string }> = {
  not_started: { label: "Not started", cls: "bg-surface text-muted" },
  draft: { label: "Draft", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" },
  awaiting_supervisor: { label: "Awaiting supervisor", cls: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300" },
  complete: { label: "Complete", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" },
};

export function StaffFormsSection({ userId, heading = "Forms" }: { userId: string; heading?: string | null }) {
  const [openType, setOpenType] = useState<string | null>(null);
  const query = useQuery<StaffFormsResponse>({
    queryKey: ["staff-forms", userId],
    queryFn: () => fetchApi<StaffFormsResponse>(`/api/staff-forms/${userId}`),
    retry: 2,
  });

  if (query.isPending) return <p className="text-sm text-muted">Loading forms…</p>;
  if (query.isError)
    return (
      <div role="alert" className="text-sm">
        Couldn&apos;t load forms: {query.error.message}{" "}
        <Button size="sm" variant="outline" onClick={() => query.refetch()}>
          Retry
        </Button>
      </div>
    );

  const { forms, ...meta } = query.data;
  const open = forms.find((f) => f.type === openType) ?? null;

  return (
    <div>
      {heading && <h2 className="text-sm font-semibold uppercase tracking-wider text-muted mb-3">{heading}</h2>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {forms.map((f) => {
          const s = STATUS[f.status];
          const needsSupervisor = f.status === "awaiting_supervisor" && meta.canCountersign;
          const action = meta.canEdit
            ? f.status === "not_started"
              ? "Fill in"
              : f.status === "draft"
                ? "Continue"
                : "View or update"
            : needsSupervisor
              ? "Review and sign"
              : "View";
          return (
            <div key={f.type} className="bg-card rounded-xl border border-border p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ClipboardSignature className="h-5 w-5 text-brand" aria-hidden />
                  <span className="font-semibold text-foreground">{f.title}</span>
                </div>
                <span className={cn("text-2xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap", s.cls)}>{s.label}</span>
              </div>
              <p className="text-xs text-muted">
                {f.type === "responsible_person"
                  ? "Offer and acceptance, with the fit-and-proper, compliance history and prohibition declarations. Countersigned by the centre's coordinator or a State Manager."
                  : "Your details, qualifications and training, Working with Children Check and emergency contact."}
              </p>
              <Button size="sm" variant={meta.canEdit && f.status !== "complete" ? "primary" : "outline"} className="self-start" onClick={() => setOpenType(f.type)}>
                {action}
              </Button>
            </div>
          );
        })}
      </div>
      {open && (
        <StaffFormDialog
          key={`${open.type}-${open.submittedAt ?? ""}-${open.supervisorSignedAt ?? ""}`}
          open
          onOpenChange={(o) => !o && setOpenType(null)}
          userId={userId}
          form={open}
          meta={meta}
        />
      )}
    </div>
  );
}
