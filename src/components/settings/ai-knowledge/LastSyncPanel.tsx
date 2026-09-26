"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import type { SyncRunsResponse } from "./types";

const LABEL: Record<string, string> = {
  backfill: "Dashboard sync",
  regulator: "Regulator refresh",
  sharepoint: "SharePoint import",
};

/**
 * Latest run per adapter — hidden entirely until something has ever run. A
 * run with no `finishedAt` is still in flight (a backfill can take minutes).
 */
export function LastSyncPanel() {
  const { data } = useQuery<SyncRunsResponse>({
    queryKey: ["ai-knowledge-sync-runs"],
    queryFn: () => fetchApi("/api/settings/ai-knowledge/sync"),
    retry: 2,
    staleTime: 30_000,
  });
  const runs = data?.runs ?? [];
  if (runs.length === 0) return null;
  return (
    <section className="rounded-lg border border-border bg-card p-3 space-y-3">
      <h2 className="text-sm font-semibold text-foreground">Last sync</h2>
      {runs.map((r) => {
        const conflicts = r.details?.conflicts ?? [];
        const unmapped = r.details?.unmapped ?? [];
        const fetchErrors = r.details?.fetchErrors ?? [];
        const errors = r.details?.errors ?? [];
        const remaining = r.details?.policiesRemaining ?? 0;
        return (
          <div key={r.id} className="text-xs">
            <div className="flex flex-wrap gap-x-3 text-muted">
              <span className="text-foreground font-medium">{LABEL[r.adapter] ?? r.adapter}</span>
              <span>{new Date(r.startedAt).toLocaleString("en-AU")}</span>
              {r.finishedAt === null && <span className="text-warning">running…</span>}
              {Object.entries(r.counts ?? {}).map(([k, v]) => (
                <span key={k}>
                  {k} {v}
                </span>
              ))}
              {r.error && <span className="text-danger">{r.error}</span>}
              {remaining > 0 && (
                <span className="text-warning">{remaining} policies remaining — run Sync again</span>
              )}
            </div>
            {fetchErrors.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer text-danger">
                  {fetchErrors.length} source{fetchErrors.length === 1 ? "" : "s"} failed to fetch
                </summary>
                <ul className="mt-1 text-muted">
                  {fetchErrors.map((f) => (
                    <li key={f.id}>
                      <span className="font-medium text-foreground">{f.id}</span> — {f.error}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {errors.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer text-danger">
                  {errors.length} source{errors.length === 1 ? "" : "s"} failed to index
                </summary>
                <ul className="mt-1 text-muted">
                  {errors.map((e, i) => (
                    <li key={e.path ?? e.sourceId ?? i}>
                      <span className="font-medium text-foreground">{e.path ?? e.sourceId ?? "(unknown)"}</span>
                      {" — "}
                      {e.error ?? "unknown error"}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {conflicts.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer text-amber-800 dark:text-amber-200">
                  {conflicts.length} conflicts — fix in SharePoint
                </summary>
                <ul className="mt-1 space-y-1">
                  {conflicts.map((c, i) => (
                    <li key={c.paths[0] ?? i}>
                      <span className="font-medium">{c.normalizedTitle}</span>
                      {c.state ? ` (${c.state})` : ""}
                      {c.version ? ` V${c.version}` : ""}
                      <ul className="ml-3 text-muted">
                        {c.paths.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {unmapped.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer text-amber-800 dark:text-amber-200">
                  {unmapped.length} unmapped centre folders (excluded)
                </summary>
                <ul className="mt-1 text-muted">
                  {unmapped.map((u) => (
                    <li key={u.path}>
                      {u.centreFolder} — {u.path}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        );
      })}
    </section>
  );
}
