"use client";

/**
 * Attendances → Staff: staff sign in & out (2026-10-09, Daniel: "where's the
 * staff sign in and sign out?"). Today's rostered shifts at the centre,
 * who's in and since when, and a big Clock in / Clock out per person.
 *
 * On the centre's shared login (front desk, door iPad) the person enters
 * their 4-digit clock-in PIN; on their own phone, their own row needs none.
 */
import { useState } from "react";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Delete, LogIn, LogOut } from "lucide-react";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/Dialog";

interface StaffShift {
  id: string;
  userId: string;
  name: string;
  avatar: string | null;
  hasPin: boolean;
  shiftStart: string;
  shiftEnd: string;
  sessionType: string;
  inAt: string | null;
  outAt: string | null;
}

const fmt = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
};

export function StaffSignInOut({ serviceId }: { serviceId: string }) {
  const { data: session } = useSession();
  const me = session?.user?.id;
  const qc = useQueryClient();
  const key = ["staff-clock", serviceId];
  const [pinFor, setPinFor] = useState<{ s: StaffShift; action: "in" | "out" } | null>(null);

  const { data, isLoading } = useQuery<{ shifts: StaffShift[] }>({
    queryKey: key,
    queryFn: () => fetchApi(`/api/services/${serviceId}/staff-clock`),
    refetchInterval: 30_000,
    retry: 2,
  });

  const clock = useMutation({
    mutationFn: (v: { s: StaffShift; action: "in" | "out"; pin?: string }) =>
      mutateApi(`/api/services/${serviceId}/staff-clock`, {
        method: "POST",
        body: { userId: v.s.userId, action: v.action, shiftId: v.s.id, ...(v.pin ? { pin: v.pin } : {}) },
      }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["centre-day", serviceId] });
      setPinFor(null);
      toast({ description: `${v.s.name.split(" ")[0]} clocked ${v.action}.` });
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });

  function press(s: StaffShift, action: "in" | "out") {
    if (s.userId === me) clock.mutate({ s, action });
    else setPinFor({ s, action });
  }

  const shifts = data?.shifts ?? [];
  const inNow = shifts.filter((s) => s.inAt && !s.outAt).length;

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        <b className="text-foreground">{inNow}</b> signed in · {shifts.length} rostered today. Tap your name, then your
        4-digit PIN.
      </p>
      {shifts.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted">
          Nobody is rostered here today.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {shifts.map((s) => {
            const state = s.outAt ? "gone" : s.inAt ? "in" : "due";
            return (
              <li
                key={s.id}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-3",
                  state === "in"
                    ? "border-green-200 bg-green-50/60 dark:border-green-900 dark:bg-green-950/30"
                    : "border-border bg-card",
                )}
              >
                {s.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Blob-hosted avatar
                  <img src={s.avatar} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand text-sm font-bold text-white">
                    {s.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-foreground">{s.name}</p>
                  <p className="text-xs text-muted">
                    Shift {fmt(s.shiftStart)}–{fmt(s.shiftEnd)}
                  </p>
                  <p className="text-xs font-medium">
                    {state === "gone" ? (
                      <span className="text-muted">
                        In {s.inAt} · Out {s.outAt}
                      </span>
                    ) : state === "in" ? (
                      <span className="text-green-800 dark:text-green-300">Signed in since {s.inAt}</span>
                    ) : (
                      <span className="text-amber-800 dark:text-amber-300">Not signed in yet</span>
                    )}
                  </p>
                </div>
                {state !== "gone" && (
                  <Button
                    size="lg"
                    variant={state === "in" ? "outline" : "primary"}
                    disabled={clock.isPending}
                    onClick={() => press(s, state === "in" ? "out" : "in")}
                    className="shrink-0"
                  >
                    {state === "in" ? <LogOut className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
                    {state === "in" ? "Clock out" : "Clock in"}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {pinFor && (
        <PinPad
          shift={pinFor.s}
          action={pinFor.action}
          busy={clock.isPending}
          onCancel={() => setPinFor(null)}
          onPin={(pin) => clock.mutate({ s: pinFor.s, action: pinFor.action, pin })}
        />
      )}
    </div>
  );
}

function PinPad({
  shift,
  action,
  busy,
  onCancel,
  onPin,
}: {
  shift: StaffShift;
  action: "in" | "out";
  busy: boolean;
  onCancel: () => void;
  onPin: (pin: string) => void;
}) {
  const [pin, setPin] = useState("");
  const press = (k: string) => {
    const next = k === "del" ? pin.slice(0, -1) : (pin + k).slice(0, 4);
    setPin(next);
    if (next.length === 4) {
      onPin(next);
      setPin("");
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogTitle>
          Clock {action} {shift.name.split(" ")[0]}
        </DialogTitle>
        <DialogDescription>
          {shift.hasPin
            ? "Enter your 4-digit clock-in PIN."
            : "No PIN set yet. Ask your Coordinator to set one in Staff → Manage staff."}
        </DialogDescription>
        {shift.hasPin && (
          <div className="mt-4 space-y-4">
            <div className="flex justify-center gap-3" aria-label={`${pin.length} of 4 digits`}>
              {Array.from({ length: 4 }).map((_, i) => (
                <span key={i} className={cn("h-4 w-4 rounded-full border-2 border-brand", i < pin.length && "bg-brand")} />
              ))}
            </div>
            <div className="mx-auto grid max-w-[15rem] grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"].map((k) =>
                k === "" ? (
                  <span key="blank" />
                ) : (
                  <button
                    key={k}
                    type="button"
                    disabled={busy}
                    aria-label={k === "del" ? "Delete" : k}
                    onClick={() => press(k)}
                    className="grid h-14 place-items-center rounded-xl bg-surface text-xl font-semibold active:bg-border"
                  >
                    {k === "del" ? <Delete className="h-5 w-5" /> : k}
                  </button>
                ),
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
