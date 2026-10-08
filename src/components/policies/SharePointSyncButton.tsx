"use client";

/**
 * "Sync from SharePoint now" for the office (2026-10-09) — runs the same
 * job as the scheduled cron, so a policy updated in SharePoint reaches
 * staff without waiting. Shows what changed, or exactly why it couldn't
 * connect (missing app consent, wrong secret…), instead of a bare error.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

interface Summary {
  filesSeen: number;
  policies: number;
  created: number;
  updated: number;
  unchanged: number;
  archived: number;
  pending: number;
  failed: { title: string; error: string }[];
}

export function SharePointSyncButton() {
  const qc = useQueryClient();
  const [result, setResult] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sync = useMutation({
    mutationFn: () =>
      mutateApi<Summary>("/api/policies/sharepoint-sync", { method: "POST", timeoutMs: 300_000 }),
    onSuccess: (s) => {
      setResult(s);
      setError(null);
      qc.invalidateQueries();
      toast({ description: "SharePoint sync finished." });
    },
    onError: (e: Error) => {
      setResult(null);
      setError(e.message);
    },
  });

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">SharePoint policies</p>
          <p className="text-xs text-muted">
            Brings in the “NSW &amp; VIC state policies” folder. Runs on a schedule too — use this after
            changing a policy.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
          iconLeft={<RefreshCw className={sync.isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
        >
          {sync.isPending ? "Syncing… (can take a few minutes)" : "Sync from SharePoint now"}
        </Button>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      {result && (
        <div className="rounded-lg bg-surface px-3 py-2 text-sm text-foreground">
          <p>
            Found {result.policies} {result.policies === 1 ? "policy" : "policies"} in {result.filesSeen} files —{" "}
            {result.created} new, {result.updated} updated, {result.unchanged} unchanged
            {result.archived ? `, ${result.archived} archived` : ""}.
          </p>
          {result.pending > 0 && (
            <p className="mt-1 text-muted">
              {result.pending} more still to bring in — press the button again (it does 25 at a time).
            </p>
          )}
          {result.failed.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-red-700 dark:text-red-300">
              {result.failed.map((f) => (
                <li key={f.title}>
                  {f.title}: {f.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
