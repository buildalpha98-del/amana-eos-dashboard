"use client";

/**
 * MyPayDiscrepancyCard — "my pay didn't match my hours" report, open to
 * every staff role. A plain internal DB record (no EH round-trip like
 * Expenses/Leave) — just a form + a history list, reviewed by admin.
 */

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Plus } from "lucide-react";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";

interface PayDiscrepancyReport {
  id: string;
  discrepancyDate: string;
  hoursShort: number;
  description: string | null;
  status: "open" | "reviewing" | "resolved" | "dismissed";
  resolutionNotes: string | null;
  createdAt: string;
  service: { id: string; name: string } | null;
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "resolved":
      return "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800";
    case "dismissed":
      return "bg-surface text-foreground/80 border-border";
    case "reviewing":
      return "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800";
    default:
      return "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800";
  }
}

function formatHumanDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export function MyPayDiscrepancyCard() {
  const { data: session } = useSession();
  const [submitOpen, setSubmitOpen] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery<{ reports: PayDiscrepancyReport[] }>({
    queryKey: ["my-pay-discrepancies"],
    queryFn: () => fetchApi("/api/pay-discrepancies"),
    staleTime: 60_000,
    retry: 2,
  });

  const reports = data?.reports ?? [];

  return (
    <div className="bg-card rounded-xl border border-border p-6" data-testid="my-pay-discrepancy-card">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-3">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-brand" />
          Pay Discrepancy
        </h3>
        <button
          type="button"
          onClick={() => setSubmitOpen(true)}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90 transition-colors w-full sm:w-auto"
          data-testid="pay-discrepancy-submit-button"
        >
          <Plus className="w-4 h-4" />
          Report discrepancy
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-600 dark:text-red-400">Couldn&apos;t load your reports.</p>
      ) : reports.length === 0 ? (
        <p className="text-sm text-muted">
          If your pay doesn&apos;t match the hours you worked, report it here instead of emailing —
          it goes straight to admin for review.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {reports.map((r) => (
            <li key={r.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {r.hoursShort} hour{r.hoursShort === 1 ? "" : "s"} short — {formatHumanDate(r.discrepancyDate)}
                    {r.service ? ` · ${r.service.name}` : ""}
                  </p>
                  {r.description ? <p className="text-xs text-muted mt-0.5">{r.description}</p> : null}
                  {r.resolutionNotes ? (
                    <p className="text-xs text-muted mt-1 italic">Admin: {r.resolutionNotes}</p>
                  ) : null}
                </div>
                <span
                  className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide ${statusBadgeClass(r.status)}`}
                >
                  {r.status}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {submitOpen && (
        <SubmitPayDiscrepancyModal
          open={submitOpen}
          onClose={() => setSubmitOpen(false)}
          serviceId={session?.user?.serviceId ?? null}
          onSubmitted={() => qc.invalidateQueries({ queryKey: ["my-pay-discrepancies"] })}
        />
      )}
    </div>
  );
}

function SubmitPayDiscrepancyModal({
  open,
  onClose,
  serviceId,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  /** The reporter's own primary centre, submitted silently — most staff
   *  work one centre and don't need a picker for their own report. */
  serviceId: string | null;
  onSubmitted: () => void;
}) {
  const [discrepancyDate, setDiscrepancyDate] = useState("");
  const [hoursShort, setHoursShort] = useState("");
  const [description, setDescription] = useState("");

  const submit = useMutation({
    mutationFn: () =>
      mutateApi("/api/pay-discrepancies", {
        method: "POST",
        body: {
          serviceId: serviceId || null,
          discrepancyDate,
          hoursShort: Number(hoursShort),
          description: description.trim() || undefined,
        },
      }),
    onSuccess: () => {
      toast({ description: "Reported. Admin has been notified." });
      onSubmitted();
      onClose();
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!discrepancyDate) {
      toast({ variant: "destructive", description: "Enter the date your pay didn't match your hours." });
      return;
    }
    const hours = Number(hoursShort);
    if (!hours || hours <= 0) {
      toast({ variant: "destructive", description: "Enter how many hours were short." });
      return;
    }
    submit.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle>Report a pay discrepancy</DialogTitle>
        <p className="text-sm text-muted -mt-2 mb-2">
          Tell us the date and how many hours were short — our team will review.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted block mb-1">Date not paid correctly</label>
              <input
                type="date"
                value={discrepancyDate}
                onChange={(e) => setDiscrepancyDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">Hours short</label>
              <input
                type="number"
                min="0.25"
                step="0.25"
                value={hoursShort}
                onChange={(e) => setHoursShort(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand"
                placeholder="e.g. 3.5"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">Details (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="Anything that helps admin find the right pay run"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={submit.isPending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={submit.isPending}>
              Submit
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
