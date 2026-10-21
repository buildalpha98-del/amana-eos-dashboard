"use client";

/**
 * Enrolments → Follow-ups (Daniel, 16 Oct 2026). Lists so no family
 * falls through the cracks (+ OWNA setup, and since 21 Oct the first-day
 * check and call):
 *   - "Reply within 24 hours": submitted enrolments still waiting on us,
 *     with the time left on the thank-you page's promise;
 *   - "Unfinished forms": families who started and stopped — call them,
 *     or send a reminder email.
 * Hidden entirely when both are empty.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, CheckCircle2, ChevronDown, Clock, KeyRound, Mail, Phone, PhoneCall } from "lucide-react";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import type { AwaitingReply, OwnaSetup, UnfinishedForm } from "@/lib/enrolment-follow-ups";
import type { FirstDayRow } from "@/lib/first-day-check";
import type { QuietFamily } from "@/lib/quiet-families";

/** "Tuesday 21 October" from "2026-10-21". */
function dayLabel(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

function ago(iso: string) {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (h < 1) return "just now";
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)} days ago`;
}

function clockChip(hoursLeft: number) {
  if (hoursLeft <= 0)
    return { text: `Overdue by ${-hoursLeft}h`, cls: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200" };
  if (hoursLeft <= 4)
    return { text: `${hoursLeft}h left`, cls: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200" };
  return { text: `${hoursLeft}h left`, cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200" };
}

export function EnrolmentFollowUps({ onOpen }: { onOpen: (enrolmentId: string) => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(true);
  const { data } = useQuery<{
    awaiting: AwaitingReply[];
    unfinished: UnfinishedForm[];
    ownaSetup: OwnaSetup[];
    firstDayCheck?: FirstDayRow[];
    firstDayCalls?: FirstDayRow[];
    quiet?: QuietFamily[];
  }>({
    queryKey: ["enrolment-follow-ups"],
    queryFn: () => fetchApi("/api/enrolments/follow-ups"),
    retry: 2,
    refetchInterval: 5 * 60_000,
    meta: { suppressGlobalErrorToast: true },
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["enrolment-follow-ups"] });
    qc.invalidateQueries({ queryKey: ["enrolments"] });
  };

  const contacted = useMutation({
    mutationFn: (id: string) => mutateApi(`/api/enrolments/${id}`, { method: "PATCH", body: { status: "under_review" } }),
    onSuccess: () => {
      toast({ description: "Marked as contacted — it's now in Reviewing." });
      refresh();
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });
  const called = useMutation({
    mutationFn: (accountId: string) => mutateApi(`/api/families/${accountId}/follow-up`, { method: "POST" }),
    onSuccess: () => {
      toast({ description: "Noted. They'll come back here in 14 days if the form is still unfinished." });
      refresh();
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });
  // First day (21 Oct 2026): did they come? → then call them.
  const firstDay = useMutation({
    mutationFn: (v: { id: string; action: "attended" | "absent" | "called" }) =>
      mutateApi(`/api/enrolments/${v.id}/first-day`, { method: "POST", body: { action: v.action } }),
    onSuccess: (_r, v) => {
      toast({
        description:
          v.action === "attended"
            ? "Thanks — the \"how did it go?\" email is on its way. Now give them a call."
            : v.action === "absent"
              ? "Noted — no \"how did it go?\" email. Give them a call to see what happened."
              : "Noted — call done.",
      });
      refresh();
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });
  const quietCalled = useMutation({
    mutationFn: (childId: string) => mutateApi(`/api/children/${childId}/quiet-follow-up`, { method: "POST" }),
    onSuccess: () => {
      toast({ description: "Noted — call done." });
      refresh();
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });
  const remind = useMutation({
    mutationFn: (accountId: string) => mutateApi<{ email: string }>(`/api/families/${accountId}/remind`, { method: "POST" }),
    onSuccess: (r) => {
      toast({ description: `Reminder sent to ${r.email}.` });
      refresh();
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });

  const awaiting = data?.awaiting ?? [];
  const unfinished = data?.unfinished ?? [];
  const ownaSetup = data?.ownaSetup ?? [];
  const firstDayCheck = data?.firstDayCheck ?? [];
  const firstDayCalls = data?.firstDayCalls ?? [];
  const quiet = data?.quiet ?? [];
  if (
    !data ||
    (awaiting.length === 0 &&
      unfinished.length === 0 &&
      ownaSetup.length === 0 &&
      firstDayCheck.length === 0 &&
      firstDayCalls.length === 0 &&
      quiet.length === 0)
  )
    return null;
  const overdue = awaiting.filter((a) => a.hoursLeft <= 0).length;

  return (
    <section className="rounded-xl border border-border bg-card" aria-label="Follow-ups">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left"
      >
        <span className="font-heading text-base font-semibold text-foreground">Follow-ups</span>
        {awaiting.length > 0 && (
          <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
            {awaiting.length} to reply to{overdue ? ` · ${overdue} overdue` : ""}
          </span>
        )}
        {unfinished.length > 0 && (
          <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-muted">
            {unfinished.length} unfinished form{unfinished.length === 1 ? "" : "s"}
          </span>
        )}
        {ownaSetup.length > 0 && (
          <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-muted">
            {ownaSetup.length} OWNA setup{ownaSetup.length === 1 ? "" : "s"} to finish
          </span>
        )}
        {firstDayCheck.length > 0 && (
          <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
            {firstDayCheck.length} first day{firstDayCheck.length === 1 ? "" : "s"} to confirm
          </span>
        )}
        {firstDayCalls.length > 0 && (
          <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-muted">
            {firstDayCalls.length} first-day call{firstDayCalls.length === 1 ? "" : "s"}
          </span>
        )}
        {quiet.length > 0 && (
          <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-muted">
            {quiet.length} quiet famil{quiet.length === 1 ? "y" : "ies"}
          </span>
        )}
        <ChevronDown className={cn("ml-auto h-4 w-4 text-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div className="grid gap-4 border-t border-border p-4 lg:grid-cols-2 2xl:grid-cols-3">
          <div className="min-w-0 space-y-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Clock className="h-4 w-4 text-brand" aria-hidden /> Reply within 24 hours
            </h3>
            <p className="text-xs text-muted">
              Families are told we&apos;ll be in touch within 24 hours. Call them, then mark it contacted.
            </p>
            {awaiting.length === 0 ? (
              <p className="flex items-center gap-1.5 py-2 text-sm text-muted">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden /> Everyone has heard from us.
              </p>
            ) : (
              <ul className="space-y-2">
                {awaiting.map((a) => {
                  const chip = clockChip(a.hoursLeft);
                  return (
                    <li key={a.id} className="rounded-lg border border-border p-3">
                      <div className="flex flex-wrap items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{a.childNames}</p>
                          <p className="text-xs text-muted">
                            {a.parentName}
                            {a.serviceName ? ` · ${a.serviceName}` : ""} · submitted {ago(a.submittedAt)}
                          </p>
                        </div>
                        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold", chip.cls)}>{chip.text}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {a.phone && (
                          <a
                            href={`tel:${a.phone.replace(/\s+/g, "")}`}
                            className="inline-flex min-h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-medium text-foreground hover:bg-surface"
                          >
                            <Phone className="h-3.5 w-3.5" aria-hidden /> {a.phone}
                          </a>
                        )}
                        <Button size="sm" variant="secondary" onClick={() => onOpen(a.id)}>
                          Open
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => contacted.mutate(a.id)}
                          loading={contacted.isPending && contacted.variables === a.id}
                        >
                          Mark contacted
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="min-w-0 space-y-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <PhoneCall className="h-4 w-4 text-brand" aria-hidden /> Unfinished forms
            </h3>
            <p className="text-xs text-muted">
              Started, then stopped for 4+ days. They&apos;ve had two &ldquo;need a hand?&rdquo; emails, so a call works best.
            </p>
            {unfinished.length === 0 ? (
              <p className="flex items-center gap-1.5 py-2 text-sm text-muted">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden /> No stalled forms.
              </p>
            ) : (
              <ul className="space-y-2">
                {unfinished.map((u) => (
                  <li key={u.accountId} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {u.parentName}
                          {u.childName ? <span className="font-normal text-muted"> for {u.childName}</span> : null}
                        </p>
                        <p className="text-xs text-muted">
                          {u.serviceName} · stopped at {u.step} (step {u.stepNumber} of {u.stepCount}) · last saved {ago(u.lastSavedAt)}
                        </p>
                        {u.reminderSentAt && <p className="text-xs text-muted">Reminder emailed {ago(u.reminderSentAt)}</p>}
                      </div>
                      <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-2xs font-semibold text-muted">
                        {u.daysIdle} days
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {u.phone && (
                        <a
                          href={`tel:${u.phone.replace(/\s+/g, "")}`}
                          className="inline-flex min-h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-medium text-foreground hover:bg-surface"
                        >
                          <Phone className="h-3.5 w-3.5" aria-hidden /> {u.phone}
                        </a>
                      )}
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => remind.mutate(u.accountId)}
                        loading={remind.isPending && remind.variables === u.accountId}
                      >
                        <Mail className="h-3.5 w-3.5" aria-hidden /> Email a reminder
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => called.mutate(u.accountId)}
                        loading={called.isPending && called.variables === u.accountId}
                      >
                        We called them
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="min-w-0 space-y-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <KeyRound className="h-4 w-4 text-brand" aria-hidden /> OWNA setup
            </h3>
            <p className="text-xs text-muted">
              Approved families whose OWNA handover isn&apos;t finished. Open one to tick the next step.
            </p>
            {ownaSetup.length === 0 ? (
              <p className="flex items-center gap-1.5 py-2 text-sm text-muted">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden /> Every approved family is set up.
              </p>
            ) : (
              <ul className="space-y-2">
                {ownaSetup.map((o) => (
                  <li key={o.id} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{o.childNames}</p>
                        <p className="text-xs text-muted">
                          {o.parentName}
                          {o.serviceName ? ` · ${o.serviceName}` : ""} · approved{" "}
                          {o.daysSinceApproval === 0 ? "today" : `${o.daysSinceApproval} day${o.daysSinceApproval === 1 ? "" : "s"} ago`}
                          {o.owner ? ` · ${o.owner}` : ""}
                        </p>
                        <p className="mt-1 text-xs font-medium text-foreground">
                          Next: {o.nextStep} <span className="font-normal text-muted">({o.stepsDone}/4 done)</span>
                        </p>
                      </div>
                      {o.waitingOnFamily && (
                        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-2xs font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                          Waiting on family
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {o.phone && (
                        <a
                          href={`tel:${o.phone.replace(/\s+/g, "")}`}
                          className="inline-flex min-h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-medium text-foreground hover:bg-surface"
                        >
                          <Phone className="h-3.5 w-3.5" aria-hidden /> {o.phone}
                        </a>
                      )}
                      <Button size="sm" onClick={() => onOpen(o.id)}>
                        Open the checklist
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {(firstDayCheck.length > 0 || firstDayCalls.length > 0) && (
            <div className="min-w-0 space-y-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <CalendarCheck className="h-4 w-4 text-brand" aria-hidden /> First day — did they come?
              </h3>
              <p className="text-xs text-muted">
                Tap <strong>Attended</strong> and the family gets our &ldquo;how did it go?&rdquo; email. Didn&apos;t
                attend: no email. Either way, give them a call.
              </p>
              {firstDayCheck.length === 0 ? (
                <p className="flex items-center gap-1.5 py-2 text-sm text-muted">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden /> Every first day is confirmed.
                </p>
              ) : (
                <ul className="space-y-2">
                  {firstDayCheck.map((f) => (
                    <li key={f.id} className="rounded-lg border border-border p-3">
                      <p className="truncate text-sm font-medium text-foreground">{f.childNames}</p>
                      <p className="text-xs text-muted">
                        {f.parentName}
                        {f.serviceName ? ` · ${f.serviceName}` : ""} · first day {dayLabel(f.firstDay)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button size="sm" disabled={firstDay.isPending} onClick={() => firstDay.mutate({ id: f.id, action: "attended" })}>
                          Attended
                        </Button>
                        <Button size="sm" variant="outline" disabled={firstDay.isPending} onClick={() => firstDay.mutate({ id: f.id, action: "absent" })}>
                          Didn&apos;t attend
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => onOpen(f.id)}>
                          Open
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {firstDayCalls.length > 0 && (
                <>
                  <h3 className="flex items-center gap-1.5 pt-2 text-sm font-semibold text-foreground">
                    <PhoneCall className="h-4 w-4 text-brand" aria-hidden /> Call after the first day
                  </h3>
                  <ul className="space-y-2">
                    {firstDayCalls.map((f) => (
                      <li key={f.id} className="rounded-lg border border-border p-3">
                        <div className="flex flex-wrap items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">{f.childNames}</p>
                            <p className="text-xs text-muted">
                              {f.parentName}
                              {f.serviceName ? ` · ${f.serviceName}` : ""} · first day {dayLabel(f.firstDay)}
                            </p>
                          </div>
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold",
                              f.attendance === "absent"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
                                : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
                            )}
                          >
                            {f.attendance === "absent" ? "Didn't attend" : "Attended"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted">
                          {f.attendance === "absent"
                            ? "Find out what happened and help them rebook."
                            : "Ask how the first day went and if there's anything we can do better."}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {f.phone && (
                            <a
                              href={`tel:${f.phone.replace(/\s+/g, "")}`}
                              className="inline-flex min-h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-medium text-foreground hover:bg-surface"
                            >
                              <Phone className="h-3.5 w-3.5" aria-hidden /> {f.phone}
                            </a>
                          )}
                          <Button size="sm" disabled={firstDay.isPending} onClick={() => firstDay.mutate({ id: f.id, action: "called" })}>
                            We called them
                          </Button>
                          {f.attendance === "absent" && (
                            <Button size="sm" variant="outline" disabled={firstDay.isPending} onClick={() => firstDay.mutate({ id: f.id, action: "attended" })}>
                              They&apos;ve started now
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          {quiet.length > 0 && (
            <div className="min-w-0 space-y-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <PhoneCall className="h-4 w-4 text-brand" aria-hidden /> Quiet families
              </h3>
              <p className="text-xs text-muted">
                Families who stopped coming. We&apos;ve emailed them; here&apos;s what they told us. Find out why and help
                them back.
              </p>
              <ul className="space-y-2">
                {quiet.map((q) => (
                  <li key={q.childId} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{q.childName}</p>
                        <p className="text-xs text-muted">
                          {q.parentName}
                          {q.serviceName ? ` · ${q.serviceName}` : ""}
                          {q.lastSeen ? ` · last seen ${dayLabel(q.lastSeen)}` : ""}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold",
                          q.callNeeded
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
                            : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
                        )}
                      >
                        {q.reason ?? "No answer yet"}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {q.phone && (
                        <a
                          href={`tel:${q.phone.replace(/\s+/g, "")}`}
                          className="inline-flex min-h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-medium text-foreground hover:bg-surface"
                        >
                          <Phone className="h-3.5 w-3.5" aria-hidden /> {q.phone}
                        </a>
                      )}
                      <Button size="sm" disabled={quietCalled.isPending} onClick={() => quietCalled.mutate(q.childId)}>
                        We called them
                      </Button>
                      {q.enrolmentId && (
                        <Button size="sm" variant="ghost" onClick={() => onOpen(q.enrolmentId!)}>
                          Open
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
