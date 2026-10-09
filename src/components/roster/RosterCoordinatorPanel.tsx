"use client";

/**
 * The Coordinator's strip above the weekly grid (2026-10-09, OWNA parity):
 * who has seen this week's shifts (and a one-tap reminder), and who has put
 * their hand up for each open shift (one tap to give it to them).
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { BellRing, CalendarCheck, Hand } from "lucide-react";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { Button } from "@/components/ui/Button";
import { useAwardShift, useOpenShifts } from "@/hooks/useOpenShifts";
import { addDaysUTC } from "@/lib/timezone";

interface AckStatus {
  people: { userId: string; name: string; shifts: number; unseen: number }[];
  seen: number;
  total: number;
}

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export function RosterCoordinatorPanel({ serviceId, weekStart }: { serviceId: string; weekStart: string }) {
  const weekEnd = addDaysUTC(new Date(`${weekStart}T00:00:00Z`), 6).toISOString().slice(0, 10);
  const qs = `serviceId=${encodeURIComponent(serviceId)}&from=${weekStart}&to=${weekEnd}`;

  const { data: ack } = useQuery<AckStatus>({
    queryKey: ["roster-ack-status", serviceId, weekStart],
    queryFn: () => fetchApi(`/api/roster/acknowledgements?${qs}`),
    staleTime: 60_000,
    retry: 1,
  });
  const remind = useMutation({
    mutationFn: () =>
      mutateApi<{ reminded: number }>("/api/roster/acknowledgements", {
        method: "POST",
        body: { serviceId, from: weekStart, to: weekEnd },
      }),
    onSuccess: (r) =>
      toast({ description: r.reminded === 1 ? "Reminder sent to 1 person." : `Reminders sent to ${r.reminded} people.` }),
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });

  const { data: open } = useOpenShifts(21);
  const award = useAwardShift();
  const requests = (open?.shifts ?? []).filter(
    (s) =>
      s.serviceId === serviceId &&
      s.date.slice(0, 10) >= weekStart &&
      s.date.slice(0, 10) <= weekEnd &&
      (s.interested?.length ?? 0) > 0,
  );

  const unseen = (ack?.people ?? []).filter((p) => p.unseen > 0);
  if (!ack?.total && requests.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {ack && ack.total > 0 && (
        <section className="rounded-xl border border-border bg-card p-3" aria-label="Who has seen their shifts">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <CalendarCheck className="h-4 w-4 text-brand" aria-hidden />
            Seen by {ack.seen} of {ack.total}
          </p>
          {unseen.length > 0 ? (
            <>
              <p className="mt-1 text-sm text-muted">
                Not yet: {unseen.map((p) => p.name).join(", ")}
              </p>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => remind.mutate()} disabled={remind.isPending}>
                <BellRing className="h-4 w-4" />
                Remind them
              </Button>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted">Everyone has checked this week&rsquo;s shifts.</p>
          )}
        </section>
      )}

      {requests.length > 0 && (
        <section className="rounded-xl border border-accent bg-card p-3" aria-label="Open shift requests">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Hand className="h-4 w-4 text-brand" aria-hidden />
            Open shifts people want
          </p>
          <ul className="mt-2 space-y-3">
            {requests.map((s) => (
              <li key={s.id} className="text-sm">
                <p className="text-foreground">
                  <span className="font-medium">{fmtDay(s.date)}</span>{" "}
                  <span className="text-muted">
                    {s.shiftStart}–{s.shiftEnd}
                  </span>
                </p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {s.interested!.map((p) => (
                    <Button
                      key={p.userId}
                      size="sm"
                      variant="secondary"
                      disabled={award.isPending}
                      onClick={() => award.mutate({ shiftId: s.id, userId: p.userId, name: p.name })}
                    >
                      Give it to {p.name.split(" ")[0]}
                    </Button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
