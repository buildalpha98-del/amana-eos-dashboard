"use client";

/**
 * TodayChecklistCard — today's session checklists for the educator's
 * own centre, tap-to-toggle (2026-07-06 field-mode). Reads the same
 * DailyChecklist rows as the service Checklists tab, filtered to
 * today, with 44px tap rows for phones. Quiet when the user has no
 * service or nothing is due today.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, ClipboardCheck, Loader2 } from "lucide-react";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";

interface ChecklistItem {
  id: string;
  category: string;
  label: string;
  checked: boolean;
}

interface Checklist {
  id: string;
  sessionType: string;
  status: string;
  items: ChecklistItem[];
}

function sessionLabel(type: string) {
  switch (type) {
    case "bsc":
      return "Before School";
    case "asc":
      return "After School";
    case "vc":
      return "Vacation Care";
    default:
      return type.toUpperCase();
  }
}

/** Local calendar date — the checklist rows key on the local day. */
function todayIso(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export function TodayChecklistCard({ serviceId }: { serviceId: string }) {
  const qc = useQueryClient();
  const date = todayIso();

  const { data: checklists = [], isLoading } = useQuery<Checklist[]>({
    queryKey: ["today-checklists", serviceId, date],
    queryFn: () =>
      fetchApi<Checklist[]>(`/api/services/${serviceId}/checklists?date=${date}`),
    retry: 2,
    staleTime: 60_000,
  });

  const toggle = useMutation({
    mutationFn: ({
      checklistId,
      itemId,
      checked,
    }: {
      checklistId: string;
      itemId: string;
      checked: boolean;
    }) =>
      mutateApi(`/api/services/${serviceId}/checklists/${checklistId}`, {
        method: "PATCH",
        body: { itemId, checked },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["today-checklists", serviceId, date] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });

  if (isLoading || checklists.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-card p-4" data-testid="today-checklist-card">
      <div className="mb-3 flex items-center gap-2">
        <ClipboardCheck className="h-5 w-5 text-brand" />
        <h3 className="text-base font-semibold text-foreground">Today&apos;s checklists</h3>
      </div>
      <div className="space-y-4">
        {checklists.map((cl) => {
          const done = cl.items.filter((i) => i.checked).length;
          return (
            <div key={cl.id}>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">
                  {sessionLabel(cl.sessionType)}
                </span>
                <span className="text-xs text-muted">
                  {done}/{cl.items.length}
                </span>
              </div>
              <ul className="space-y-0.5">
                {cl.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() =>
                        toggle.mutate({
                          checklistId: cl.id,
                          itemId: item.id,
                          checked: !item.checked,
                        })
                      }
                      disabled={toggle.isPending}
                      className="flex w-full min-h-[44px] items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface/50 disabled:opacity-60"
                    >
                      {toggle.isPending &&
                      toggle.variables?.itemId === item.id ? (
                        <Loader2 className="h-5 w-5 flex-shrink-0 animate-spin text-muted" />
                      ) : item.checked ? (
                        <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-500" />
                      ) : (
                        <Circle className="h-5 w-5 flex-shrink-0 text-muted/50" />
                      )}
                      <span
                        className={cn(
                          "text-sm",
                          item.checked ? "text-muted line-through" : "text-foreground",
                        )}
                      >
                        {item.label}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
