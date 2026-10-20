"use client";

/**
 * Settings → OWNA: link each centre to its OWNA centre, then sync.
 *
 * Endpoints (all existing except /centres):
 *   GET  /api/owna/status   — our centres + their saved link + last sync
 *   GET  /api/owna/centres  — OWNA's centre list + suggested matches
 *   PUT  /api/owna/mapping  — save one centre's link
 *   POST /api/owna/sync     — run the sync now
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Link2, Loader2, RefreshCw, Sparkles, XCircle } from "lucide-react";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";

interface StatusResponse {
  configured: boolean;
  services: { id: string; name: string; code: string; ownaServiceId: string | null; ownaSyncedAt: string | null }[];
  mappedCount: number;
  totalServices: number;
}
interface OwnaCentreOption {
  id: string;
  name: string;
  alias: string | null;
  suburb: string | null;
  state: string | null;
  children: number | null;
}
interface CentresResponse {
  configured: boolean;
  error: string | null;
  centres: OwnaCentreOption[];
  suggestions: Record<string, string>;
}

const short = (name: string) => name.replace(/^Amana OSHC\s+/i, "");
const label = (c: OwnaCentreOption) =>
  [c.name, c.suburb && !c.name.toLowerCase().includes(c.suburb.toLowerCase()) ? c.suburb : null, c.state].filter(Boolean).join(" · ");

function ago(iso: string | null) {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)} days ago`;
}

export function OwnaSettingsClient() {
  const qc = useQueryClient();
  const status = useQuery<StatusResponse>({ queryKey: ["owna-status"], queryFn: () => fetchApi("/api/owna/status"), retry: 2 });
  const centres = useQuery<CentresResponse>({ queryKey: ["owna-centres"], queryFn: () => fetchApi("/api/owna/centres"), retry: 1 });
  const [picked, setPicked] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: (v: { serviceId: string; ownaServiceId: string | null }) =>
      mutateApi("/api/owna/mapping", { method: "PUT", body: v }),
    onSuccess: (_r, v) => {
      setPicked((p) => {
        const n = { ...p };
        delete n[v.serviceId];
        return n;
      });
      qc.invalidateQueries({ queryKey: ["owna-status"] });
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });
  const sync = useMutation({
    mutationFn: () => mutateApi<{ servicesProcessed?: number; message?: string }>("/api/owna/sync", { method: "POST" }),
    onSuccess: (r) => {
      toast({ description: r.servicesProcessed ? `Synced ${r.servicesProcessed} centre${r.servicesProcessed === 1 ? "" : "s"} from OWNA.` : r.message || "Sync finished." });
      qc.invalidateQueries({ queryKey: ["owna-status"] });
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });

  const options = centres.data?.centres ?? [];
  const suggestions = centres.data?.suggestions ?? {};
  const rows = status.data?.services ?? [];
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const linkedElsewhere = (ownaId: string, serviceId: string) =>
    rows.some((r) => r.id !== serviceId && r.ownaServiceId === ownaId);
  const unsavedSuggestions = rows.filter((r) => !r.ownaServiceId && suggestions[r.id] && !linkedElsewhere(suggestions[r.id], r.id));

  const saveAllSuggested = async () => {
    for (const r of unsavedSuggestions) await save.mutateAsync({ serviceId: r.id, ownaServiceId: suggestions[r.id] });
    toast({ description: `Linked ${unsavedSuggestions.length} centre${unsavedSuggestions.length === 1 ? "" : "s"}. Press "Sync now" to pull their data.` });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Settings
      </Link>
      <PageHeader
        title="OWNA"
        description="Link each centre to its OWNA centre. Linked centres sync every 30 minutes on weekdays: children, attendance, enquiries and incidents."
      />

      {/* Connection */}
      <section className="rounded-xl border border-border bg-card p-4 space-y-2">
        {status.isPending || centres.isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking the OWNA connection…
          </p>
        ) : !status.data?.configured || centres.data?.configured === false ? (
          <p className="flex items-center gap-2 text-sm">
            <XCircle className="h-4 w-4 text-red-600" aria-hidden /> OWNA isn&apos;t connected — the API key isn&apos;t set.
          </p>
        ) : centres.data?.error ? (
          <p className="flex items-center gap-2 text-sm">
            <XCircle className="h-4 w-4 text-red-600" aria-hidden /> Connected, but OWNA didn&apos;t answer: {centres.data.error}
          </p>
        ) : (
          <p className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden /> Connected to OWNA — {options.length} OWNA centre
            {options.length === 1 ? "" : "s"} found. {status.data.mappedCount} of {status.data.totalServices} of our centres linked.
          </p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          {unsavedSuggestions.length > 0 && (
            <Button size="sm" disabled={save.isPending} onClick={saveAllSuggested}>
              <Sparkles className="mr-1.5 h-4 w-4" aria-hidden />
              Link the {unsavedSuggestions.length} suggested match{unsavedSuggestions.length === 1 ? "" : "es"}
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={sync.isPending || !status.data?.mappedCount} onClick={() => sync.mutate()}>
            {sync.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />}
            Sync now
          </Button>
        </div>
      </section>

      {/* Centres */}
      <section className="rounded-xl border border-border bg-card divide-y divide-border">
        {rows.map((r) => {
          const current = picked[r.id] ?? r.ownaServiceId ?? suggestions[r.id] ?? "";
          const isSuggestion = !r.ownaServiceId && !picked[r.id] && !!suggestions[r.id];
          const dirty = current !== (r.ownaServiceId ?? "");
          const clash = !!current && linkedElsewhere(current, r.id);
          const linked = r.ownaServiceId ? byId.get(r.ownaServiceId) : null;
          return (
            <div key={r.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-[10rem] flex-1">
                <p className="text-sm font-medium text-foreground">{short(r.name)}</p>
                <p className="text-xs text-muted">
                  {r.ownaServiceId
                    ? `Linked${linked ? ` to ${linked.name}` : ""} · last synced ${ago(r.ownaSyncedAt)}`
                    : "Not linked — nothing syncs for this centre yet"}
                </p>
              </div>
              <label className="sr-only" htmlFor={`owna-${r.id}`}>
                OWNA centre for {short(r.name)}
              </label>
              <select
                id={`owna-${r.id}`}
                value={current}
                onChange={(e) => setPicked((p) => ({ ...p, [r.id]: e.target.value }))}
                className="min-w-[14rem] rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                disabled={!options.length}
              >
                <option value="">— Not linked —</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {label(o)}
                    {linkedElsewhere(o.id, r.id) ? " (linked to another centre)" : ""}
                  </option>
                ))}
              </select>
              {isSuggestion && <span className="text-2xs font-semibold rounded-full bg-brand/10 px-2 py-0.5 text-brand">Suggested</span>}
              <Button
                size="sm"
                variant={dirty ? "primary" : "outline"}
                disabled={save.isPending || !dirty || clash}
                onClick={() => save.mutate({ serviceId: r.id, ownaServiceId: current || null })}
              >
                <Link2 className="mr-1.5 h-4 w-4" aria-hidden />
                {current ? "Save link" : "Unlink"}
              </Button>
              {clash && <p className="w-full text-xs text-red-600 dark:text-red-400">That OWNA centre is already linked to another centre.</p>}
            </div>
          );
        })}
      </section>
      <p className="text-xs text-muted">
        Check each match before saving — a wrong link pulls another centre&apos;s children and attendance into this one.
      </p>
    </div>
  );
}
