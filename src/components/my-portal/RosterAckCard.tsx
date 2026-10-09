"use client";

/**
 * "I've seen my shifts" (2026-10-09, OWNA parity). Shows only when the
 * educator has new or changed shifts in the next two weeks that they
 * haven't confirmed; one tap confirms them all. The Coordinator sees who
 * hasn't on the roster.
 */
import { CalendarCheck } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { Button } from "@/components/ui/Button";
import { addDaysUTC, serviceDateOnly, serviceTodayISO } from "@/lib/timezone";

interface MineShift {
  id: string;
  date: string;
  shiftStart: string;
  shiftEnd: string;
  sessionType: string;
  status: string;
  acknowledgedAt: string | null;
  service?: { name: string } | null;
}

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const fmtTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
};

export function RosterAckCard({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const from = serviceTodayISO();
  const to = addDaysUTC(serviceDateOnly(), 13).toISOString().slice(0, 10);
  const key = ["roster-ack", userId, from];

  const { data } = useQuery<{ shifts: MineShift[] }>({
    queryKey: key,
    queryFn: () => fetchApi(`/api/roster/shifts/mine?from=${from}&to=${to}`),
    staleTime: 60_000,
    retry: 1,
  });

  const ack = useMutation({
    mutationFn: () => mutateApi("/api/roster/shifts/acknowledge", { method: "POST", body: { from, to } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast({ description: "Thanks — your Coordinator can see you've checked your shifts." });
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });

  const shifts = (data?.shifts ?? []).filter((s) => s.status === "published");
  const unseen = shifts.filter((s) => !s.acknowledgedAt);
  if (unseen.length === 0) return null;

  // Two shifts on one day is a split shift — say so, it's easy to miss one.
  const perDay = new Map<string, number>();
  for (const s of shifts) perDay.set(s.date.slice(0, 10), (perDay.get(s.date.slice(0, 10)) ?? 0) + 1);

  return (
    <section className="rounded-xl border-2 border-accent bg-card p-4" aria-labelledby="roster-ack">
      <div className="flex items-start gap-3">
        <CalendarCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 id="roster-ack" className="font-heading font-semibold text-foreground">
            {unseen.length === 1 ? "1 new or changed shift" : `${unseen.length} new or changed shifts`}
          </h3>
          <ul className="mt-2 space-y-1 text-sm">
            {unseen.map((s) => (
              <li key={s.id} className="flex flex-wrap gap-x-2 text-foreground">
                <span className="font-medium">{fmtDay(s.date)}</span>
                <span className="text-muted">
                  {fmtTime(s.shiftStart)}–{fmtTime(s.shiftEnd)}
                  {s.service?.name ? ` · ${s.service.name}` : ""}
                </span>
                {(perDay.get(s.date.slice(0, 10)) ?? 0) > 1 && (
                  <span className="rounded-full bg-surface px-2 text-2xs font-semibold text-foreground">split shift</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <Button className="mt-3 w-full bg-accent text-brand hover:bg-accent/90" size="lg" onClick={() => ack.mutate()} disabled={ack.isPending}>
        {ack.isPending ? "Saving…" : "I've seen my shifts"}
      </Button>
    </section>
  );
}
