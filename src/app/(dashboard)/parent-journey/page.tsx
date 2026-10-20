"use client";

/**
 * Parent journey (Daniel, 15 Oct 2026): every email a family receives, stage
 * by stage — when it goes, whether it's live, how many went out lately —
 * with a live preview for any centre, "send me a test", and a link straight
 * to where its wording (or the centre's details) is edited.
 */
import { Suspense, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Mail, Monitor, Pencil, Send, Smartphone, Building2 } from "lucide-react";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { ParentFunnel } from "@/components/parent-journey/ParentFunnel";
import type { JourneyEmail, JourneyEmailStatus, JourneyStage } from "@/lib/parent-journey-map";

interface JourneyData {
  stages: JourneyStage[];
  services: { id: string; name: string }[];
  sequences: { name: string; triggerStage: string; isActive: boolean }[];
  stats: Record<string, { sent30: number; pending: number }>;
  welcomeSent30: number;
}

const STATUS: Record<JourneyEmailStatus, { label: string; chip: string }> = {
  live: { label: "Live", chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200" },
  new: { label: "New", chip: "bg-accent/30 text-brand" },
  planned: { label: "Coming next", chip: "bg-surface text-muted" },
  manual: { label: "Sent by staff", chip: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-200" },
};

const shortName = (n: string) => n.replace(/^Amana OSHC\s+/i, "");

export default function ParentJourneyPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
      <ParentJourney />
    </Suspense>
  );
}

function ParentJourney() {
  const params = useSearchParams();
  const { data, isLoading } = useQuery<JourneyData>({
    queryKey: ["parent-journey"],
    queryFn: () => fetchApi("/api/parent-journey"),
    retry: 2,
  });
  // The centre picked in the dropdown, else ?service=, else the first centre.
  const [picked, setPicked] = useState<string>("");
  const wanted = params.get("service");
  const serviceId =
    picked || data?.services.find((s) => s.id === wanted)?.id || data?.services[0]?.id || "";
  const setServiceId = setPicked;
  const [selected, setSelected] = useState<string>("enrolment_welcome");
  const [width, setWidth] = useState<600 | 375>(600);

  const emails = useMemo(() => (data?.stages ?? []).flatMap((s) => s.emails), [data]);
  const current = emails.find((e) => e.id === selected);

  const preview = useQuery<{ subject: string; html: string }>({
    queryKey: ["parent-journey-preview", selected, serviceId],
    queryFn: () => fetchApi(`/api/parent-journey/preview?id=${selected}&serviceId=${serviceId}`),
    enabled: !!selected && !!serviceId,
    retry: 1,
  });

  const test = useMutation({
    mutationFn: ({ ids, to = "me" }: { ids: string[]; to?: "me" | "enrolments" }) =>
      mutateApi<{ sentTo: string; sent: number; failed: string[] }>("/api/parent-journey/test", {
        method: "POST",
        body: { ids, serviceId, to },
      }),
    onSuccess: (r) =>
      toast({
        description: `${r.sent} test email${r.sent === 1 ? "" : "s"} sent to ${r.sentTo}${r.failed.length ? ` (${r.failed.length} couldn't be sent)` : ""}.`,
      }),
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });

  const allIds = emails.map((e) => e.id).filter(Boolean) as string[];
  const countFor = (e: JourneyEmail) => {
    if (e.id === "enrolment_welcome") return data?.welcomeSent30 ? { sent30: data.welcomeSent30, pending: 0 } : null;
    return e.templateKey ? data?.stats[e.templateKey] ?? null : null;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Parent journey"
        description="Where every family is, and every email they get — from first enquiry to settled in. Click an email to preview it for any centre."
      />

      <ParentFunnel />

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <label className="flex min-w-56 flex-col gap-1 text-xs font-medium text-muted">
          Preview as centre
          <select
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
          >
            {(data?.services ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {shortName(s.name)}
              </option>
            ))}
          </select>
        </label>
        <Button variant="outline" onClick={() => test.mutate({ ids: allIds })} loading={test.isPending && test.variables?.ids.length !== 1} disabled={!serviceId}>
          <Mail className="h-4 w-4" aria-hidden /> Send me every email ({allIds.length})
        </Button>
        <p className="text-xs text-muted">Tests go to your own inbox (or the enrolments inbox) only, marked [Test]. Sample family: Sarah, child Yusuf.</p>
        <p className="basis-full text-xs text-muted">
          <strong className="font-semibold text-foreground">Never too many emails:</strong> a scheduled email waits a day if the
          family heard from us in the last 20 hours (except the day-before reminder). Emails only go out in the daytime.
        </p>
      </div>

      {isLoading || !data ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          {/* The journey */}
          <ol className="space-y-4">
            {data.stages.map((stage) => {
              const off = data.sequences.filter((s) => s.triggerStage === stage.key && !s.isActive);
              return (
                <li key={stage.key} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="font-heading text-base font-semibold text-foreground">{stage.title}</h2>
                    {off.length > 0 && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-2xs font-semibold text-red-800 dark:bg-red-950/50 dark:text-red-200">
                        {off.map((s) => s.name).join(", ")} switched off
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-muted">{stage.description}</p>
                  <ul className="mt-3 space-y-1.5">
                    {stage.emails.map((e) => {
                      const st = STATUS[e.status];
                      const count = countFor(e);
                      const active = e.id && e.id === selected;
                      const Row = (
                        <>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-foreground">{e.name}</span>
                            <span className="block text-xs text-muted">{e.when}</span>
                            {e.note && <span className="mt-0.5 block text-xs text-muted">{e.note}</span>}
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-1">
                            <span className={cn("rounded-full px-2 py-0.5 text-2xs font-semibold", st.chip)}>{st.label}</span>
                            {count && (count.sent30 > 0 || count.pending > 0) && (
                              <span className="text-2xs text-muted">
                                {count.sent30} sent (30d){count.pending ? ` · ${count.pending} queued` : ""}
                              </span>
                            )}
                          </span>
                        </>
                      );
                      return (
                        <li key={e.name}>
                          {e.id ? (
                            <button
                              type="button"
                              onClick={() => setSelected(e.id!)}
                              aria-pressed={!!active}
                              className={cn(
                                "flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                                active ? "border-brand bg-brand/5" : "border-transparent hover:bg-surface",
                              )}
                            >
                              {Row}
                            </button>
                          ) : (
                            <div className="flex items-start gap-3 rounded-lg border border-dashed border-border px-3 py-2 opacity-80">{Row}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ol>

          {/* Preview */}
          <section className="space-y-3 lg:sticky lg:top-4 lg:self-start" aria-label="Email preview">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">{current?.name ?? "Preview"}</p>
              <p className="mt-1 text-sm text-foreground">
                <span className="text-muted">Subject: </span>
                {preview.data?.subject ?? (preview.isLoading ? "…" : "")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => current?.id && test.mutate({ ids: [current.id] })} loading={test.isPending && test.variables?.ids.length === 1 && test.variables.to !== "enrolments"} disabled={!current?.id || !serviceId}>
                  <Send className="h-3.5 w-3.5" aria-hidden /> Send me a test
                </Button>
                <Button size="sm" variant="outline" onClick={() => current?.id && test.mutate({ ids: [current.id], to: "enrolments" })} loading={test.isPending && test.variables?.to === "enrolments"} disabled={!current?.id || !serviceId}>
                  <Send className="h-3.5 w-3.5" aria-hidden /> Test to enrolments inbox
                </Button>
                {current?.overrideKey && (
                  <Button size="sm" variant="secondary" onClick={() => window.open(`/settings/email-templates/${current.overrideKey}`, "_blank")}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit wording
                  </Button>
                )}
                {current?.usesCentreContent && serviceId && (
                  <Button size="sm" variant="secondary" onClick={() => window.open(`/services/${serviceId}?tab=overview&sub=about`, "_blank")}>
                    <Building2 className="h-3.5 w-3.5" aria-hidden /> Edit this centre&rsquo;s details
                  </Button>
                )}
                <span className="ml-auto flex gap-1">
                  {([600, 375] as const).map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setWidth(w)}
                      aria-pressed={width === w}
                      aria-label={w === 600 ? "Desktop width" : "Phone width"}
                      className={cn("rounded-md p-1.5", width === w ? "bg-brand text-white" : "text-muted hover:bg-surface")}
                    >
                      {w === 600 ? <Monitor className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
                    </button>
                  ))}
                </span>
              </div>
            </div>
            <div className="flex justify-center overflow-x-auto rounded-xl border border-border bg-surface/50 p-3">
              {preview.isLoading ? (
                <Skeleton className="h-[640px] w-full max-w-[600px] rounded-lg" />
              ) : preview.data ? (
                <iframe
                  title="Email preview"
                  srcDoc={preview.data.html}
                  // No scripts; same-origin only so the logo (served by us) loads.
                  sandbox="allow-same-origin"
                  // Emails are always white — the preview mirrors the inbox.
                  style={{ width: width, height: 760, border: "none", background: "#ffffff" }}
                  className="max-w-full rounded-lg"
                />
              ) : (
                <p className="py-20 text-sm text-muted">{preview.error instanceof Error ? preview.error.message : "Pick an email to preview."}</p>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
