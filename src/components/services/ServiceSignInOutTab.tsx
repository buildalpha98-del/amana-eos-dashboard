"use client";

/**
 * Sign children in and out — the screen at the door.
 *
 * Regulation 158 requires a record of when a child was delivered and
 * collected AND who did it. Until now only staff could be recorded
 * (`signedInById` references a User), so a parent signing their own child
 * in couldn't be represented at all.
 *
 * Designed for a tablet held at arm's length: big rows, big targets, one
 * decision per child. Names are the largest thing on screen because that
 * is what someone is scanning for with a queue behind them.
 */

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, LogIn, LogOut, Loader2, Check } from "lucide-react";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";

type SessionType = "bsc" | "asc" | "vc";

const SESSION_LABEL: Record<SessionType, string> = {
  bsc: "Before school",
  asc: "After school",
  vc: "Vacation care",
};

/** Matches GET /api/attendance/roll-call → { records, summary }. */
interface RollRecord {
  childId: string;
  child: { firstName: string; surname: string };
  status: string;
  signInTime: string | null;
  signOutTime: string | null;
  signedInByName?: string | null;
  signedOutByName?: string | null;
}

const hhmm = (iso: string | null) =>
  iso ? new Date(iso).toISOString().slice(11, 16) : null;

export function ServiceSignInOutTab({
  serviceId,
  serviceName,
}: {
  serviceId: string;
  serviceName?: string;
}) {
  const qc = useQueryClient();
  const [session, setSession] = useState<SessionType>("asc");
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<{
    child: RollRecord;
    action: "in" | "out";
  } | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  const { data, isLoading } = useQuery<{ records: RollRecord[] }>({
    queryKey: ["roll", serviceId, today, session],
    queryFn: () =>
      fetchApi(
        `/api/attendance/roll-call?serviceId=${encodeURIComponent(serviceId)}` +
          `&date=${today}&sessionType=${session}`,
      ),
    retry: 1,
    // The door is a shared screen — someone else may have signed a child
    // in on another device thirty seconds ago.
    refetchInterval: 30_000,
  });

  const children = useMemo(() => {
    const list = data?.records ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) =>
      `${r.child.firstName} ${r.child.surname}`.toLowerCase().includes(q),
    );
  }, [data, search]);

  const stats = useMemo(() => {
    const list = data?.records ?? [];
    return {
      expected: list.length,
      in: list.filter((r) => r.signInTime && !r.signOutTime).length,
      out: list.filter((r) => r.signOutTime).length,
    };
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex gap-2">
          {(Object.keys(SESSION_LABEL) as SessionType[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSession(s)}
              aria-pressed={session === s}
              className={
                "px-4 min-h-11 rounded-lg border text-sm font-medium transition-colors " +
                (session === s
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-border bg-card text-muted hover:border-brand/40")
              }
            >
              {SESSION_LABEL[s]}
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/30" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a child…"
            aria-label="Find a child"
            className="w-full pl-9 pr-3 py-2.5 text-base border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </div>

        <p className="text-sm text-muted sm:ml-auto whitespace-nowrap">
          <strong className="text-foreground">{stats.in}</strong> in ·{" "}
          {stats.out} out · {stats.expected} expected
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : children.length === 0 ? (
        <EmptyState
          icon={LogIn}
          title="Nobody on the roll"
          description={
            search
              ? "No children match that search."
              : `No ${SESSION_LABEL[session].toLowerCase()} bookings today${serviceName ? ` at ${serviceName}` : ""}.`
          }
        />
      ) : (
        <ul className="space-y-2">
          {children.map((c) => {
            const inAt = hhmm(c.signInTime);
            const outAt = hhmm(c.signOutTime);
            const done = Boolean(outAt);
            return (
              <li
                key={c.childId}
                className="flex items-center gap-3 bg-card rounded-xl border border-border p-3"
              >
                <div className="min-w-0 flex-1">
                  {/* Deliberately large — this is scanned at arm's length
                      with a queue waiting. */}
                  <p className="text-base font-semibold text-foreground truncate">
                    {c.child.firstName} {c.child.surname}
                  </p>
                  <p className="text-xs text-muted truncate">
                    {done
                      ? `In ${inAt} · Out ${outAt}${c.signedOutByName ? ` · ${c.signedOutByName}` : ""}`
                      : inAt
                        ? `Signed in ${inAt}${c.signedInByName ? ` by ${c.signedInByName}` : ""}`
                        : "Not yet arrived"}
                  </p>
                </div>

                {done ? (
                  <span className="inline-flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400 shrink-0 pr-2">
                    <Check className="w-4 h-4" /> Done
                  </span>
                ) : (
                  <Button
                    variant={inAt ? "outline" : "primary"}
                    onClick={() =>
                      setPending({ child: c, action: inAt ? "out" : "in" })
                    }
                    className="shrink-0"
                  >
                    {inAt ? (
                      <><LogOut className="w-4 h-4" /> Sign out</>
                    ) : (
                      <><LogIn className="w-4 h-4" /> Sign in</>
                    )}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {pending && (
        <SignDialog
          serviceId={serviceId}
          sessionType={session}
          date={today}
          child={pending.child}
          action={pending.action}
          onDone={() => {
            setPending(null);
            qc.invalidateQueries({ queryKey: ["roll", serviceId] });
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}

/**
 * Captures WHO is signing. This is the part Reg 158 actually cares about
 * and the part that didn't exist — the name is required, not optional,
 * because "signed in at 3:42pm by nobody in particular" isn't a record.
 */
function SignDialog({
  serviceId,
  sessionType,
  date,
  child,
  action,
  onDone,
  onCancel,
}: {
  serviceId: string;
  sessionType: SessionType;
  date: string;
  child: RollRecord;
  action: "in" | "out";
  onDone: () => void;
  onCancel: () => void;
}) {
  // Pre-fill the sign-out with whoever signed in — usually the same
  // person, and it saves retyping at the busiest moment of the day.
  const [name, setName] = useState(
    action === "out" ? (child.signedInByName ?? "") : "",
  );

  const sign = useMutation({
    mutationFn: () =>
      // The EXISTING roll-call endpoint, extended to record who signed —
      // not a parallel route. Two ways to sign a child in is exactly the
      // duplication that makes a roll untrustworthy.
      mutateApi("/api/attendance/roll-call", {
        method: "POST",
        body: {
          childId: child.childId,
          serviceId,
          date,
          sessionType,
          action: action === "in" ? "sign_in" : "sign_out",
          signedByName: name.trim(),
          signMethod: "staff",
        },
      }),
    onSuccess: () => {
      toast({
        description: `${child.child.firstName} signed ${action === "in" ? "in" : "out"}.`,
      });
      onDone();
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogTitle>
          Sign {action === "in" ? "in" : "out"} {child.child.firstName}
        </DialogTitle>
        <DialogDescription>
          {action === "in"
            ? "Who is dropping off? This is recorded on the attendance register."
            : "Who is collecting? They must be an authorised person."}
        </DialogDescription>

        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="sign-name" className="block text-sm font-medium mb-1">
              Name of person {action === "in" ? "dropping off" : "collecting"}
            </label>
            <input
              id="sign-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              className="w-full px-3 py-3 text-base border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              onClick={() => sign.mutate()}
              disabled={!name.trim() || sign.isPending}
            >
              {sign.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              ) : (
                `Confirm sign ${action === "in" ? "in" : "out"}`
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
