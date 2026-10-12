"use client";

/**
 * Above Program and Menu: where this week came from. The centre's monthly
 * Program Plan is pulled from SharePoint every night (src/lib/program-plan);
 * this shows the week's theme and question, which file and when, and lets
 * the centre account or office pull a just-uploaded plan straight away.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { RefreshCw, Sparkles } from "lucide-react";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { isAdminRole } from "@/lib/role-permissions";
import { Button } from "@/components/ui/Button";

interface PlanWeek {
  weekStart: string;
  title: string;
  question: string | null;
}

interface PlanSync {
  fileName: string;
  webUrl: string | null;
  status: "ok" | "error";
  error: string | null;
  weeks: PlanWeek[] | null;
  syncedAt: string;
}

interface SyncResult {
  status: "synced" | "unchanged" | "no_plan" | "error";
  message?: string;
  files?: string[];
  folder?: string;
  more?: boolean;
}

const ago = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" });
};

export function ProgramPlanBanner({ serviceId, weekKey }: { serviceId: string; weekKey: string }) {
  const { data: session } = useSession();
  const role = session?.user?.role ?? "";
  const canSync = isAdminRole(role) || role === "member";
  const qc = useQueryClient();

  const { data } = useQuery<{ configured: boolean; syncs: PlanSync[] }>({
    queryKey: ["program-plan-sync", serviceId],
    queryFn: () => fetchApi(`/api/services/${serviceId}/programs/sharepoint`),
    staleTime: 60_000,
    retry: 2,
  });

  const sync = useMutation({
    mutationFn: () => mutateApi<SyncResult>(`/api/services/${serviceId}/programs/sharepoint`, { method: "POST", body: {} }),
    onSuccess: (r) => {
      toast({
        description: r.more
          ? "Part-way there — the rest of this month's files still need reading. Press Sync now again in a moment."
          : r.status === "synced"
            ? `Program and menu updated from ${r.folder ?? "SharePoint"}.`
            : r.status === "unchanged"
              ? `Already up to date with ${r.folder ?? "SharePoint"}.`
              : (r.message ?? "No program plan found in SharePoint."),
      });
      qc.invalidateQueries({ queryKey: ["program-plan-sync", serviceId] });
      qc.invalidateQueries({ queryKey: ["weekly-program", serviceId] });
      qc.invalidateQueries({ queryKey: ["menu-week", serviceId] });
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });

  if (!data?.configured) return null;
  const latest = data.syncs[0];
  const week = data.syncs
    .filter((s) => s.status === "ok")
    .flatMap((s) => s.weeks ?? [])
    .find((w) => w.weekStart === weekKey);
  const source = data.syncs.find((s) => s.status === "ok" && s.weeks?.some((w) => w.weekStart === weekKey)) ?? latest;

  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-label="Program plan from SharePoint">
      {week && (
        <div className="mb-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden />
            This week
          </p>
          <h3 className="font-heading text-lg font-semibold text-brand [text-wrap:balance]">{week.title}</h3>
          {week.question && <p className="text-sm text-foreground/80">{week.question}</p>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
        {source ? (
          <span className="min-w-0">
            From SharePoint:{" "}
            {source.webUrl ? (
              <a href={source.webUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-brand hover:underline break-all">
                {source.fileName}
              </a>
            ) : (
              <span className="font-medium text-foreground">{source.fileName}</span>
            )}{" "}
            · updated {ago(source.syncedAt)}
          </span>
        ) : (
          <span>This centre&rsquo;s program plan hasn&rsquo;t been brought in from SharePoint yet.</span>
        )}
        {canSync && (
          <Button variant="secondary" size="sm" className="ml-auto" onClick={() => sync.mutate()} loading={sync.isPending}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            {sync.isPending ? "Reading the plan…" : "Sync now"}
          </Button>
        )}
      </div>
      {latest?.status === "error" && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          The last plan couldn&rsquo;t be read: {latest.error}
        </p>
      )}
      {!week && source && (
        <p className="mt-2 text-xs text-muted">Nothing from the plan for this week — it may be in next month&rsquo;s file.</p>
      )}
    </section>
  );
}
